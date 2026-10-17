import { createHash } from "node:crypto";
import type { Token } from "marked";
import { AnchorGenerator } from "../utils/AnchorGenerator";
import type { EpubBuildSession } from "./EpubBuildSession";
import { createFramerMarked, EpubBlockFramer } from "./EpubBlockFramer";
import { checkEpubAbort } from "./EpubIO";
import { EpubSpoolStore } from "./EpubSpoolStore";
import { epubInlineText, parseEpubHtml } from "./EpubTokenRenderer";
import {
	type AnchorTarget,
	type EpubAtomicUnit,
	EpubBuildError,
	type EpubDiagnostic,
	type EpubUnitPayload,
	type ImageSymbol,
	type LinkSymbol,
	type OutlineNode,
	type PageTarget,
	type ReferenceDefinition,
	type SourceDescriptor,
	type SourceKey,
	type SourceRange,
	type TargetId,
	type TelegraphNode,
	type UnitId,
} from "./EpubTypes";

export interface ScannedSource {
	descriptor: SourceDescriptor;
	anchors: AnchorTarget[];
	outline: OutlineNode[];
	definitions: Map<string, ReferenceDefinition>;
	links: LinkSymbol[];
	pages: PageTarget[];
	images: ImageSymbol[];
	coverage: {
		totalBytes: number;
		coveredBytes: number;
		ranges: SourceRange[];
	};
	diagnostics?: EpubDiagnostic[];
	sourceSpoolPath: string;
}

function extractFrontMatter(source: string): {
	metadata: Record<string, string>;
	body: string;
	frontMatterRange?: SourceRange;
} {
	const match = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(source);
	if (!match || match.index !== 0) return { metadata: {}, body: source };
	const metadata: Record<string, string> = {};
	const lines = match[1]?.split(/\r?\n/) ?? [];
	for (const line of lines) {
		const m = /^([^:]+):\s*(.*?)\s*$/.exec(line);
		if (m?.[1] && m[2] !== undefined) {
			metadata[m[1].trim()] = m[2].replace(/^([\"'])(.*)\1$/, "$2");
		}
	}
	const matchLen = match[0].length;
	return {
		metadata,
		body: source.slice(matchLen),
		frontMatterRange: {
			startByte: 0,
			endByte: Buffer.byteLength(match[0], "utf8"),
			startLine: 1,
			endLine: 1 + (match[0].match(/\n/g)?.length ?? 0),
		},
	};
}

function getUniqueAnchorId(baseId: string, usedIds: Set<string>): string {
	if (!usedIds.has(baseId)) {
		usedIds.add(baseId);
		return baseId;
	}
	let suffix = 2;
	while (usedIds.has(`${baseId}-${suffix}`)) {
		suffix++;
	}
	const uniqueId = `${baseId}-${suffix}`;
	usedIds.add(uniqueId);
	return uniqueId;
}

function buildOutlineTree(flatNodes: OutlineNode[]): OutlineNode[] {
	const rootNodes: OutlineNode[] = [];
	const stack: OutlineNode[] = [];

	for (const node of flatNodes) {
		while (
			stack.length > 0 &&
			(stack[stack.length - 1]?.level ?? 0) >= node.level
		) {
			stack.pop();
		}

		if (stack.length === 0) {
			rootNodes.push(node);
		} else {
			stack[stack.length - 1]?.children.push(node);
		}

		stack.push(node);
	}

	return rootNodes;
}

function extractSymbolsFromTokens(
	tokens: readonly Token[],
	unitId: UnitId,
	sourceKey: SourceKey,
	unitRange: SourceRange,
	currentPath: number[] = [],
): { links: LinkSymbol[]; images: ImageSymbol[] } {
	const links: LinkSymbol[] = [];
	const images: ImageSymbol[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;
		const nodePath = [...currentPath, i];

		if (token.type === "link") {
			links.push({
				sourceKey,
				unitId,
				nodePath,
				rawHref: token.href,
				range: unitRange,
				kind: token.href.startsWith("#") ? "toc" : "content",
			});
		} else if (token.type === "image") {
			images.push({
				sourceKey,
				unitId,
				rawSrc: token.href,
				altText: token.text,
				title: token.title,
				range: unitRange,
			});
		}

		if ("tokens" in token && Array.isArray(token.tokens)) {
			const nested = extractSymbolsFromTokens(
				token.tokens,
				unitId,
				sourceKey,
				unitRange,
				nodePath,
			);
			links.push(...nested.links);
			images.push(...nested.images);
		}
		if ("items" in token && Array.isArray(token.items)) {
			for (let j = 0; j < token.items.length; j++) {
				const item = token.items[j];
				if (item && "tokens" in item && Array.isArray(item.tokens)) {
					const nested = extractSymbolsFromTokens(
						item.tokens,
						unitId,
						sourceKey,
						unitRange,
						[...nodePath, j],
					);
					links.push(...nested.links);
					images.push(...nested.images);
				}
			}
		}
		if ("header" in token && Array.isArray(token.header)) {
			for (let c = 0; c < token.header.length; c++) {
				const cell = token.header[c];
				if (cell && "tokens" in cell && Array.isArray(cell.tokens)) {
					const nested = extractSymbolsFromTokens(
						cell.tokens,
						unitId,
						sourceKey,
						unitRange,
						[...nodePath, 0, c],
					);
					links.push(...nested.links);
					images.push(...nested.images);
				}
			}
		}
		if ("rows" in token && Array.isArray(token.rows)) {
			for (let r = 0; r < token.rows.length; r++) {
				const row = token.rows[r];
				if (!Array.isArray(row)) continue;
				for (let c = 0; c < row.length; c++) {
					const cell = row[c];
					if (cell && "tokens" in cell && Array.isArray(cell.tokens)) {
						const nested = extractSymbolsFromTokens(
							cell.tokens,
							unitId,
							sourceKey,
							unitRange,
							[...nodePath, r + 1, c],
						);
						links.push(...nested.links);
						images.push(...nested.images);
					}
				}
			}
		}
	}

	return { links, images };
}

function parseHtmlNodes(t: Token, sourceKey: SourceKey): TelegraphNode[] {
	if (t.type !== "html") return [];
	const result: TelegraphNode[] = [];
	const collect = (nodes: (string | TelegraphNode)[]) => {
		for (const n of nodes) {
			if (typeof n !== "string") {
				result.push(n);
				collect(n.children ?? []);
			}
		}
	};
	let raw = t.raw;
	const opening = /^<([a-z][\w:-]*)(?:\s[^>]*)?>$/i.exec(raw.trim());
	if (opening && !/^(?:br|hr|img)$/i.test(opening[1] ?? "")) {
		raw += `</${opening[1]}>`;
	}
	if (/^<\//.test(raw)) return [];
	collect(
		parseEpubHtml(raw, {
			sourceKey,
			pageBreaks: false,
		}),
	);
	return result;
}

export class EpubSourceScanner {
	readonly chunkSize: number;
	readonly pageBreaks: boolean;
	spoolStore?: EpubSpoolStore;

	constructor(options?: {
		chunkSize?: number;
		pageBreaks?: boolean;
		spoolStore?: EpubSpoolStore;
	}) {
		this.chunkSize = options?.chunkSize ?? 64 * 1024;
		this.pageBreaks = options?.pageBreaks ?? true;
		this.spoolStore = options?.spoolStore;
	}

	async scan(
		path: string,
		ordinal: number,
		session: EpubBuildSession,
	): Promise<ScannedSource> {
		checkEpubAbort(session.signal);
		const spoolName = `source-${ordinal}.raw.md`;
		const sourceSpoolPath = session.ownedPath(spoolName);
		const writer = await session.openWriter(sourceSpoolPath, false);

		const hasher = createHash("sha256");
		let totalBytes = 0;
		const decoder = new TextDecoder("utf-8", { fatal: false });
		let rawText = "";

		try {
			for await (const chunk of session.io.readChunks(path, session.signal)) {
				checkEpubAbort(session.signal);
				hasher.update(chunk);
				totalBytes += chunk.byteLength;
				await writer.write(chunk);
				rawText += decoder.decode(chunk, { stream: true });
			}
			rawText += decoder.decode();
			await writer.close();
		} catch (error) {
			await writer.abort().catch(() => undefined);
			throw error;
		}

		checkEpubAbort(session.signal);

		const { metadata, body, frontMatterRange } = extractFrontMatter(rawText);
		const initialLine = frontMatterRange?.endLine ?? 1;
		const initialByte = frontMatterRange?.endByte ?? 0;

		const framer = new EpubBlockFramer({ initialLine, initialByte });
		const blocks = [...framer.push(body), ...framer.finish()];

		const baseMarked = createFramerMarked();
		const definitions = new Map<string, ReferenceDefinition>();
		const diagnostics: EpubDiagnostic[] = [];

		// Pre-scan definitions across all blocks so references anywhere in source resolve
		for (const block of blocks) {
			if (block.type === "space") continue;
			const tokens = baseMarked.lexer(block.raw);
			for (const token of tokens) {
				if (token.type === "def") {
					const label = token.tag.toLowerCase().replace(/\s+/g, " ").trim();
					if (definitions.has(label)) {
						diagnostics.push({
							code: "W_REFERENCE_DUPLICATE",
							severity: "warning",
							source: path,
							range: block.range,
							message: `First definition wins for ${label}.`,
						});
					} else {
						definitions.set(label, {
							label,
							href: token.href,
							title: token.title,
							range: block.range,
						});
					}
				}
			}
		}

		const markedInstance = createFramerMarked(definitions);
		const anchors: AnchorTarget[] = [];
		const flatOutlineNodes: OutlineNode[] = [];
		const allLinks: LinkSymbol[] = [];
		const pages: PageTarget[] = [];
		const allImages: ImageSymbol[] = [];
		const coverageRanges: SourceRange[] = frontMatterRange
			? [frontMatterRange]
			: [];
		const usedIds = new Set<string>();
		const explicitIds = new Set<string>();
		const pageCounts = new Map<number, number>();

		let anchorOrdinal = 0;
		let unitOrdinal = 0;

		type Extended = Token & {
			anchorId?: string;
			explicitId?: string;
			pageIds?: string[];
		};

		const children = (t: Token): Token[] => {
			const out: Token[] = [];
			if ("tokens" in t && Array.isArray(t.tokens)) out.push(...t.tokens);
			if (t.type === "list") {
				for (const item of t.items) out.push(...item.tokens);
			}
			if (t.type === "table") {
				for (const cell of [...t.header, ...t.rows.flat()])
					out.push(...cell.tokens);
			}
			return out;
		};

		const walk = (t: Token, fn: (t: Extended) => void) => {
			fn(t);
			for (const child of children(t)) walk(child, fn);
		};

		const htmlNodes = (t: Token): TelegraphNode[] => parseHtmlNodes(t, path);

		const explicitFor = (t: Extended): string[] => [
			...(t.type === "heading" && t.explicitId
				? [t.explicitId.normalize("NFC")]
				: []),
			...htmlNodes(t).flatMap((n) =>
				n.attrs?.id ? [n.attrs.id.normalize("NFC")] : [],
			),
		];

		// Parse all block tokens for structural analysis
		const blockTokenPairs: Array<{
			block: (typeof blocks)[0];
			token: Token;
		}> = [];

		for (const block of blocks) {
			coverageRanges.push(block.range);
			if (block.type === "space") continue;
			const tokens = markedInstance.lexer(block.raw);
			const token = tokens[0];
			if (!token) continue;
			blockTokenPairs.push({ block, token });
		}

		// Setext heading custom ID extension
		for (const { token } of blockTokenPairs) {
			walk(token, (t) => {
				if (t.type !== "heading" || t.explicitId) return;
				const m = /^(.*?)[ \t]+{#([^\\s{}]+)}$/.exec(t.text);
				if (m && !/\\\{#/.test(t.text) && m[1] && m[2]) {
					t.text = m[1].trim();
					t.explicitId = m[2];
				}
			});
		}

		// Reserve explicit IDs first
		for (const { token } of blockTokenPairs) {
			walk(token, (t) => {
				for (const id of explicitFor(t)) {
					if (explicitIds.has(id)) {
						throw new EpubBuildError(
							`Duplicate explicit anchor: ${id}`,
							"E_ANCHOR_DUPLICATE",
							[
								{
									code: "E_ANCHOR_DUPLICATE",
									severity: "error",
									source: path,
									message: `Duplicate explicit anchor: ${id}`,
								},
							],
						);
					}
					explicitIds.add(id);
					usedIds.add(id);
				}
			});
		}

		// Reserve page IDs
		if (this.pageBreaks) {
			for (const { token } of blockTokenPairs) {
				walk(token, (t) => {
					if (t.type !== "html") return;
					t.pageIds = [];
					for (const match of t.raw.matchAll(
						/<!--\s*(?:Page|Страница)\s+(\d+)\s*-->/gi,
					)) {
						const pageNum = Number(match[1]);
						const count = (pageCounts.get(pageNum) ?? 0) + 1;
						pageCounts.set(pageNum, count);
						const base =
							count === 1 ? `page-${pageNum}` : `page-${pageNum}-${count}`;
						const id = getUniqueAnchorId(base, usedIds);
						t.pageIds.push(id);
						if (count > 1 || id !== base) {
							diagnostics.push({
								code: "W_PAGE_DUPLICATE",
								severity: "warning",
								source: path,
								message: `Page ${pageNum} uses unique ID ${id}.`,
							});
						}
					}
				});
			}
		}

		// Process headings, anchors, outline, links, images
		for (const { block, token } of blockTokenPairs) {
			if (token.type === "def") {
				continue;
			}

			const currentOrdinal = ++unitOrdinal;
			const unitId = `s${ordinal}-u${currentOrdinal}`;

			const add = (
				id: string,
				aliases: string[],
				kind: AnchorTarget["kind"],
			): TargetId => {
				const targetId = `s${ordinal}-a${++anchorOrdinal}`;
				anchors.push({
					id,
					aliases: [id, ...aliases.filter((a) => a !== id)],
					targetId,
					sourceKey: path,
					unitId,
					kind,
					ordinal: anchorOrdinal,
				});
				return targetId;
			};

			walk(token, (t) => {
				if (t.type === "heading") {
					const text = epubInlineText(
						(t as Token & { tokens?: Token[] }).tokens ?? [],
					);
					const info = AnchorGenerator.extractHeadingInfo([
						"",
						"#".repeat((t as Token & { depth?: number }).depth ?? 1),
						text,
					] as unknown as RegExpMatchArray);
					const explicit = t.explicitId?.normalize("NFC");
					const base = AnchorGenerator.generateAsciiAnchor(info);
					const id = explicit ?? getUniqueAnchorId(base, usedIds);
					t.anchorId = id;
					const unicode = AnchorGenerator.generateAnchor(info);
					const suffix =
						!explicit && id.startsWith(base) ? id.slice(base.length) : "";
					const targetId = add(
						id,
						[unicode, ...(suffix ? [unicode + suffix] : [])],
						explicit ? "explicit" : "heading",
					);
					flatOutlineNodes.push({
						id,
						sourceKey: path,
						level: t.depth,
						label: text,
						targetId,
						children: [],
					});
				}
				if (t.type === "html") {
					for (const n of htmlNodes(t)) {
						if (n.attrs?.id) {
							add(n.attrs.id.normalize("NFC"), [], "explicit");
						}
					}
					if (this.pageBreaks) {
						let pageIdx = 0;
						for (const match of t.raw.matchAll(
							/<!--\s*(?:Page|Страница)\s+(\d+)\s*-->/gi,
						)) {
							const pageNum = Number(match[1]);
							const id = t.pageIds?.[pageIdx++] ?? `page-${pageNum}`;
							const targetId = add(id, [String(pageNum)], "page");
							pages.push({
								targetId,
								sourceKey: path,
								unitId,
								pageNumber: pageNum,
								label: String(pageNum),
								id,
							});
						}
					}
				}
			});

			const symbols = extractSymbolsFromTokens(
				[token],
				unitId,
				path,
				block.range,
			);
			allLinks.push(...symbols.links);
			allImages.push(...symbols.images);

			walk(token, (t) => {
				for (const n of htmlNodes(t)) {
					if (n.tag === "a" && n.attrs?.href) {
						allLinks.push({
							sourceKey: path,
							unitId,
							nodePath: [],
							rawHref: n.attrs.href,
							range: block.range,
							kind: "content",
						});
					}
					if (n.tag === "img" && n.attrs?.src) {
						allImages.push({
							sourceKey: path,
							unitId,
							rawSrc: n.attrs.src,
							altText: n.attrs.alt,
							title: n.attrs.title,
							range: block.range,
						});
					}
				}
			});
		}

		const title =
			metadata.title ??
			flatOutlineNodes[0]?.label ??
			path.split(/[/\\\\]/).pop()?.replace(/\.md$/i, "") ??
			"Untitled";

		return {
			descriptor: {
				key: path,
				ordinal,
				title,
				originalBytes: totalBytes,
				sha256: hasher.digest("hex"),
				metadata,
				sourceSpoolPath,
			},
			anchors,
			outline: buildOutlineTree(flatOutlineNodes),
			definitions,
			links: allLinks,
			pages,
			images: allImages,
			coverage: {
				totalBytes,
				coveredBytes: coverageRanges.reduce(
					(n, r) => n + r.endByte - r.startByte,
					0,
				),
				ranges: coverageRanges,
			},
			diagnostics,
			sourceSpoolPath,
		};
	}

	async *units(
		source: ScannedSource,
		session: EpubBuildSession,
		store?: EpubSpoolStore,
	): AsyncIterable<EpubAtomicUnit> {
		checkEpubAbort(session.signal);
		const spoolStore =
			store ??
			this.spoolStore ??
			((session as unknown as { _epubSpoolStore?: EpubSpoolStore })
				._epubSpoolStore ??= new EpubSpoolStore(session));
		this.spoolStore = spoolStore;

		const markedInstance = createFramerMarked(source.definitions);

		const decoder = new TextDecoder("utf-8", { fatal: false });
		let rawSpoolText = "";

		for await (const chunk of session.io.readChunks(
			source.sourceSpoolPath,
			session.signal,
		)) {
			checkEpubAbort(session.signal);
			rawSpoolText += decoder.decode(chunk, { stream: true });
		}
		rawSpoolText += decoder.decode();

		const { body, frontMatterRange } = extractFrontMatter(rawSpoolText);
		const initialLine = frontMatterRange?.endLine ?? 1;
		const initialByte = frontMatterRange?.endByte ?? 0;

		const framer = new EpubBlockFramer({ initialLine, initialByte });
		const blocks = [...framer.push(body), ...framer.finish()];

		let unitOrdinal = 0;
		let pendingUnit: EpubAtomicUnit | null = null;

		const children = (t: Token): Token[] => {
			const out: Token[] = [];
			if ("tokens" in t && Array.isArray(t.tokens)) out.push(...t.tokens);
			if (t.type === "list") {
				for (const item of t.items) out.push(...item.tokens);
			}
			if (t.type === "table") {
				for (const cell of [...t.header, ...t.rows.flat()])
					out.push(...cell.tokens);
			}
			return out;
		};

		const walk = (t: Token, fn: (t: Token) => void) => {
			fn(t);
			for (const child of children(t)) walk(child, fn);
		};

		for (const block of blocks) {
			checkEpubAbort(session.signal);
			if (block.type === "space") continue;
			const tokens = markedInstance.lexer(block.raw);
			const token = tokens[0];
			if (!token || token.type === "def") continue;

			if (pendingUnit) {
				yield pendingUnit;
				pendingUnit = null;
			}

			const currentOrdinal = ++unitOrdinal;
			const unitId = `s${source.descriptor.ordinal}-u${currentOrdinal}`;

			const kind: EpubAtomicUnit["kind"] = [
				"heading",
				"code",
				"list",
				"blockquote",
				"table",
				"html",
			].includes(token.type)
				? (token.type as EpubAtomicUnit["kind"])
				: token.type === "hr"
					? "rule"
					: "paragraph";

			let heading: EpubAtomicUnit["heading"];
			if (token.type === "heading") {
				const text = epubInlineText(
					(token as Token & { tokens?: Token[] }).tokens ?? [],
				);
				const target = source.anchors.find(
					(a) =>
						a.unitId === unitId &&
						(a.kind === "heading" || a.kind === "explicit"),
				);
				if (target) {
					heading = {
						level: (token as Token & { depth?: number }).depth ?? 1,
						text,
						targetId: target.targetId,
					};
				}
			}

			const anchorIds = source.anchors
				.filter((a) => a.unitId === unitId)
				.map((a) => a.targetId);

			const symbols = extractSymbolsFromTokens(
				[token],
				unitId,
				source.descriptor.key,
				block.range,
			);

			walk(token, (t) => {
				for (const n of parseHtmlNodes(t, source.descriptor.key)) {
					if (n.tag === "a" && n.attrs?.href) {
						symbols.links.push({
							sourceKey: source.descriptor.key,
							unitId,
							nodePath: [],
							rawHref: n.attrs.href,
							range: block.range,
							kind: "content",
						});
					}
					if (n.tag === "img" && n.attrs?.src) {
						symbols.images.push({
							sourceKey: source.descriptor.key,
							unitId,
							rawSrc: n.attrs.src,
							altText: n.attrs.alt,
							title: n.attrs.title,
							range: block.range,
						});
					}
				}
			});

			const payload: EpubUnitPayload = {
				unitId,
				tokens: [token],
				links: symbols.links,
				images: symbols.images,
			};

			const payloadRef = await spoolStore.put(unitId, payload);
			const nontext = token.type === "html" && !epubInlineText([token]).trim();
			const keepWithNext = kind === "heading" || nontext;

			pendingUnit = {
				id: unitId,
				sourceKey: source.descriptor.key,
				ordinal: currentOrdinal,
				range: block.range,
				kind,
				heading,
				keepWithNext,
				anchorIds,
				payloadRef,
			};
		}

		if (pendingUnit) {
			pendingUnit.keepWithNext = false;
			yield pendingUnit;
		}
	}
}
