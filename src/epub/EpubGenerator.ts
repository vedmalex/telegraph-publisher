import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { ContentProcessor } from "../content/ContentProcessor";
import { DependencyManager } from "../dependencies/DependencyManager";
import { LinkResolver } from "../links/LinkResolver";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { MetadataManager } from "../metadata/MetadataManager";
import type { TelegraphNode } from "../telegraphPublisher";
import { AnchorGenerator, type HeadingInfo } from "../utils/AnchorGenerator";
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
	private tocDepth: number;
	private splitAt?: number;
	private bookToc?: "start" | "end";
	private bookTocDepth: number = 2;
	private bookTocTitle: string = "Содержание";
	private chapters: Array<{
		title: string;
		content: TelegraphNode[];
		id: string;
		sourcePath: string;
		headings: HeadingInfo[];
		headingAnchor?: string;
	}> = [];
	private chapterPathMap: Map<string, string> = new Map();

	constructor(options: {
		outputPath: string;
		title: string;
		author: string;
		language?: string;
		identifier?: string;
		cover?: string;
		debug?: boolean;
		/** Deepest heading level to include in the reader's navigation (toc.ncx).
		 * Unset means every heading, which in a volume where each verse is a
		 * heading produces tens of thousands of navigation points. */
		tocDepth?: number;
		/** Split each input file into separate xhtml documents at headings of this
		 * level or shallower. Unset keeps one document per file, which for a book
		 * where every verse is a heading means a single multi-megabyte document. */
		splitAt?: number;
		/** Where a whole-book contents page goes: "start", "end", or absent for none. */
		bookToc?: "start" | "end";
		/** Deepest heading level on the whole-book contents page. */
		bookTocDepth?: number;
		/** Heading of the whole-book contents page. */
		bookTocTitle?: string;
	}) {
		this.outputPath = resolve(options.outputPath);
		this.title = options.title;
		this.author = options.author;
		this.language = options.language || "ru";
		this.identifier = options.identifier || `epub-${Date.now()}`;
		this.cover = options.cover ? resolve(options.cover) : undefined;
		this.debug = options.debug;
		this.tocDepth = options.tocDepth ?? Number.POSITIVE_INFINITY;
		this.splitAt = options.splitAt;
		this.bookToc = options.bookToc;
		// The book page defaults to the navigation's own depth: it is the same
		// list, and a book with 12 000 verse headings must not open with them.
		this.bookTocDepth = options.bookTocDepth ?? (Number.isFinite(this.tocDepth) ? this.tocDepth : 2);
		this.bookTocTitle = options.bookTocTitle ?? "Содержание";
	}

	/**
	 * Transform legacy list-based table representation (ol/li/ul/li "Header: Value")
	 * into semantic table nodes for EPUB output.
	 */
	private transformListTables(nodes: TelegraphNode[]): TelegraphNode[] {
		const transformNode = (node: TelegraphNode | string): TelegraphNode | string => {
			if (typeof node === "string") return node;

			if (node.tag === "ol") {
				const children = node.children || [];
				const liChildren = children.filter(
					(child) => typeof child === "object" && child && (child as TelegraphNode).tag === "li",
				) as TelegraphNode[];

				if (liChildren.length > 0) {
					let looksLikeTable = true;
					const rows: string[][] = [];

					for (const li of liChildren) {
						const liKids = li.children || [];
						const nestedUl = liKids.find(
							(child) => typeof child === "object" && child && (child as TelegraphNode).tag === "ul",
						) as TelegraphNode | undefined;

						if (!nestedUl) {
							looksLikeTable = false;
							break;
						}

						const cellLis = (nestedUl.children || []).filter(
							(child) => typeof child === "object" && child && (child as TelegraphNode).tag === "li",
						) as TelegraphNode[];

						if (cellLis.length === 0) {
							looksLikeTable = false;
							break;
						}

						const rowValues: string[] = [];
						for (const cellLi of cellLis) {
							const cellChildren = cellLi.children || [];
							const first = cellChildren[0];
							if (typeof first !== "string") {
								looksLikeTable = false;
								break;
							}
							const raw = first;
							const sepIndex = raw.indexOf(":");
							if (sepIndex === -1) {
								looksLikeTable = false;
								break;
							}
							const headerPart = raw.slice(0, sepIndex).trim();
							const valuePart = raw.slice(sepIndex + 1).trim();
							rowValues.push(`${headerPart}:${valuePart}`);
						}

						if (!looksLikeTable) {
							break;
						}

						rows.push(rowValues);
					}

					if (looksLikeTable && rows.length > 0) {
						const headerRow = rows[0];
						const headers: string[] = [];
						for (const cell of headerRow) {
							const sepIndex = cell.indexOf(":");
							const headerText =
								sepIndex !== -1 ? cell.slice(0, sepIndex).trim() : cell.trim();
							headers.push(headerText);
						}

						const bodyRows: TelegraphNode[] = rows.map((row) => {
							const cellNodes: TelegraphNode[] = [];
							for (let i = 0; i < headers.length; i++) {
								const cell = row[i] || "";
								const sepIndex = cell.indexOf(":");
								const valueText =
									sepIndex !== -1 ? cell.slice(sepIndex + 1).trim() : cell.trim();
								cellNodes.push({
									tag: "td",
									children: [valueText],
								});
							}
							return {
								tag: "tr",
								children: cellNodes,
							};
						});

						const headerCells: TelegraphNode[] = headers.map((header) => ({
							tag: "th",
							children: [header],
						}));

						return {
							tag: "table",
							children: [
								{
									tag: "thead",
									children: [
										{
											tag: "tr",
											children: headerCells,
										},
									],
								},
								{
									tag: "tbody",
									children: bodyRows,
								},
							],
						};
					}
				}
			}

			if (node.children) {
				node.children = node.children.map((child) => transformNode(child));
			}
			return node;
		};

		return nodes.map((n) => transformNode(n) as TelegraphNode | string) as TelegraphNode[];
	}

	/**
	 * Debug helper: log basic statistics about tables and list-based
	 * table fallbacks for a given chapter. Enabled only when this.debug
	 * is true to avoid noisy output in normal runs.
	 */
	private debugLogTableSummary(sourcePath: string, nodes: TelegraphNode[]): void {
		if (!this.debug) return;

		let tableCount = 0;
		let olAsTableCount = 0;

		const visit = (node: TelegraphNode | string): void => {
			if (typeof node === "string") return;
			if (node.tag === "table") {
				tableCount++;
			}
			if (node.tag === "ol") {
				// Heuristic: ol where each li contains a nested ul with "header: value"
				const children = node.children || [];
				const liChildren = children.filter(
					(child) => typeof child === "object" && child && (child as TelegraphNode).tag === "li",
				) as TelegraphNode[];

				if (liChildren.length > 0) {
					let looksLikeTable = true;
					for (const li of liChildren) {
						const liKids = li.children || [];
						const nestedUl = liKids.find(
							(child) => typeof child === "object" && child && (child as TelegraphNode).tag === "ul",
						) as TelegraphNode | undefined;
						if (!nestedUl) {
							looksLikeTable = false;
							break;
						}
					}
					if (looksLikeTable) {
						olAsTableCount++;
					}
				}
			}

			if (node.children) {
				for (const child of node.children) {
					visit(child);
				}
			}
		};

		for (const n of nodes) {
			visit(n);
		}

		const fileName = basename(sourcePath);
		console.log(
			`[EPUB DEBUG] ${fileName}: tables=${tableCount}, ol-as-table=${olAsTableCount}`,
		);
	}

	/**
	 * Provide an explicit mapping between source markdown files and their
	 * corresponding chapter HTML filenames (e.g. /abs/path.md -> chapter-3.html).
	 * This allows internal links to be rewritten correctly even when the
	 * target chapter is added later in the pipeline.
	 */
	setChapterPathMap(mapping: Record<string, string>): void {
		this.chapterPathMap = new Map<string, string>();
		for (const [key, value] of Object.entries(mapping)) {
			if (key && value) {
				this.chapterPathMap.set(resolve(key), value);
			}
		}
	}

	/**
	 * Add a chapter from markdown file, reusing the same processing pipeline as Telegraph publication
	 */
	async addChapterFromFile(filePath: string, options: {
		generateToc?: boolean;
		inlineToC?: boolean;
		tocTitle?: string;
		tocSeparators?: boolean;
	} = {}): Promise<void> {
		if (this.debug) console.log(`[EPUB DEBUG] Processing chapter file: ${filePath}`);

		// Reuse the same processing pipeline as Telegraph publication:
		// - parse metadata
		// - remove front-matter
		// - remove duplicate H1 that equals metadata title
		const processedContent = ContentProcessor.processFile(filePath);
		const contentWithoutMetadata = processedContent.contentWithoutMetadata;

		// Use the same title extraction strategy as publish:
		// metadata.title → first heading/bold line → short first line → filename.
		const chapterTitle = ContentProcessor.extractTitle(processedContent) || basename(filePath, ".md");

		// Remove duplicate top-level heading that matches the chosen chapter title
		// so that EPUB does not contain both <h1> and a converted markdown heading
		// with the same text.
		const contentWithoutDuplicateTitle = ContentProcessor.removeDuplicateTitle(
			contentWithoutMetadata,
			chapterTitle
		);

		// A book may be split into several xhtml documents. Readers load a whole
		// document at once, so a single 16 MB file stalls them; the EPUB guidance
		// is to stay near 300 KB per document.
		if (this.splitAt) {
			const parts = EpubGenerator.splitMarkdownByHeading(contentWithoutDuplicateTitle, this.splitAt);
			if (parts.length > 1) {
				for (const [index, part] of parts.entries()) {
					const partTitle = part.title || (index === 0 ? chapterTitle : `${chapterTitle} — ${index + 1}`);
					// Give the document's heading the anchor the original heading had,
					// so links written against it keep working after the split.
					const anchor = part.headingLine
						? AnchorGenerator.generateAsciiAnchor(AnchorGenerator.extractHeadingInfo(
							part.headingLine.match(/^(#{1,6})\s+(.*)$/)!))
						: undefined;
					await this.addChapterPart(part.content, partTitle, filePath, options, index === 0, anchor);
				}
				return;
			}
		}

		await this.addChapterPart(contentWithoutDuplicateTitle, chapterTitle, filePath, options, true);
	}

	/**
	 * Splits markdown at headings of the given level or shallower.
	 *
	 * Anything before the first such heading stays with the opening part, so a
	 * preface or an epigraph is not lost.
	 */
	static splitMarkdownByHeading(markdown: string, level: number): Array<{ title: string; headingLine: string; content: string }> {
		const lines = markdown.split(/\r?\n/);
		const parts: Array<{ title: string; headingLine: string; content: string[] }> = [];
		let current: { title: string; headingLine: string; content: string[] } | null = null;
		let inFence = false;

		for (const line of lines) {
			if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

			const heading = inFence ? null : line.match(/^(#{1,6})\s+(.*)$/);
			if (heading && heading[1]!.length <= level) {
				if (current) parts.push(current);
				// The heading line is kept aside, not in the body: it becomes the
				// document's own <h1>, and leaving it in would print it twice.
				current = { title: heading[2]!.trim(), headingLine: line, content: [] };
				continue;
			}

			if (!current) current = { title: "", headingLine: "", content: [] };
			current.content.push(line);
		}
		if (current) parts.push(current);

		return parts
			.filter(part => part.title !== "" || part.content.join("\n").trim() !== "")
			.map(part => ({
				title: part.title,
				headingLine: part.headingLine,
				content: part.content.join("\n"),
			}));
	}

	/**
	 * Converts one piece of markdown into a chapter document.
	 *
	 * `isFirstOfFile` marks the piece that other files' links should point at:
	 * a link to the source file must land on its opening document, not on
	 * whichever piece happens to be registered last.
	 */
	private async addChapterPart(
		contentWithoutDuplicateTitle: string,
		chapterTitle: string,
		filePath: string,
		options: {
			generateToc?: boolean;
			inlineToC?: boolean;
			tocTitle?: string;
			tocSeparators?: boolean;
			tocPosition?: "start" | "end" | "both";
			tocDepth?: number;
			tocNested?: boolean;
			tocMode?: "full" | "blocks";
			navCaption?: string;
			navThreshold?: number;
			navMaxItems?: number;
		},
		isFirstOfFile: boolean,
		headingAnchor?: string,
	): Promise<void> {
		// Extract headings using AnchorGenerator for TOC generation
		// We use contentWithoutDuplicateTitle to avoid duplicating the chapter title in TOC
		const headings = AnchorGenerator.parseHeadingsFromContent(contentWithoutDuplicateTitle);
		if (this.debug) {
			console.log(`[EPUB DEBUG] Headings found in ${basename(filePath)}:`, headings.length);
		}

		// Convert markdown to TelegraphNode[] (reusing the same converter and ToC options)
		const nodesRaw = convertMarkdownToTelegraphNodes(contentWithoutDuplicateTitle, {
			generateToc: options.generateToc !== false, // Default to true if not explicitly disabled
			inlineToC: options.inlineToC === true, // Default to false for EPUB, true only if explicitly enabled
			tocTitle: options.tocTitle,
			tocSeparators: options.tocSeparators !== false,
			tocPosition: options.tocPosition,
			tocDepth: options.tocDepth,
			tocNested: options.tocNested,
			tocMode: options.tocMode,
			navCaption: options.navCaption,
			navThreshold: options.navThreshold,
			navMaxItems: options.navMaxItems,
			target: "epub",
		});

		// Transform legacy list-based tables into semantic tables for EPUB
		const nodes = this.transformListTables(nodesRaw);

		// Debug summary for table detection/parsing
		this.debugLogTableSummary(filePath, nodes);

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


		const chapterId = `chapter-${this.chapters.length + 1}`;

		// Links from other files must land on the document a file starts with.
		// The mapping cannot be computed up front once splitting is on: how many
		// documents a file becomes is only known after it has been split.
		if (isFirstOfFile) {
			this.chapterPathMap.set(resolve(filePath), `${chapterId}.html`);
		}

		this.chapters.push({
			title: chapterTitle,
			content: nodes,
			id: chapterId,
			sourcePath: resolve(filePath),
			headings: headings,
			headingAnchor,
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
				const originalHref = node.attrs.href;
				// Check if it's a local markdown-style link (not http/https/mailto/etc., not pure anchor)
				if (originalHref.startsWith("./") || originalHref.startsWith("../") || (!originalHref.startsWith("http") && !originalHref.startsWith("#"))) {
					// For EPUB, we convert local markdown links to internal chapter references.
					// Create a temporary markdown content to use findLocalLinks.
					const tempContent = `[link](${originalHref})`;
					const localLinks = LinkResolver.findLocalLinks(tempContent, sourcePath);

					if (localLinks.length > 0 && localLinks[0]) {
						const resolvedWithAnchor = localLinks[0].resolvedPath;
						const anchorIndex = resolvedWithAnchor.indexOf("#");
						const resolvedPath = anchorIndex !== -1
							? resolvedWithAnchor.substring(0, anchorIndex)
							: resolvedWithAnchor;
						const anchorSuffix = anchorIndex !== -1
							? resolvedWithAnchor.substring(anchorIndex)
							: "";

						// Prefer explicit chapter mapping when available
						const mappedHref = this.chapterPathMap.get(resolvedPath);
						if (mappedHref) {
							resolvedNodes.push({
								...node,
								attrs: {
									...node.attrs,
									href: `${mappedHref}${anchorSuffix}`,
								},
							});
							continue;
						}

						// Fallback: attempt to locate chapter by sourcePath
						const chapterIndex = this.chapters.findIndex(
							(ch) => ch.sourcePath === resolvedPath,
						);
						if (chapterIndex !== -1) {
							const htmlFile = `chapter-${chapterIndex + 1}.html${anchorSuffix}`;
							resolvedNodes.push({
								...node,
								attrs: {
									...node.attrs,
									href: htmlFile,
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
			.map(([key, value]) => {
				const rendered = key === "href" ? this.encodeHref(String(value)) : value;
				return `${key}="${this.escapeHtml(rendered)}"`;
			})
			.join(" ");

		// Convert children to HTML
		let childrenHtml = children
			.map((child) => {
				if (typeof child === "string") {
					return this.escapeHtml(child);
				}
				return this.nodeToHtml(child);
			})
			.join("");

		// Wrap blockquote content in <code> for proper rendering in EPUB readers
		// EPUB readers don't handle CSS font changes well, so structural wrapping
		// ensures citations/Sanskrit text renders with the right font.
		if (tag === "blockquote") {
			childrenHtml = `<code>${childrenHtml}</code>`;
		}

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
		// Links are resolved here, not while chapters are being added: a link may
		// point at a file that has not been processed yet, and with splitting on
		// its document name is not known until then.
		const linkResolver = new LinkResolver();
		for (const chapter of this.chapters) {
			chapter.content = await this.resolveLinksInNodes(chapter.content, chapter.sourcePath, linkResolver);
		}

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

			if (this.bookToc) {
				writeFileSync(join(oebpsDir, "book-toc.html"), this.generateBookTocHtml(), "utf-8");
				if (this.bookToc === "start") {
					htmlFiles.unshift("book-toc.html");
				} else {
					htmlFiles.push("book-toc.html");
				}
			}

			// 4. Generate CSS
			const cssContent = this.generateCss();
			writeFileSync(join(oebpsDir, "style.css"), cssContent, "utf-8");

			// 5. Generate content.opf (package document)
			const opfContent = this.generateOpf(htmlFiles);
			writeFileSync(join(oebpsDir, "content.opf"), opfContent, "utf-8");

			// 6. Generate navigation: nav.xhtml for EPUB 3, toc.ncx for older readers
			const ncxContent = this.generateNcx();
			writeFileSync(join(oebpsDir, "toc.ncx"), ncxContent, "utf-8");
			writeFileSync(join(oebpsDir, "nav.xhtml"), this.generateNavXhtml(), "utf-8");

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
	private generateChapterHtml(chapter: { title: string; content: TelegraphNode[]; id: string; headingAnchor?: string }): string {
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
	<h1 id="${chapter.headingAnchor ?? chapter.id}">${this.escapeHtml(chapter.title)}</h1>
	${contentHtml}
</body>
</html>`;
	}

	/**
	 * Generate CSS styles
	 */
	/**
	 * Bring the fragment of a link to the ASCII form the heading ids use.
	 *
	 * Headings in these books are Russian, so author-written anchors read
	 * "#Текст-20". A URI fragment is ASCII-only, and a reader that follows the
	 * specification will not resolve a raw Cyrillic one — the link is visible
	 * but leads nowhere; percent-encoding the href did not help on a real
	 * reader either. The heading ids are therefore transliterated (see
	 * AnchorGenerator.transliterateToAscii), and every fragment that still
	 * reaches serialization in Cyrillic — links written by the author inside
	 * the text, cross-file anchors — is run through the same transliteration,
	 * so both sides of the reference are produced by the same pure function.
	 */
	/**
	 * Builds the EPUB 3 navigation document.
	 *
	 * The package declares version 3.0, and a reader that takes that at its word
	 * looks for this file: toc.ncx is the EPUB 2 form, kept alongside it only so
	 * older readers still find their way. Without nav.xhtml a strict reader has
	 * no navigation of its own to work from.
	 */
	private generateNavXhtml(): string {
		interface NavItem { label: string; href: string; children: NavItem[]; }

		const render = (nodes: NavItem[]): string =>
			`<ol>${nodes.map(node =>
				`<li><a href="${this.escapeHtml(this.encodeHref(node.href))}">${this.escapeHtml(node.label)}</a>` +
				(node.children.length ? render(node.children) : "") +
				`</li>`
			).join("")}</ol>`;

		const roots: NavItem[] = this.chapters.map(chapter => {
			const node: NavItem = { label: chapter.title, href: `${chapter.id}.html`, children: [] };
			const stack: Array<{ node: NavItem; level: number }> = [{ node, level: 0 }];

			for (const heading of chapter.headings) {
				if (heading.level > this.tocDepth) continue;
				while (stack.length > 1 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
				const parent = stack[stack.length - 1]!;
				const child: NavItem = {
					label: heading.textForAnchor,
					href: `${chapter.id}.html#${AnchorGenerator.generateAsciiAnchor(heading)}`,
					children: [],
				};
				parent.node.children.push(child);
				stack.push({ node: child, level: heading.level });
			}
			return node;
		});

		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${this.language}" xml:lang="${this.language}">
<head>
	<meta charset="UTF-8"/>
	<title>${this.escapeHtml(this.bookTocTitle)}</title>
</head>
<body>
	<nav epub:type="toc" id="toc">
		<h1>${this.escapeHtml(this.bookTocTitle)}</h1>
${render(roots)}
	</nav>
</body>
</html>`;
	}

	private encodeHref(href: string): string {
		const hash = href.indexOf("#");
		if (hash === -1) return href;
		// External fragments belong to the other site's ids — leave them alone.
		if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;

		const base = href.slice(0, hash);
		let fragment = href.slice(hash + 1);
		// A percent-encoded fragment hides the Cyrillic it was made from;
		// decode it first so the transliteration sees the letters.
		if (/%[0-9A-Fa-f]{2}/.test(fragment)) {
			try {
				fragment = decodeURIComponent(fragment);
			} catch {
				return href;
			}
		}

		return `${base}#${AnchorGenerator.transliterateToAscii(fragment)}`;
	}

	private generateCss(): string {
		return `/* Строка переходов внутри длинной главы.
   Набрана мельче основного текста и приглушена: это служебная строка, а не
   часть произведения. Отступы вокруг цифр делают цель достаточно крупной,
   чтобы по ней можно было попасть пальцем и на электронных чернилах. */
.section-nav {
	font-size: 0.85em;
	color: #555;
	text-align: center;
	margin: 0.6em 0 1.4em;
	line-height: 2;
}
.section-nav-end {
	margin: 2em 0 0.6em;
}
.section-nav a {
	display: inline-block;
	padding: 0.2em 0.55em;
	text-decoration: none;
}

/* ===================== */
/* Font Family Settings  */
/* ===================== */

body {
	font-family: Georgia, serif;
	line-height: 1.6;
	margin: 1em;
	padding: 0;
}

/* ===================== */
/* Heading Styles        */
/* ===================== */

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

/* ===================== */
/* Paragraph & Lists     */
/* ===================== */

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

/* ===================== */
/* Links & Typography    */
/* ===================== */

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

/* ===================== */
/* Code & Sanskrit Text  */
/* ===================== */

/* Inline code for Sanskrit text with diacritics (IAST)
   Uses serif fonts with good diacritic support.
   Styled as italic for visual distinction from body text. */
code {
	font-family: "DejaVu Serif", "Liberation Serif", Georgia, serif;
	font-style: italic;
	color: #1a3a52;
	background-color: transparent;
	padding: 0;
	border-radius: 0;
	letter-spacing: 0.02em;
}

/* Code blocks for Sanskrit text with diacritics (IAST)
   Styled same as inline code but with left border for visual distinction.
   Use triple backticks for text blocks in Markdown. */
pre {
	font-family: "DejaVu Serif", "Liberation Serif", Georgia, serif;
	font-style: italic;
	color: #1a3a52;
	background-color: transparent;
	padding: 1em;
	border-left: 4px solid #1a3a52;
	margin: 1em 0;
	overflow-x: auto;
	letter-spacing: 0.02em;
}

pre code {
	/* Code inside pre blocks inherits pre styling */
	font-family: inherit;
	font-style: inherit;
	color: inherit;
	background-color: transparent;
	padding: 0;
	letter-spacing: inherit;
}

/* ===================== */
/* Blockquotes           */
/* ===================== */

blockquote {
	border-left: 4px solid #ccc;
	margin: 1em 0;
	padding-left: 1em;
	color: #666;
}

/* Code wrapper inside blockquotes: inherit blockquote layout,
   display as block so line breaks work properly in EPUB readers */
blockquote code {
	display: block;
	background-color: transparent;
	padding: 0;
}`;
	}

	/**
	 * Builds a contents page covering the whole book.
	 *
	 * It repeats what the reader's navigation already holds, so it is opt-in:
	 * worth having where navigation is absent or ignored - reading the files in
	 * a browser, printing - and unwelcome as twelve thousand lines in front of
	 * the text. Its depth therefore follows the navigation's by default.
	 */
	private generateBookTocHtml(): string {
		const render = (nodes: Array<{ label: string; href: string; children: any[] }>): string =>
			`<ul>${nodes.map(node =>
				`<li><a href="${node.href}">${this.escapeHtml(node.label)}</a>` +
				(node.children.length ? render(node.children) : "") +
				`</li>`
			).join("")}</ul>`;

		const roots: Array<{ label: string; href: string; children: any[]; level: number }> = [];
		const stack: Array<{ node: any; level: number }> = [];

		for (const chapter of this.chapters) {
			const chapterNode = { label: chapter.title, href: `${chapter.id}.html`, children: [], level: 0 };
			roots.push(chapterNode);
			stack.length = 0;
			stack.push({ node: chapterNode, level: 0 });

			for (const heading of chapter.headings) {
				if (heading.level > this.bookTocDepth) continue;
				while (stack.length > 1 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
				const parent = stack[stack.length - 1]!;
				const node = {
					label: heading.textForAnchor,
					href: `${chapter.id}.html#${AnchorGenerator.generateAsciiAnchor(heading)}`,
					children: [],
					level: heading.level,
				};
				parent.node.children.push(node);
				stack.push({ node, level: heading.level });
			}
		}

		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
	<meta charset="UTF-8"/>
	<title>${this.escapeHtml(this.bookTocTitle)}</title>
	<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
	<h1 id="book-toc">${this.escapeHtml(this.bookTocTitle)}</h1>
${render(roots)}
</body>
</html>`;
	}

	/**
	 * Generate content.opf (package document)
	 */
	private generateOpf(htmlFiles: string[]): string {
		const now = new Date().toISOString();
		// Identifiers follow the file name rather than the position: inserting a
		// contents page must not renumber every chapter after it.
		const idOf = (file: string) => file.replace(/\.html$/, "");
		let manifestItems = htmlFiles
			.map(file => `		<item id="${idOf(file)}" href="${file}" media-type="application/xhtml+xml"/>`)
			.join("\n");

		// Add cover image to manifest if provided
		if (this.cover) {
			const coverFilename = `cover${extname(this.cover)}`;
			manifestItems = `		<item id="cover" href="${coverFilename}" media-type="${this.getCoverMediaType()}" properties="cover-image"/>\n${manifestItems}`;
		}

		const spineItems = htmlFiles
			.map(file => `		<itemref idref="${idOf(file)}"/>`)
			.join("\n");

		const guideRefs: string[] = [];
		if (this.cover) {
			const coverFilename = `cover${extname(this.cover)}`;
			guideRefs.push(`		<reference href="${coverFilename}" type="cover" title="Cover"/>`);
		}
		if (this.bookToc) {
			guideRefs.push(`		<reference href="book-toc.html" type="toc" title="${this.escapeHtml(this.bookTocTitle)}"/>`);
		}
		const guideSection = guideRefs.length ? `	<guide>\n${guideRefs.join("\n")}\n	</guide>` : "";

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
		<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
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
		let playOrder = 1;
		let navPointsXml = "";

		for (const chapter of this.chapters) {
			// 1. Create root navPoint for the chapter
			const chapterNavPoint = `		<navPoint id="nav-${playOrder}" playOrder="${playOrder}">
			<navLabel>
				<text>${this.escapeHtml(chapter.title)}</text>
			</navLabel>
			<content src="${chapter.id}.html"/>`;
			playOrder++;

			// 2. Build nested structure for internal headings
			let nestedNavPoints = "";
			if (chapter.headings && chapter.headings.length > 0) {
				interface NavNode {
					label: string;
					src: string;
					children: NavNode[];
				}

				// Root of the current chapter's tree
				const root: NavNode = { label: chapter.title, src: `${chapter.id}.html`, children: [] };

				// Stack stores the node and its effective level (Chapter is level 0)
				const stack: { node: NavNode; level: number }[] = [{ node: root, level: 0 }];

				for (const heading of chapter.headings) {
					// Headings deeper than the limit are reachable through the text,
					// not through the reader's navigation panel.
					if (heading.level > this.tocDepth) continue;

					// Find parent in stack
					// We pop while the top of stack is deeper or equal level
					// Logic:
					// If heading.level > stack.top.level -> child of stack.top
					// If heading.level <= stack.top.level -> sibling of stack.top (so parent is stack.pop)

					while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
						stack.pop();
					}

					const parent = stack[stack.length - 1];
					const anchor = AnchorGenerator.generateAsciiAnchor(heading);
					const newNode: NavNode = {
						label: heading.textForAnchor,
						src: `${chapter.id}.html#${anchor}`,
						children: []
					};

					parent.node.children.push(newNode);
					stack.push({ node: newNode, level: heading.level });
				}

				// Serialize the children of the root (we already added the root as chapterNavPoint)
				const serializeNodes = (nodes: NavNode[], indent: string): string => {
					let result = "";
					for (const node of nodes) {
						result += `\n${indent}<navPoint id="nav-${playOrder}" playOrder="${playOrder}">
${indent}	<navLabel>
${indent}		<text>${this.escapeHtml(node.label)}</text>
${indent}	</navLabel>
${indent}	<content src="${node.src}"/>`;
						playOrder++;

						if (node.children.length > 0) {
							result += serializeNodes(node.children, indent + "\t");
						}

						result += `\n${indent}</navPoint>`;
					}
					return result;
				};

				nestedNavPoints = serializeNodes(root.children, "\t\t\t");
			}

			navPointsXml += chapterNavPoint;
			navPointsXml += nestedNavPoints;
			navPointsXml += `\n		</navPoint>\n`;
		}

		return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<head>
		<meta name="dtb:uid" content="${this.identifier}"/>
		<meta name="dtb:depth" content="4"/>
		<meta name="dtb:totalPageCount" content="0"/>
		<meta name="dtb:maxPageNumber" content="0"/>
	</head>
	<docTitle>
		<text>${this.escapeHtml(this.title)}</text>
	</docTitle>
	<navMap>
${navPointsXml}
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
