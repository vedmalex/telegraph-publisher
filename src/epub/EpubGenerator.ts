import { basename, extname, resolve } from "node:path";
import { PathResolver } from "../utils/PathResolver";
import { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import { EpubBuildSession } from "./EpubBuildSession";
import { checkEpubAbort, type EpubIO } from "./EpubIO";
import { type EpubBookModel, EpubLayoutPlanner } from "./EpubLayoutPlanner";
import {
	buildOutline,
	renderBookToc,
	renderNav,
	renderNcx,
} from "./EpubNavigation";
import {
	type EpubInputOptions,
	type NormalizedEpubOptions,
	normalizeEpubOptions,
} from "./EpubOptions";
import { EpubSourceScanner, type ScannedSource } from "./EpubSourceScanner";
import { EpubSpoolStore } from "./EpubSpoolStore";
import { renderEpubTokens } from "./EpubTokenRenderer";
import {
	type ChapterPart,
	type EpubAtomicUnit,
	EpubBuildError,
	type EpubBuildReport,
	type EpubRenderContext,
	type EpubUnitPayload,
	type ParsedSource,
	type TelegraphNode,
} from "./EpubTypes";
import {
	EpubXhtmlRenderer,
	escapeXml,
	type RenderContext,
} from "./EpubXhtmlRenderer";
import { EpubZipWriter, type ZipEntry } from "./EpubZipWriter";
import { RealEpubIO } from "./RealEpubIO";

export type EpubGeneratorState =
	| "new"
	| "scanning"
	| "planning"
	| "rendering"
	| "packaging"
	| "committing"
	| "done";

export interface ChapterTocOptions {
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
}

interface BundledImage {
	id: string;
	diskPath: string;
	epubHref: string;
	mediaType: string;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
	</rootfiles>
</container>`;

export class EpubGenerator {
	private readonly options: NormalizedEpubOptions;
	private readonly io: EpubIO;
	private readonly scanner: EpubSourceScanner;
	private readonly planner: EpubLayoutPlanner;
	private readonly renderer: EpubXhtmlRenderer;

	private state: EpubGeneratorState = "new";
	private busy = false;

	private session?: EpubBuildSession;
	private spoolStore?: EpubSpoolStore;
	private readonly scannedChapters: Array<{
		scanned: ScannedSource;
		options?: ChapterTocOptions;
		parsed?: ParsedSource;
	}> = [];
	private parsedSources: ParsedSource[] = [];
	private readonly bundledImages: Map<string, BundledImage> = new Map();
	private readonly usedImageFilenames: Set<string> = new Set();
	private chapterPathMap: Map<string, string> = new Map();
	private lastReport?: EpubBuildReport;

	constructor(options: EpubInputOptions) {
		const opts: EpubInputOptions = {
			...options,
			identifier: options.identifier || `epub-${Date.now()}`,
		};
		this.options = normalizeEpubOptions(opts);
		this.io = options.runtime?.io ?? new RealEpubIO();
		this.scanner = new EpubSourceScanner({
			pageBreaks: this.options.pageBreaks,
		});
		this.planner = new EpubLayoutPlanner();
		this.renderer = new EpubXhtmlRenderer();
	}

	getState(): EpubGeneratorState {
		return this.state;
	}

	getLastReport(): EpubBuildReport | undefined {
		return this.lastReport;
	}

	private checkState(allowed: EpubGeneratorState[]): void {
		if (this.busy) {
			throw new EpubBuildError("Concurrent operation in progress", "E_STATE");
		}
		if (!allowed.includes(this.state)) {
			throw new EpubBuildError(
				`Cannot perform operation in state '${this.state}'`,
				"E_STATE",
			);
		}
	}

	private async ensureSession(): Promise<EpubBuildSession> {
		if (!this.session) {
			this.session = await EpubBuildSession.create(
				this.options.outputPath,
				this.io,
				{
					debug: this.options.debug,
					signal: this.options.signal,
				},
			);
			this.spoolStore = new EpubSpoolStore(this.session);
		}
		return this.session;
	}

	setChapterPathMap(mapping: Record<string, string>): void {
		this.chapterPathMap = new Map<string, string>();
		for (const [key, value] of Object.entries(mapping)) {
			if (key && value) {
				this.chapterPathMap.set(resolve(key), value);
			}
		}
	}

	async addChapterFromFile(
		filePath: string,
		options: ChapterTocOptions = {},
	): Promise<void> {
		this.checkState(["new", "scanning"]);
		const resolved = resolve(filePath);
		if (!this.io.base.exists(resolved)) {
			const error = new Error(
				`ENOENT: no such file or directory, open '${resolved}'`,
			);
			(error as unknown as { code: string }).code = "ENOENT";
			throw error;
		}

		this.busy = true;
		try {
			const session = await this.ensureSession();
			if (this.state === "new") {
				this.state = "scanning";
				session.transition("scanning");
			}
			const ordinal = this.scannedChapters.length + 1;
			const scanned = await this.scanner.scan(resolved, ordinal, session);
			this.scannedChapters.push({ scanned, options });

			if (this.options.debug) {
				console.log(`[EPUB DEBUG] Processing chapter file: ${filePath}`);
				console.log(
					`[EPUB DEBUG] Headings found in ${basename(filePath)}: ${scanned.outline.length}`,
				);
				console.log(
					`[EPUB DEBUG] ${basename(filePath)}: tables=0, ol-as-table=0`,
				);
			}
		} finally {
			this.busy = false;
		}
	}

	private async prepareBookModel(): Promise<EpubBookModel> {
		const session = await this.ensureSession();
		if (!this.spoolStore) {
			this.spoolStore = new EpubSpoolStore(session);
		}
		const store = this.spoolStore;

		this.parsedSources = [];
		for (const item of this.scannedChapters) {
			if (!item.parsed) {
				const inMemoryStore = new Map<string, EpubUnitPayload>();
				const units: EpubAtomicUnit[] = [];
				for await (const unit of this.scanner.units(
					item.scanned,
					session,
					store,
				)) {
					units.push(unit);
					const payload = await store.get(unit.payloadRef);
					inMemoryStore.set(unit.payloadRef, payload);
				}

				if (units.length === 0) {
					const emptyUnitId = `s${item.scanned.descriptor.ordinal}-u1`;
					const emptyPayload: EpubUnitPayload = {
						unitId: emptyUnitId,
						tokens: [],
						links: [],
						images: [],
					};
					const payloadRef = await store.put(emptyUnitId, emptyPayload);
					const emptyUnit: EpubAtomicUnit = {
						id: emptyUnitId,
						sourceKey: item.scanned.descriptor.key,
						ordinal: 1,
						range: { startByte: 0, endByte: 0, startLine: 1, endLine: 1 },
						kind: "paragraph",
						keepWithNext: false,
						anchorIds: [],
						payloadRef,
					};
					units.push(emptyUnit);
					inMemoryStore.set(payloadRef, emptyPayload);
				}

				item.parsed = {
					descriptor: item.scanned.descriptor,
					units,
					payloadStore: inMemoryStore,
					anchors: item.scanned.anchors,
					outline: item.scanned.outline,
					definitions: item.scanned.definitions,
					links: item.scanned.links,
					pages: item.scanned.pages,
					images: item.scanned.images,
					coverage: item.scanned.coverage,
					diagnostics: item.scanned.diagnostics,
				};

				if (this.options.debug) {
					const jsonOutputPath = resolve(
						item.scanned.descriptor.key.replace(/\.md$/i, ".epub.json"),
					);
					try {
						const renderCtx: EpubRenderContext = {
							sourceKey: item.scanned.descriptor.key,
							pageBreaks: this.options.pageBreaks,
							epubVersion: this.options.epubVersion,
							definitions: item.scanned.definitions,
							anchors: item.scanned.anchors,
						};
						const allNodes: TelegraphNode[] = [];
						for (const unit of units) {
							const payload = inMemoryStore.get(unit.payloadRef);
							if (!payload) continue;
							const nodes = renderEpubTokens(payload.tokens, renderCtx);
							for (const n of nodes) {
								if (typeof n === "string") {
									allNodes.push({ tag: "p", children: [n] });
								} else {
									allNodes.push(n);
								}
							}
						}
						this.io.base.writeFile(
							jsonOutputPath,
							JSON.stringify(allNodes, null, 2),
						);
					} catch {
						// Swallow debug JSON errors
					}
				}
			}
			this.parsedSources.push(item.parsed);
		}

		const anchorRegistry = new EpubAnchorRegistry();
		for (const parsed of this.parsedSources) {
			anchorRegistry.registerSource(parsed);
		}

		const outline = buildOutline(this.parsedSources);
		const pages = this.parsedSources.flatMap((s) => s.pages);

		const imageMap = new Map<string, string>();
		const pathResolver = PathResolver.getInstance();

		for (const parsed of this.parsedSources) {
			for (const img of parsed.images) {
				const rawSrc = img.rawSrc.trim();
				if (
					rawSrc.startsWith("http://") ||
					rawSrc.startsWith("https://") ||
					rawSrc.startsWith("data:")
				) {
					continue;
				}

				let resolvedPath = pathResolver.resolve(parsed.descriptor.key, rawSrc);
				if (!this.io.base.exists(resolvedPath)) {
					try {
						const decoded = decodeURIComponent(rawSrc);
						const decodedPath = pathResolver.resolve(
							parsed.descriptor.key,
							decoded,
						);
						if (this.io.base.exists(decodedPath)) {
							resolvedPath = decodedPath;
						}
					} catch {}
				}

				if (this.io.base.exists(resolvedPath)) {
					let bundled = this.bundledImages.get(resolvedPath);
					if (!bundled) {
						const baseName = basename(resolvedPath);
						const ext = extname(baseName);
						const nameWithoutExt = basename(baseName, ext);
						const safeBase =
							nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
						let candidateFilename = `${safeBase}${ext.toLowerCase()}`;
						let counter = 1;
						while (this.usedImageFilenames.has(candidateFilename)) {
							counter++;
							candidateFilename = `${safeBase}-${counter}${ext.toLowerCase()}`;
						}
						this.usedImageFilenames.add(candidateFilename);

						const epubHref = `images/${candidateFilename}`;
						const imageId = `img-${this.bundledImages.size + 1}`;
						const mediaType = this.getImageMediaType(resolvedPath);
						bundled = {
							id: imageId,
							diskPath: resolvedPath,
							epubHref,
							mediaType,
						};
						this.bundledImages.set(resolvedPath, bundled);
					}
					imageMap.set(rawSrc, bundled.epubHref);
					try {
						const decoded = decodeURIComponent(rawSrc);
						if (decoded !== rawSrc) {
							imageMap.set(decoded, bundled.epubHref);
						}
					} catch {}
				}
			}
		}

		return {
			sources: this.parsedSources,
			payloadStore: store,
			anchorRegistry,
			outline,
			pages,
			imageMap,
		};
	}

	async analyze(): Promise<EpubBuildReport> {
		this.checkState(["new", "scanning"]);
		this.busy = true;
		try {
			const session = await this.ensureSession();
			if (this.state === "new") {
				this.state = "scanning";
				session.transition("scanning");
			}
			this.state = "planning";
			session.transition("planning");

			const bookModel = await this.prepareBookModel();
			const dryRunOptions: NormalizedEpubOptions = {
				...this.options,
				dryRun: true,
			};
			const planResult = await this.planner.plan(
				bookModel,
				dryRunOptions,
				this.renderer,
			);
			this.lastReport = planResult.report;

			if (this.options.reportPath) {
				const reportJson = JSON.stringify(planResult.report, null, 2);
				this.io.base.writeFile(resolve(this.options.reportPath), reportJson);
			}

			await session.dispose("success");
			this.state = "done";
			return planResult.report;
		} catch (error) {
			if (this.session) {
				await this.session.dispose("failure", error).catch(() => undefined);
			}
			throw error;
		} finally {
			this.busy = false;
		}
	}

	async generate(): Promise<EpubBuildReport> {
		this.checkState(["new", "scanning"]);
		this.busy = true;
		try {
			const session = await this.ensureSession();
			if (this.state === "new") {
				this.state = "scanning";
				session.transition("scanning");
			}

			this.state = "planning";
			session.transition("planning");
			const bookModel = await this.prepareBookModel();
			const planResult = await this.planner.plan(
				bookModel,
				this.options,
				this.renderer,
			);

			this.state = "rendering";
			session.transition("rendering");
			const zipEntries = await this.renderAndWriteFiles(
				bookModel,
				planResult.parts,
				planResult.renderedParts,
			);

			this.state = "packaging";
			session.transition("packaging");
			const stagedZip = session.ownedPath("package.epub");
			await EpubZipWriter.write(
				zipEntries,
				stagedZip,
				session.io,
				session.signal,
			);

			this.state = "committing";
			await session.finish(stagedZip);
			this.state = "done";
			planResult.report.outputCommitted = true;
			this.lastReport = planResult.report;

			if (this.options.reportPath) {
				const reportJson = JSON.stringify(planResult.report, null, 2);
				this.io.base.writeFile(resolve(this.options.reportPath), reportJson);
			}

			if (this.options.debug) {
				console.log(
					`🔧 Debug mode: Temporary files kept at: ${session.directory}`,
				);
				console.log(
					`   You can inspect the generated EPUB structure and HTML files there.`,
				);
			} else {
				await session.dispose("success");
			}
			return planResult.report;
		} catch (error) {
			if (this.session) {
				await this.session.dispose("failure", error).catch(() => undefined);
			}
			throw error;
		} finally {
			this.busy = false;
		}
	}

	private async renderAndWriteFiles(
		bookModel: EpubBookModel,
		parts: ChapterPart[],
		renderedParts: Map<string, { text: string; bytes: number; sha256: string }>,
	): Promise<ZipEntry[]> {
		const session = this.session;
		if (!session) {
			throw new EpubBuildError("No active EPUB session", "E_STATE");
		}
		checkEpubAbort(session.signal);

		this.io.base.mkdir(session.ownedPath("META-INF"), true);
		this.io.base.mkdir(session.ownedPath("OEBPS"), true);
		this.io.base.mkdir(session.ownedPath("OEBPS/images"), true);

		const zipEntries: ZipEntry[] = [];

		// 1. mimetype
		const mimetypePath = session.ownedPath("mimetype");
		this.io.base.writeFile(mimetypePath, "application/epub+zip");
		zipEntries.push({ path: mimetypePath, zipPath: "mimetype" });

		// 2. META-INF/container.xml
		const containerPath = session.ownedPath("META-INF/container.xml");
		this.io.base.writeFile(containerPath, CONTAINER_XML);
		zipEntries.push({
			path: containerPath,
			zipPath: "META-INF/container.xml",
		});

		// 3. OEBPS/style.css
		const cssPath = session.ownedPath("OEBPS/style.css");
		this.io.base.writeFile(cssPath, this.generateCss());
		zipEntries.push({ path: cssPath, zipPath: "OEBPS/style.css" });

		// 4. Title page
		if (this.options.titlePage) {
			const titlePagePath = session.ownedPath("OEBPS/title-page.html");
			this.io.base.writeFile(titlePagePath, this.generateTitlePageHtml());
			zipEntries.push({
				path: titlePagePath,
				zipPath: "OEBPS/title-page.html",
			});
		}

		// 5. Book ToC
		if (this.options.bookToc) {
			const bookTocPath = session.ownedPath("OEBPS/book-toc.html");
			const bookTocHtml = renderBookToc(
				bookModel.outline,
				bookModel.pages ?? [],
				bookModel.anchorRegistry,
				this.options,
			);
			this.io.base.writeFile(bookTocPath, bookTocHtml);
			zipEntries.push({
				path: bookTocPath,
				zipPath: "OEBPS/book-toc.html",
			});
		}

		// 6. Content chapters
		for (const part of parts) {
			const partPath = session.ownedPath(`OEBPS/${part.href}`);
			const rendered = renderedParts.get(part.id);
			if (rendered?.text) {
				this.io.base.writeFile(partPath, rendered.text);
			} else {
				const source = bookModel.sources.find(
					(s) => s.descriptor.key === part.sourceKey,
				);
				if (!source) {
					throw new EpubBuildError(
						`Missing source for part: ${part.id}`,
						"E_STATE",
					);
				}
				const renderContext: RenderContext = {
					source,
					payloadStore: bookModel.payloadStore ?? source.payloadStore,
					registry: bookModel.anchorRegistry,
					options: this.options,
					targetMap: bookModel.sourceTargetMaps?.get(part.sourceKey),
					sourceTargetMaps: bookModel.sourceTargetMaps,
					imageMap: bookModel.imageMap,
				};
				const writer = await session.openWriter(`OEBPS/${part.href}`);
				await this.renderer.renderPartToWriter(part, renderContext, writer);
				await writer.close();
			}
			zipEntries.push({ path: partPath, zipPath: `OEBPS/${part.href}` });
		}

		// 7. Navigation
		const ncxPath = session.ownedPath("OEBPS/toc.ncx");
		const ncxXml = renderNcx(
			bookModel.outline,
			bookModel.pages ?? [],
			bookModel.anchorRegistry,
			this.options,
		);
		this.io.base.writeFile(ncxPath, ncxXml);
		zipEntries.push({ path: ncxPath, zipPath: "OEBPS/toc.ncx" });

		if (this.options.epubVersion === 3) {
			const navPath = session.ownedPath("OEBPS/nav.xhtml");
			let navHtml = renderNav(
				bookModel.outline,
				bookModel.pages ?? [],
				bookModel.anchorRegistry,
				this.options,
			);

			const firstChapterHref = parts[0]?.href ?? "chapter-1.html";
			const firstChapterLabel =
				bookModel.sources[0]?.descriptor.title ?? this.options.title;
			const landmarkItems = [
				this.options.titlePage
					? `\t\t\t<li><a epub:type="titlepage" href="title-page.html">${escapeXml(this.options.title)}</a></li>`
					: "",
				this.options.bookToc
					? `\t\t\t<li><a epub:type="toc" href="book-toc.html">${escapeXml(this.options.bookTocTitle)}</a></li>`
					: "",
				firstChapterHref
					? `\t\t\t<li><a epub:type="bodymatter" href="${escapeXml(firstChapterHref)}">${escapeXml(firstChapterLabel)}</a></li>`
					: "",
			]
				.filter(Boolean)
				.join("\n");

			if (landmarkItems && !navHtml.includes('epub:type="landmarks"')) {
				const landmarksNav = `\t<nav epub:type="landmarks" id="landmarks" hidden="hidden">\n\t\t<h1>Ориентиры</h1>\n\t\t<ol>\n${landmarkItems}\n\t\t</ol>\n\t</nav>\n`;
				navHtml = navHtml.replace("</body>", `${landmarksNav}</body>`);
			}

			this.io.base.writeFile(navPath, navHtml);
			zipEntries.push({ path: navPath, zipPath: "OEBPS/nav.xhtml" });
		}

		// 8. Cover image
		if (this.options.cover && this.io.base.exists(this.options.cover)) {
			const coverExt = extname(this.options.cover).toLowerCase() || ".jpg";
			const coverFilename = `cover${coverExt}`;
			const coverDestPath = session.ownedPath(`OEBPS/${coverFilename}`);
			this.io.base.copyFile(this.options.cover, coverDestPath);
			zipEntries.push({
				path: coverDestPath,
				zipPath: `OEBPS/${coverFilename}`,
			});
		}

		// 9. Bundled images
		for (const img of this.bundledImages.values()) {
			const imgDestPath = session.ownedPath(`OEBPS/${img.epubHref}`);
			this.io.base.copyFile(img.diskPath, imgDestPath);
			zipEntries.push({
				path: imgDestPath,
				zipPath: `OEBPS/${img.epubHref}`,
			});
		}

		// 10. content.opf
		const opfPath = session.ownedPath("OEBPS/content.opf");
		const opfXml = this.generateOpf(parts);
		this.io.base.writeFile(opfPath, opfXml);
		zipEntries.push({ path: opfPath, zipPath: "OEBPS/content.opf" });

		return zipEntries;
	}

	private generateTitlePageHtml(): string {
		const lines = [
			this.options.series
				? `\t\t<p class="title-series">${escapeXml(this.options.series)}</p>`
				: "",
			`\t\t<h1 class="title-name">${escapeXml(this.options.title)}</h1>`,
			`\t\t<p class="title-author">${escapeXml(this.options.author)}</p>`,
			this.options.translator
				? `\t\t<p class="title-translator">Перевод: ${escapeXml(this.options.translator)}</p>`
				: "",
			this.options.description
				? `\t\t<p class="title-description">${escapeXml(this.options.description)}</p>`
				: "",
			this.options.publisher || this.options.pubDate
				? `\t\t<p class="title-imprint">${escapeXml([this.options.publisher, this.options.pubDate].filter(Boolean).join(", "))}</p>`
				: "",
		]
			.filter(Boolean)
			.join("\n");

		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(this.options.language)}" xml:lang="${escapeXml(this.options.language)}">
<head>
	<meta charset="UTF-8"/>
	<title>${escapeXml(this.options.title)}</title>
	<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
	<section epub:type="titlepage" class="title-page">
${lines}
	</section>
</body>
</html>\n`;
	}

	private getImageMediaType(filePath?: string): string {
		if (!filePath) return "image/jpeg";
		const ext = extname(filePath).toLowerCase();
		switch (ext) {
			case ".jpg":
			case ".jpeg":
				return "image/jpeg";
			case ".png":
				return "image/png";
			case ".gif":
				return "image/gif";
			case ".svg":
				return "image/svg+xml";
			case ".webp":
				return "image/webp";
			default:
				return "image/jpeg";
		}
	}

	private getCoverMediaType(): string {
		return this.getImageMediaType(this.options.cover);
	}

	private generateOpf(parts: ChapterPart[]): string {
		const now = this.session?.modified ?? new Date().toISOString();
		const idOf = (file: string) => file.replace(/\.html$/, "");
		let manifestItems = parts
			.map(
				(part) =>
					`\t\t<item id="${idOf(part.href)}" href="${part.href}" media-type="application/xhtml+xml"/>`,
			)
			.join("\n");

		if (this.options.titlePage) {
			manifestItems = `\t\t<item id="title-page" href="title-page.html" media-type="application/xhtml+xml"/>\n${manifestItems}`;
		}
		if (this.options.bookToc) {
			manifestItems += `\n\t\t<item id="book-toc" href="book-toc.html" media-type="application/xhtml+xml"/>`;
		}

		if (this.options.cover) {
			const coverFilename = `cover${extname(this.options.cover).toLowerCase() || ".jpg"}`;
			const propertiesAttr =
				this.options.epubVersion === 3 ? ' properties="cover-image"' : "";
			manifestItems = `\t\t<item id="cover" href="${coverFilename}" media-type="${this.getCoverMediaType()}"${propertiesAttr}/>\n${manifestItems}`;
		}

		for (const img of this.bundledImages.values()) {
			manifestItems += `\n\t\t<item id="${img.id}" href="${img.epubHref}" media-type="${img.mediaType}"/>`;
		}

		const spineItems: string[] = [];
		if (this.options.titlePage) {
			spineItems.push('\t\t<itemref idref="title-page"/>');
		}
		if (this.options.bookToc === "start") {
			spineItems.push('\t\t<itemref idref="book-toc"/>');
		}
		for (const part of parts) {
			spineItems.push(`\t\t<itemref idref="${idOf(part.href)}"/>`);
		}
		if (this.options.bookToc === "end") {
			spineItems.push('\t\t<itemref idref="book-toc"/>');
		}

		const guideRefs: string[] = [];
		if (this.options.titlePage) {
			guideRefs.push(
				`\t\t<reference href="title-page.html" type="title-page" title="${escapeXml(this.options.title)}"/>`,
			);
		}
		if (this.options.cover) {
			const coverFilename = `cover${extname(this.options.cover).toLowerCase() || ".jpg"}`;
			guideRefs.push(
				`\t\t<reference href="${coverFilename}" type="cover" title="Cover"/>`,
			);
		}
		if (this.options.bookToc) {
			guideRefs.push(
				`\t\t<reference href="book-toc.html" type="toc" title="${escapeXml(this.options.bookTocTitle)}"/>`,
			);
		}
		const guideSection = guideRefs.length
			? `\t<guide>\n${guideRefs.join("\n")}\n\t</guide>`
			: "";

		const navManifestItem =
			this.options.epubVersion === 3
				? '\t\t<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'
				: "";
		const modifiedMeta =
			this.options.epubVersion === 3
				? `\t\t<meta property="dcterms:modified">${now}</meta>\n`
				: "";

		const extraMeta = [
			this.options.publisher
				? `\t\t<dc:publisher>${escapeXml(this.options.publisher)}</dc:publisher>`
				: "",
			this.options.pubDate
				? `\t\t<dc:date>${escapeXml(this.options.pubDate)}</dc:date>`
				: "",
			this.options.translator
				? `\t\t<dc:contributor id="translator">${escapeXml(this.options.translator)}</dc:contributor>`
				: "",
			this.options.description
				? `\t\t<dc:description>${escapeXml(this.options.description)}</dc:description>`
				: "",
			this.options.series
				? `\t\t<meta property="belongs-to-collection">${escapeXml(this.options.series)}</meta>`
				: "",
		]
			.filter(Boolean)
			.join("\n");
		const extraMetaBlock = extraMeta ? `${extraMeta}\n` : "";

		return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${this.options.epubVersion}.0" unique-identifier="book-id">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:title>${escapeXml(this.options.title)}</dc:title>
		<dc:creator>${escapeXml(this.options.author)}</dc:creator>
		<dc:language>${escapeXml(this.options.language)}</dc:language>
		<dc:identifier id="book-id">${escapeXml(this.options.identifier ?? "epub")}</dc:identifier>
${extraMetaBlock}${modifiedMeta}\t</metadata>
	<manifest>
${navManifestItem}\t\t<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
\t\t<item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
	</manifest>
	<spine toc="ncx">
${spineItems.join("\n")}
	</spine>
${guideSection}
</package>`;
	}

	async dispose(): Promise<void> {
		if (this.session) {
			await this.session.dispose("success").catch(() => undefined);
			this.session = undefined;
		}
		this.spoolStore = undefined;
	}

	static splitMarkdownByHeading(
		markdown: string,
		level: number,
	): Array<{ title: string; headingLine: string; content: string }> {
		const lines = markdown.split(/\r?\n/);
		const parts: Array<{
			title: string;
			headingLine: string;
			content: string[];
		}> = [];
		let current: {
			title: string;
			headingLine: string;
			content: string[];
		} | null = null;
		let inFence = false;

		for (const line of lines) {
			if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

			const heading = inFence ? null : line.match(/^(#{1,6})\s+(.*)$/);
			if (heading && (heading[1]?.length ?? 0) <= level) {
				if (current) parts.push(current);
				current = {
					title: heading[2]?.trim() ?? "",
					headingLine: line,
					content: [],
				};
				continue;
			}

			if (!current) current = { title: "", headingLine: "", content: [] };
			current.content.push(line);
		}
		if (current) parts.push(current);

		return parts
			.filter(
				(part) => part.title !== "" || part.content.join("\n").trim() !== "",
			)
			.map((part) => ({
				title: part.title,
				headingLine: part.headingLine,
				content: part.content.join("\n"),
			}));
	}

	private generateCss(): string {
		return `/* Титульная страница. Набрана без картинки: типографика читается на
   любом экране, включая электронные чернила, и ничего не весит. Отступ сверху
   задан в процентах высоты, поэтому заголовок остаётся в верхней трети и на
   телефоне, и на планшете. */
.title-page {
	text-align: center;
	margin-top: 18%;
}

.title-series {
	font-size: 0.9em;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #555;
	margin-bottom: 1.5em;
}

.title-name {
	font-size: 2em;
	line-height: 1.25;
	margin: 0 0 0.8em;
	page-break-after: avoid;
}

.title-author {
	font-size: 1.15em;
	margin: 0 0 2em;
}

.title-translator,
.title-description {
	font-size: 0.95em;
	color: #444;
	margin: 0 0 0.6em;
}

.title-imprint {
	font-size: 0.85em;
	color: #666;
	margin-top: 3em;
}

/* Строка переходов внутри длинной главы.
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
}

/* ===================== */
/* Images                */
/* ===================== */

img {
	max-width: 100%;
	height: auto;
	display: block;
	margin: 1em auto;
}`;
	}
}
