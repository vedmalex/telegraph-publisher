import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join, basename, resolve, extname } from "node:path";
import type { TelegraphNode } from "../telegraphPublisher";
import { ContentProcessor } from "../content/ContentProcessor";
import { MetadataManager } from "../metadata/MetadataManager";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { DependencyManager } from "../dependencies/DependencyManager";
import { LinkResolver } from "../links/LinkResolver";
import { PathResolver } from "../utils/PathResolver";

/**
 * EPUB Generator that reuses the existing Telegraph publication mechanism
 * Converts TelegraphNode JSON structure to EPUB format
 */
export class EpubGenerator {
	private outputPath: string;
	private title: string;
	private author: string;
	private language: string;
	private identifier: string;
	private cover?: string;
	private debug?: boolean;
	private chapters: Array<{ title: string; content: TelegraphNode[]; id: string; sourcePath: string }> = [];

	constructor(options: {
		outputPath: string;
		title: string;
		author: string;
		language?: string;
		identifier?: string;
		cover?: string;
		debug?: boolean;
	}) {
		this.outputPath = resolve(options.outputPath);
		this.title = options.title;
		this.author = options.author;
		this.language = options.language || "ru";
		this.identifier = options.identifier || `epub-${Date.now()}`;
		this.cover = options.cover ? resolve(options.cover) : undefined;
		this.debug = options.debug;
	}

	/**
	 * Add a chapter from markdown file, reusing the same processing pipeline as Telegraph publication
	 */
	async addChapterFromFile(filePath: string, options: {
		generateToc?: boolean;
		tocTitle?: string;
		tocSeparators?: boolean;
	} = {}): Promise<void> {
		// Reuse the same processing pipeline as Telegraph publication:
		// - parse metadata
		// - remove front-matter
		// - remove duplicate H1 that equals metadata title
		const processedContent = ContentProcessor.processFile(filePath);
		const contentWithoutMetadata = processedContent.contentWithoutMetadata;

		// Use the same title extraction strategy as publish:
		// metadata.title → first heading/bold line → short first line → filename.
		let chapterTitle = ContentProcessor.extractTitle(processedContent) || basename(filePath, ".md");

		// Remove duplicate top-level heading that matches the chosen chapter title
		// so that EPUB does not contain both <h1> and a converted markdown heading
		// with the same text.
		const contentWithoutDuplicateTitle = ContentProcessor.removeDuplicateTitle(
			contentWithoutMetadata,
			chapterTitle
		);

		// Convert markdown to TelegraphNode[] (reusing the same converter and ToC options)
		const nodes = convertMarkdownToTelegraphNodes(contentWithoutDuplicateTitle, {
			generateToc: options.generateToc !== false, // Default to true if not explicitly disabled
			tocTitle: options.tocTitle,
			tocSeparators: options.tocSeparators !== false,
		});

		// Optional debug: save raw TelegraphNode JSON for EPUB content,
		// similar to publish debug mode, but with .epub.json suffix for clarity.
		if (this.debug) {
			const jsonOutputPath = resolve(filePath.replace(/\.md$/i, ".epub.json"));
			try {
				writeFileSync(jsonOutputPath, JSON.stringify(nodes, null, 2), "utf-8");
				// Do not use ProgressIndicator here to keep EPUB generator decoupled from CLI UI.
			} catch {
				// Swallow debug JSON errors to avoid breaking EPUB generation.
			}
		}

		// Resolve local links (same as Telegraph publication)
		const linkResolver = new LinkResolver();
		const resolvedNodes = await this.resolveLinksInNodes(nodes, filePath, linkResolver);

		const chapterId = `chapter-${this.chapters.length + 1}`;

		this.chapters.push({
			title: chapterTitle,
			content: resolvedNodes,
			id: chapterId,
			sourcePath: resolve(filePath),
		});
	}

	/**
	 * Resolve local links in nodes (reusing LinkResolver logic)
	 */
	private async resolveLinksInNodes(
		nodes: TelegraphNode[],
		sourcePath: string,
		linkResolver: LinkResolver
	): Promise<TelegraphNode[]> {
		const resolvedNodes: TelegraphNode[] = [];

		for (const node of nodes) {
			if (node.tag === "a" && node.attrs?.href) {
				const href = node.attrs.href;
				// Check if it's a local markdown link
				if (href.startsWith("./") || href.startsWith("../") || (!href.startsWith("http") && !href.startsWith("#"))) {
					// For EPUB, we convert local markdown links to internal chapter references
					// Create a temporary markdown content to use findLocalLinks
					const tempContent = `[link](${href})`;
					const localLinks = LinkResolver.findLocalLinks(tempContent, sourcePath);
					
					if (localLinks.length > 0 && localLinks[0]) {
						const resolvedPath = localLinks[0].resolvedPath;
						// Format: chapter-N.xhtml where N is the chapter index
						const chapterIndex = this.chapters.findIndex(ch => ch.sourcePath === resolvedPath);
						if (chapterIndex !== -1) {
							resolvedNodes.push({
								...node,
								attrs: {
									...node.attrs,
									href: `chapter-${chapterIndex + 1}.xhtml`,
								},
							});
							continue;
						}
					}
				}
			}

			// Recursively process children
			if (node.children) {
				const resolvedChildren: (string | TelegraphNode)[] = [];
				for (const child of node.children) {
					if (typeof child === "string") {
						resolvedChildren.push(child);
					} else {
						const resolvedChildNodes = await this.resolveLinksInNodes([child], sourcePath, linkResolver);
						resolvedChildren.push(...resolvedChildNodes);
					}
				}
				resolvedNodes.push({
					...node,
					children: resolvedChildren,
				});
			} else {
				resolvedNodes.push(node);
			}
		}

		return resolvedNodes;
	}

	/**
	 * Convert TelegraphNode to HTML string
	 */
	private nodeToHtml(node: TelegraphNode): string {
		if (typeof node === "string") {
			return this.escapeHtml(node);
		}

		const tag = node.tag || "p";
		const attrs = node.attrs || {};
		const children = node.children || [];

		// Build attributes string
		const attrsString = Object.entries(attrs)
			.map(([key, value]) => `${key}="${this.escapeHtml(value)}"`)
			.join(" ");

		// Convert children to HTML
		const childrenHtml = children
			.map((child) => {
				if (typeof child === "string") {
					return this.escapeHtml(child);
				}
				return this.nodeToHtml(child);
			})
			.join("");

		// Handle self-closing tags
		const selfClosingTags = ["br", "hr", "img"];
		if (selfClosingTags.includes(tag)) {
			return `<${tag}${attrsString ? ` ${attrsString}` : ""} />`;
		}

		return `<${tag}${attrsString ? ` ${attrsString}` : ""}>${childrenHtml}</${tag}>`;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	/**
	 * Generate EPUB file
	 */
	async generate(): Promise<void> {
		const epubDir = join(dirname(this.outputPath), `.epub-temp-${Date.now()}`);
		mkdirSync(epubDir, { recursive: true });

		try {
			// Create EPUB structure
			const metaInfDir = join(epubDir, "META-INF");
			const oebpsDir = join(epubDir, "OEBPS");
			mkdirSync(metaInfDir, { recursive: true });
			mkdirSync(oebpsDir, { recursive: true });

			// 1. mimetype (must be first, uncompressed)
			writeFileSync(join(epubDir, "mimetype"), "application/epub+zip", "utf-8");

			// 2. META-INF/container.xml
			writeFileSync(
				join(metaInfDir, "container.xml"),
				`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
	</rootfiles>
</container>`,
				"utf-8"
			);

			// 3. Generate HTML chapters
			const htmlFiles: string[] = [];
			for (const chapter of this.chapters) {
				const htmlContent = this.generateChapterHtml(chapter);
				const htmlFileName = `${chapter.id}.html`;
				writeFileSync(join(oebpsDir, htmlFileName), htmlContent, "utf-8");
				htmlFiles.push(htmlFileName);
			}

			// 4. Generate CSS
			const cssContent = this.generateCss();
			writeFileSync(join(oebpsDir, "style.css"), cssContent, "utf-8");

			// 5. Generate content.opf (package document)
			const opfContent = this.generateOpf(htmlFiles);
			writeFileSync(join(oebpsDir, "content.opf"), opfContent, "utf-8");

			// 6. Generate toc.ncx (navigation)
			const ncxContent = this.generateNcx();
			writeFileSync(join(oebpsDir, "toc.ncx"), ncxContent, "utf-8");

			// 7. Copy cover image if provided
			if (this.cover) {
				if (existsSync(this.cover)) {
					const coverFilename = `cover${extname(this.cover)}`;
					copyFileSync(this.cover, join(oebpsDir, coverFilename));
				} else {
					throw new Error(`Cover image file not found: ${this.cover}`);
				}
			}

			// 8. Create ZIP archive (using Bun's built-in ZIP support or manual ZIP creation)
			await this.createZipArchive(epubDir, this.outputPath);

			// Cleanup temp directory (unless in debug mode)
			if (this.debug) {
				console.log(`🔧 Debug mode: Temporary files kept at: ${epubDir}`);
				console.log(`   You can inspect the generated EPUB structure and HTML files there.`);
			} else {
				await this.cleanupDirectory(epubDir);
			}
		} catch (error) {
			// Cleanup on error (unless in debug mode)
			if (this.debug) {
				console.log(`🔧 Debug mode: Temporary files kept at: ${epubDir} (due to error)`);
				console.log(`   You can inspect the partial EPUB structure to debug the issue.`);
			} else {
				await this.cleanupDirectory(epubDir);
			}
			throw error;
		}
	}

	/**
	 * Generate HTML for a chapter
	 */
	private generateChapterHtml(chapter: { title: string; content: TelegraphNode[]; id: string }): string {
		const contentHtml = chapter.content.map((node) => this.nodeToHtml(node)).join("\n");

		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
	<meta charset="UTF-8"/>
	<title>${this.escapeHtml(chapter.title)}</title>
	<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
	<h1 id="${chapter.id}">${this.escapeHtml(chapter.title)}</h1>
	${contentHtml}
</body>
</html>`;
	}

	/**
	 * Generate CSS styles
	 */
	private generateCss(): string {
		return `body {
	font-family: Georgia, serif;
	line-height: 1.6;
	margin: 1em;
	padding: 0;
}

h1 {
	font-size: 2em;
	margin-top: 1em;
	margin-bottom: 0.5em;
}

h2, h3, h4 {
	margin-top: 1em;
	margin-bottom: 0.5em;
}

h3 {
	font-size: 1.5em;
}

h4 {
	font-size: 1.2em;
}

p {
	margin: 1em 0;
	text-align: justify;
}

ul, ol {
	margin: 1em 0;
	padding-left: 2em;
}

li {
	margin: 0.5em 0;
}

a {
	color: #0066cc;
	text-decoration: none;
}

a:hover {
	text-decoration: underline;
}

hr {
	border: none;
	border-top: 1px solid #ccc;
	margin: 2em 0;
}

strong {
	font-weight: bold;
}

em {
	font-style: italic;
}

code {
	font-family: monospace;
	background-color: #f4f4f4;
	padding: 0.2em 0.4em;
	border-radius: 3px;
}

pre {
	background-color: #f4f4f4;
	padding: 1em;
	border-radius: 5px;
	overflow-x: auto;
}

blockquote {
	border-left: 4px solid #ccc;
	margin: 1em 0;
	padding-left: 1em;
	color: #666;
}`;
	}

	/**
	 * Generate content.opf (package document)
	 */
	private generateOpf(htmlFiles: string[]): string {
		const now = new Date().toISOString();
		let manifestItems = htmlFiles
			.map(
				(file, index) =>
					`		<item id="chapter-${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`
			)
			.join("\n");

		// Add cover image to manifest if provided
		if (this.cover) {
			const coverFilename = `cover${extname(this.cover)}`;
			manifestItems = `		<item id="cover" href="${coverFilename}" media-type="${this.getCoverMediaType()}" properties="cover-image"/>\n${manifestItems}`;
		}

		const spineItems = htmlFiles
			.map((_, index) => `		<itemref idref="chapter-${index + 1}"/>`)
			.join("\n");

		let guideSection = "";
		if (this.cover) {
			const coverFilename = `cover${extname(this.cover)}`;
			guideSection = `	<guide>
		<reference href="${coverFilename}" type="cover" title="Cover"/>
	</guide>`;
		}

		return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:title>${this.escapeHtml(this.title)}</dc:title>
		<dc:creator>${this.escapeHtml(this.author)}</dc:creator>
		<dc:language>${this.language}</dc:language>
		<dc:identifier id="book-id">${this.identifier}</dc:identifier>
		<meta property="dcterms:modified">${now}</meta>
	</metadata>
	<manifest>
		<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
		<item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
	</manifest>
	<spine toc="ncx">
${spineItems}
	</spine>
${guideSection}
</package>`;
	}

	/**
	 * Get media type for cover image
	 */
	private getCoverMediaType(): string {
		if (!this.cover) return "image/jpeg"; // default

		const ext = extname(this.cover).toLowerCase();
		switch (ext) {
			case ".jpg":
			case ".jpeg":
				return "image/jpeg";
			case ".png":
				return "image/png";
			default:
				return "image/jpeg"; // fallback
		}
	}

	/**
	 * Generate toc.ncx (navigation)
	 */
	private generateNcx(): string {
		const navPoints = this.chapters
			.map(
				(chapter, index) => `		<navPoint id="nav-${index + 1}" playOrder="${index + 1}">
			<navLabel>
				<text>${this.escapeHtml(chapter.title)}</text>
			</navLabel>
			<content src="${chapter.id}.html"/>
		</navPoint>`
			)
			.join("\n");

		return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<head>
		<meta name="dtb:uid" content="${this.identifier}"/>
		<meta name="dtb:depth" content="1"/>
		<meta name="dtb:totalPageCount" content="0"/>
		<meta name="dtb:maxPageNumber" content="0"/>
	</head>
	<docTitle>
		<text>${this.escapeHtml(this.title)}</text>
	</docTitle>
	<navMap>
${navPoints}
	</navMap>
</ncx>`;
	}

	/**
	 * Create ZIP archive from directory
	 * Uses manual ZIP creation without external dependencies
	 */
	private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
		// Use Bun's shell capabilities if available
		if (typeof Bun !== "undefined" && (Bun as any).$) {
			try {
				const $ = (Bun as any).$;
				// Try using zip command
				const result = await $`cd ${sourceDir} && zip -r ${outputPath} . -x "*.DS_Store"`.quiet();
				if (result.exitCode === 0) {
					return;
				}
			} catch {
				// Fall through to manual ZIP creation
			}
		}

		// Manual ZIP creation using standard ZIP format
		await this.createZipManually(sourceDir, outputPath);
	}

	/**
	 * Create ZIP archive manually without external dependencies
	 */
	private async createZipManually(sourceDir: string, outputPath: string): Promise<void> {
		const { readdir, readFile } = await import("node:fs/promises");
		const { relative } = await import("node:path");
		const { createWriteStream } = await import("node:fs");

		// Collect all files recursively
		const files: Array<{ content: Buffer; zipPath: string }> = [];

		const collectFiles = async (dir: string, baseDir: string): Promise<void> => {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				const relativePath = relative(baseDir, fullPath);

				if (entry.isDirectory()) {
					await collectFiles(fullPath, baseDir);
				} else {
					const content = await readFile(fullPath);
					files.push({
						content,
						zipPath: relativePath.replace(/\\/g, "/"),
					});
				}
			}
		};

		await collectFiles(sourceDir, sourceDir);

		// Write ZIP file
		const writeStream = createWriteStream(outputPath);
		const centralDirBuffers: Buffer[] = [];
		let currentOffset = 0;

		// Write each file with local header
		for (const file of files) {
			const fileNameBytes = Buffer.from(file.zipPath, "utf-8");
			const crc32 = this.calculateCrc32(file.content);
			const fileSize = file.content.length;

			// Write local file header
			const localHeader = Buffer.alloc(30 + fileNameBytes.length);
			localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
			localHeader.writeUInt16LE(20, 4); // Version needed to extract
			localHeader.writeUInt16LE(0, 6); // General purpose bit flag
			localHeader.writeUInt16LE(0, 8); // Compression method (store)
			localHeader.writeUInt16LE(0, 10); // Last mod time
			localHeader.writeUInt16LE(0, 12); // Last mod date
			localHeader.writeUInt32LE(crc32, 14); // CRC-32
			localHeader.writeUInt32LE(fileSize, 18); // Compressed size
			localHeader.writeUInt32LE(fileSize, 22); // Uncompressed size
			localHeader.writeUInt16LE(fileNameBytes.length, 26); // File name length
			localHeader.writeUInt16LE(0, 28); // Extra field length
			fileNameBytes.copy(localHeader, 30);

			writeStream.write(localHeader);
			writeStream.write(file.content);

			// Create central directory entry
			const centralEntry = Buffer.alloc(46 + fileNameBytes.length);
			centralEntry.writeUInt32LE(0x02014b50, 0); // Central file header signature
			centralEntry.writeUInt16LE(20, 4); // Version made by
			centralEntry.writeUInt16LE(20, 6); // Version needed
			centralEntry.writeUInt16LE(0, 8); // General purpose bit flag
			centralEntry.writeUInt16LE(0, 10); // Compression method
			centralEntry.writeUInt16LE(0, 12); // Last mod time
			centralEntry.writeUInt16LE(0, 14); // Last mod date
			centralEntry.writeUInt32LE(crc32, 16); // CRC-32
			centralEntry.writeUInt32LE(fileSize, 20); // Compressed size
			centralEntry.writeUInt32LE(fileSize, 24); // Uncompressed size
			centralEntry.writeUInt16LE(fileNameBytes.length, 28); // File name length
			centralEntry.writeUInt16LE(0, 30); // Extra field length
			centralEntry.writeUInt16LE(0, 32); // File comment length
			centralEntry.writeUInt16LE(0, 34); // Disk number start
			centralEntry.writeUInt16LE(0, 36); // Internal file attributes
			centralEntry.writeUInt32LE(0, 38); // External file attributes
			centralEntry.writeUInt32LE(currentOffset, 42); // Relative offset of local header
			fileNameBytes.copy(centralEntry, 46);

			centralDirBuffers.push(centralEntry);
			currentOffset += localHeader.length + fileSize;
		}

		// Write central directory
		for (const buf of centralDirBuffers) {
			writeStream.write(buf);
		}

		// Write end of central directory record
		const centralDirSize = centralDirBuffers.reduce((sum, buf) => sum + buf.length, 0);
		const endRecord = Buffer.alloc(22);
		endRecord.writeUInt32LE(0x06054b50, 0); // End of central directory signature
		endRecord.writeUInt16LE(0, 4); // Number of this disk
		endRecord.writeUInt16LE(0, 6); // Disk with start of central directory
		endRecord.writeUInt16LE(files.length, 8); // Number of central directory records on this disk
		endRecord.writeUInt16LE(files.length, 10); // Total number of central directory records
		endRecord.writeUInt32LE(centralDirSize, 12); // Size of central directory
		endRecord.writeUInt32LE(currentOffset, 16); // Offset of start of central directory
		endRecord.writeUInt16LE(0, 20); // ZIP file comment length

		writeStream.write(endRecord);
		writeStream.end();

		// Wait for stream to finish
		await new Promise<void>((resolve, reject) => {
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
		});
	}

	/**
	 * Calculate CRC-32 checksum
	 */
	private calculateCrc32(buffer: Buffer): number {
		let crc = 0xffffffff;
		const crcTable: number[] = Array(256).fill(0);

		// Generate CRC table
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let j = 0; j < 8; j++) {
				c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			}
			crcTable[i] = c;
		}

		// Calculate CRC
		for (let i = 0; i < buffer.length; i++) {
			const byte = buffer[i];
			const tableIndex = ((crc ^ (byte ?? 0)) & 0xff);
			const tableValue = crcTable[tableIndex];
			if (tableValue !== undefined) {
				crc = tableValue ^ (crc >>> 8);
			}
		}

		return (crc ^ 0xffffffff) >>> 0;
	}

	/**
	 * Cleanup temporary directory
	 */
	private async cleanupDirectory(dir: string): Promise<void> {
		if (typeof Bun !== "undefined" && (Bun as any).$) {
			const $ = (Bun as any).$;
			await $`rm -rf ${dir}`.quiet();
		} else {
			// Use Node.js fs.rmSync if available, or manual deletion
			const { rmSync } = await import("node:fs");
			if (rmSync) {
				rmSync(dir, { recursive: true, force: true });
			}
		}
	}
}
