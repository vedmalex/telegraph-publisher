import { createHash } from "node:crypto";
import { Lexer, Marked, Tokenizer, type Token, type Tokens } from "marked";
import { AnchorGenerator } from "../utils/AnchorGenerator";
import { epubInlineText, parseEpubHtml } from "./EpubTokenRenderer";
import {
	EpubBuildError,
	type EpubDiagnostic,
	type TelegraphNode,
} from "./EpubTypes";
import type {
	AnchorTarget,
	EpubAtomicUnit,
	ImageSymbol,
	LinkSymbol,
	OutlineNode,
	PageTarget,
	ParsedSource,
	ParseOptions,
	ReferenceDefinition,
	SourceDescriptor,
	SourceKey,
	SourceRange,
	TargetId,
	UnitId,
} from "./EpubTypes";

/** Split only unescaped pipes, preserving empty cells and optional outer borders. */
function splitTableRow(line: string): string[] {
	const source = line.trim();
	const cells: string[] = [];
	let cell = "";
	let leadingBorder = false;
	let trailingBorder = false;
	for (let i = 0; i < source.length; i++) {
		const char = source[i]!;
		if (char !== "|") {
			cell += char;
			continue;
		}
		let backslashes = 0;
		for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) backslashes++;
		if (backslashes % 2 === 1) {
			cell = cell.slice(0, -1) + "|";
			continue;
		}
		if (i === 0) leadingBorder = true;
		if (i === source.length - 1) trailingBorder = true;
		cells.push(cell.trim());
		cell = "";
	}
	cells.push(cell.trim());
	if (leadingBorder) cells.shift();
	if (trailingBorder) cells.pop();
	return cells;
}

function isTableDelimiter(line: string): boolean {
	const cells = splitTableRow(line);
	return (
		line.includes("|") &&
		cells.length > 0 &&
		cells.every((cell) => /^:?-+:?$/.test(cell))
	);
}

function parseTableToken(src: string, lexer: Lexer): Token | undefined {
	const lines = src.split(/\r?\n/);
	if (lines.length < 2) return;
	if (!lines[0]!.includes("|") || !isTableDelimiter(lines[1]!)) return;
	const tableLines = [lines[0]!, lines[1]!];
	for (let i = 2; i < lines.length; i++) {
		const line = lines[i]!;
		if (
			!line.trim() ||
			!line.includes("|") ||
			/^[ \t]{0,3}(`{3,}|~{3,})/.test(line)
		)
			break;
		tableLines.push(line);
	}
	const headers = splitTableRow(tableLines[0]!);
	const delimiterCells = splitTableRow(tableLines[1]!);
	const rows = tableLines.slice(2).map(splitTableRow);
	const width = Math.max(
		headers.length,
		delimiterCells.length,
		...rows.map((r) => r.length),
	);
	const columns = Array.from({ length: width }, (_, i) => headers[i] ?? "");
	const align: ("center" | "left" | "right" | null)[] = Array.from(
		{ length: width },
		(_, i) => {
			const cell = delimiterCells[i] ?? "";
			if (/^:-+:$/.test(cell)) return "center";
			if (/^:-+$/.test(cell)) return "left";
			if (/^-+:$/.test(cell)) return "right";
			return null;
		},
	);
	const raw = tableLines.join("\n");
	return {
		type: "table",
		raw,
		header: columns.map((h, i) => ({
			text: h,
			tokens: h ? (lexer.inlineTokens(h.replace(/\\/g, "\\\\")) as Token[]) : [],
			header: true,
			align: align[i] ?? null,
		})),
		align,
		rows: rows.map((r) =>
			columns.map((_, i) => ({
				text: r[i] ?? "",
				tokens: r[i] ? (lexer.inlineTokens(r[i]!.replace(/\\/g, "\\\\")) as Token[]) : [],
				header: false,
				align: align[i] ?? null,
			})),
		),
	};
}

type ListMarker = {
	indent: number;
	tag: "ol" | "ul";
	number?: number;
	text: string;
};

function listIndent(line: string): number {
	return (line.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
}

function matchListMarker(line: string): ListMarker | null {
	if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return null;
	if (/^[ \t]{0,3}#{1,10}[ \t]/.test(line)) return null;
	const match = line.match(/^[ \t]*(?:(\d{1,9})[.)]|([-*+]))[ \t]+(.*)$/);
	if (!match) return null;
	return {
		indent: listIndent(line),
		tag: match[1] ? "ol" : "ul",
		number: match[1] ? Number(match[1]) : undefined,
		text: match[3] ?? "",
	};
}

function parseListToken(src: string, lexer: Lexer): Token | undefined {
	const lines = src.split(/\r?\n/);
	if (!lines.length) return;
	const firstMarker = matchListMarker(lines[0]!);
	if (!firstMarker || firstMarker.indent > 3) return;

	function parseLevel(startIdx: number): { token: Token; next: number } | null {
		const first = matchListMarker(lines[startIdx]!);
		if (!first) return null;
		const items: any[] = [];
		const numbers: number[] = [];
		let cursor = startIdx;

		while (cursor < lines.length) {
			const marker = matchListMarker(lines[cursor]!);
			if (!marker || marker.indent !== first.indent || marker.tag !== first.tag)
				break;

			const itemSubTokens: Token[] = [];
			let paragraph = [marker.text];

			function flushPara() {
				if (!paragraph.length) return;
				const pText = paragraph.join("\n");
				itemSubTokens.push({
					type: "paragraph",
					raw: pText,
					text: pText,
					tokens: lexer.inline(pText) as Token[],
				});
				paragraph = [];
			}

			cursor++;
			while (cursor < lines.length) {
				const line = lines[cursor]!;
				if (!line.trim()) {
					flushPara();
					cursor++;
					continue;
				}
				if (listIndent(line) <= first.indent) {
					const nextMarker = matchListMarker(line);
					if (
						nextMarker &&
						nextMarker.indent === first.indent &&
						nextMarker.tag === first.tag
					) {
						break;
					}
					break;
				}
				const nested = matchListMarker(line);
				if (nested && nested.indent > first.indent) {
					flushPara();
					const subList = parseLevel(cursor);
					if (subList) {
						itemSubTokens.push(subList.token);
						cursor = subList.next;
						continue;
					}
				}
				const body = line.trimStart();
				const fence = body.match(/^(`{3,}|~{3,})/);
				if (fence) {
					flushPara();
					const code: string[] = [];
					const indent = line.match(/^[ \t]*/)?.[0]?.length ?? 0;
					cursor++;
					while (
						cursor < lines.length &&
						!new RegExp(`^${fence[1]![0]}{${fence[1]!.length},}\\s*$`).test(
							lines[cursor]!.trimStart(),
						)
					) {
						code.push(lines[cursor]!.slice(indent));
						cursor++;
					}
					if (cursor < lines.length) cursor++;
					const cText = code.join("\n").trimEnd();
					itemSubTokens.push({
						type: "code",
						raw: `${fence[0]}\n${code.join("\n")}\n${fence[0]}`,
						text: cText,
					});
					continue;
				}
				paragraph.push(body);
				cursor++;
			}
			flushPara();
			if (marker.number !== undefined) numbers.push(marker.number);
			items.push({
				type: "list_item",
				raw: "",
				task: false,
				loose: false,
				text: "",
				tokens: itemSubTokens,
				value: marker.number,
			});
		}

		if (first.tag === "ol") {
			numbers.forEach((number, index) => {
				if (index > 0 && number !== numbers[index - 1]! + 1) {
					items[index]!.attrs = { value: String(number) };
				}
			});
		}

		while (cursor > startIdx && !lines[cursor - 1]?.trim()) cursor--;

		const consumedLines = lines.slice(startIdx, cursor);
		const raw = consumedLines.join("\n");
		const token: any = {
			type: "list",
			raw,
			ordered: first.tag === "ol",
			start:
				numbers.length && numbers[0] !== undefined ? numbers[0] : 1,
			loose: false,
			items,
			...(first.tag === "ol" && numbers[0] !== 1
				? { attrs: { start: String(numbers[0]) } }
				: {}),
		};

		return { token, next: cursor };
	}

	const res = parseLevel(0);
	if (!res) return;
	return res.token;
}

/**
 * Creates an isolated local Marked instance with EPUB-specific extensions.
 * Never mutates or calls global marked.use().
 */
function createLocalMarked(): Marked {
	const markedInstance = new Marked();
	const baseTokenizer = new Tokenizer();
	new Lexer({ tokenizer: baseTokenizer });
	markedInstance.use({
		gfm: true,
		breaks: false,
		extensions: [
			{
				name: "verse-before-hr",
				level: "block",
				tokenizer(src) {
					const match =
						/^([^\n]+[|\u0964\u0965](?:\*|_)*)\r?\n(?=(?:-{3,}|\*{3,}|_{3,})\s*(?:\r?\n|$))/.exec(
							src,
						);
					if (match) {
						return {
							type: "paragraph",
							raw: match[0],
							text: match[1]!,
							tokens: this.lexer.inline(match[1]!) as Token[],
						};
					}
				},
			},
			{
				name: "epub-table",
				level: "block",
				tokenizer(src) {
					return parseTableToken(src, this.lexer);
				},
			},
			{
				name: "epub-list",
				level: "block",
				tokenizer(src) {
					return parseListToken(src, this.lexer);
				},
			},
			{
				name: "epub-definition",
				level: "block",
				tokenizer(src) {
					const token = baseTokenizer.def(src);
					if (!token) return;
					// Built-in Marked drops duplicate definitions from token output. Retain each
					// metadata range while preserving its file-wide first-definition-wins table.
					this.lexer.tokens.links[token.tag] ??= {
						href: token.href,
						title: token.title,
					};
					return token;
				},
			},
		],
		tokenizer: {
			heading(src) {
				// Support ATX headings with up to 10 hashes (# to ##########)
				const match = /^ {0,3}(#+)[ \t]+([^\n]+?)(?:[ \t]+#+)? *(?:\n+|$)/.exec(
					src,
				);
				if (match) {
					let text = match[2]?.trim() ?? "";
					let explicitId: string | undefined;

					// Check for EPUB-only {#custom-id} explicit anchor extension
					const customMatch = text.match(/^(.*?)[ \t]+{#([^\s{}]+)}$/);
					if (
						customMatch &&
						!/\\\{#/.test(text) &&
						customMatch[1] !== undefined &&
						customMatch[2] !== undefined
					) {
						text = customMatch[1].trim();
						explicitId = customMatch[2];
					}

					return {
						type: "heading",
						raw: match[0],
						depth: match[1]?.length ?? 1,
						text,
						explicitId,
						tokens: this.lexer.inline(text),
					};
				}
				return false;
			},
		},
	});
	return markedInstance;
}

/**
 * Parses front matter from source if present.
 */
function extractFrontMatter(source: string): {
	metadata: Record<string, string>;
	body: string;
	frontMatterRange?: SourceRange;
} {
	const match = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(source);
	if (!match || match.index !== 0) return { metadata: {}, body: source };
	const metadata: Record<string, string> = {};
	for (const line of match[1]!.split(/\r?\n/)) {
		const m = /^([^:]+):\s*(.*?)\s*$/.exec(line);
		if (m) metadata[m[1]!.trim()] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
	}
	return {
		metadata,
		body: source.slice(match[0].length),
		frontMatterRange: {
			startByte: 0,
			endByte: Buffer.byteLength(match[0]),
			startLine: 1,
			endLine: 1 + (match[0].match(/\n/g)?.length ?? 0),
		},
	};
}

/**
 * Traverses tokens recursively to extract LinkSymbol and ImageSymbol records.
 */
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

		// Recurse into nested token containers
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
			for (let j = 0; j < token.header.length; j++) {
				const cell = token.header[j];
				if (cell && "tokens" in cell && Array.isArray(cell.tokens)) {
					const nested = extractSymbolsFromTokens(
						cell.tokens,
						unitId,
						sourceKey,
						unitRange,
						[...nodePath, 0, j],
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

/**
 * Helper to generate a unique ASCII anchor ID.
 */
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

/**
 * Builds the hierarchical outline tree from flat outline nodes.
 */
function buildOutlineTree(flatNodes: OutlineNode[]): OutlineNode[] {
	const rootNodes: OutlineNode[] = [];
	const stack: OutlineNode[] = [];

	for (const node of flatNodes) {
		while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
			stack.pop();
		}

		if (stack.length === 0) {
			rootNodes.push(node);
		} else {
			stack[stack.length - 1]!.children.push(node);
		}

		stack.push(node);
	}

	return rootNodes;
}

/**
 * Parses Markdown source for EPUB into a strictly-typed ParsedSource.
 */
export function parseEpubMarkdown(
	source: string,
	sourceKey: SourceKey,
	options: ParseOptions = {},
): ParsedSource {
	const sourceOrdinal = options.sourceOrdinal ?? 1;
	const { metadata, body, frontMatterRange } = extractFrontMatter(source);
	// Marked normalizes CRLF/lone CR. Map its offsets back to the original UTF-8 source.
	let normalized = "";
	const originalOffsets: number[] = [0];
	for (let i = 0; i < body.length; i++) {
		if (body[i] === "\r") {
			if (body[i + 1] === "\n") i++;
			normalized += "\n";
		} else normalized += body[i];
		originalOffsets.push(i + 1);
	}
	const rawTokens = createLocalMarked().lexer(normalized);
	const units: EpubAtomicUnit[] = [];
	const payloadStore: ParsedSource["payloadStore"] = new Map();
	const anchors: AnchorTarget[] = [];
	const flatOutlineNodes: OutlineNode[] = [];
	const definitions = new Map<string, ReferenceDefinition>();
	const allLinks: LinkSymbol[] = [];
	const pages: PageTarget[] = [];
	const allImages: ImageSymbol[] = [];
	const diagnostics: EpubDiagnostic[] = [];
	const coverageRanges: SourceRange[] = frontMatterRange
		? [frontMatterRange]
		: [];
	const usedIds = new Set<string>();
	const explicitIds = new Set<string>();
	const pageCounts = new Map<number, number>();
	let anchorOrdinal = 0;
	let cursor = 0;
	let byteCursor = frontMatterRange?.endByte ?? 0;
	let lineCursor = frontMatterRange?.endLine ?? 1;
	let originalCursor = 0;
	type Extended = Token & {
		anchorId?: string;
		explicitId?: string;
		pageIds?: string[];
	};
	const children = (t: Token): Token[] => {
		const out: Token[] = [];
		if ("tokens" in t && Array.isArray(t.tokens)) out.push(...t.tokens);
		if (t.type === "list") for (const item of t.items) out.push(...item.tokens);
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
	const htmlNodes = (t: Token): TelegraphNode[] => {
		if (t.type !== "html") return [];
		const result: TelegraphNode[] = [];
		const collect = (nodes: (string | TelegraphNode)[]) => {
			for (const n of nodes)
				if (typeof n !== "string") {
					result.push(n);
					collect(n.children ?? []);
				}
		};
		let raw = t.raw;
		const opening = /^<([a-z][\w:-]*)(?:\s[^>]*)?>$/i.exec(raw.trim());
		if (opening && !/^(?:br|hr|img)$/i.test(opening[1]!))
			raw += `</${opening[1]}>`;
		if (/^<\//.test(raw)) return [];
		collect(parseEpubHtml(raw, { sourceKey, pageBreaks: false }));
		return result;
	};
	const explicitFor = (t: Extended): string[] => [
		...(t.type === "heading" && t.explicitId
			? [t.explicitId.normalize("NFC")]
			: []),
		...htmlNodes(t).flatMap((n) =>
			n.attrs?.id ? [n.attrs.id.normalize("NFC")] : [],
		),
	];
	// Setext headings use Marked's native tokenizer, so apply the same suffix extension here.
	for (const token of rawTokens)
		walk(token, (t) => {
			if (t.type !== "heading" || t.explicitId) return;
			const m = /^(.*?)[ \t]+{#([^\s{}]+)}$/.exec(t.text);
			if (m && !/\\\{#/.test(t.text)) {
				t.text = m[1]!.trim();
				t.explicitId = m[2];
				t.tokens =
					createLocalMarked().lexer(t.text)[0]?.type === "paragraph"
						? (
								createLocalMarked().lexer(
									t.text,
								)[0] as import("marked").Tokens.Paragraph
							).tokens
						: t.tokens;
			}
		});
	// Reserve every explicit ID before generating heading slugs, including later IDs.
	for (const token of rawTokens)
		walk(token, (t) => {
			for (const id of explicitFor(t)) {
				if (explicitIds.has(id))
					throw new EpubBuildError(
						`Duplicate explicit anchor: ${id}`,
						"E_ANCHOR_DUPLICATE",
						[
							{
								code: "E_ANCHOR_DUPLICATE",
								severity: "error",
								source: sourceKey,
								message: `Duplicate explicit anchor: ${id}`,
							},
						],
					);
				explicitIds.add(id);
				usedIds.add(id);
			}
		});
	// Reserve page IDs before generated headings as well; never scan code/raw Markdown.
	for (const token of rawTokens)
		walk(token, (t) => {
			if (t.type !== "html" || !options.pageBreaks) return;
			t.pageIds = [];
			for (const match of t.raw.matchAll(
				/<!--\s*(?:Page|Страница)\s+(\d+)\s*-->/gi,
			)) {
				const n = Number(match[1]);
				const count = (pageCounts.get(n) ?? 0) + 1;
				pageCounts.set(n, count);
				const base = count === 1 ? `page-${n}` : `page-${n}-${count}`;
				const id = getUniqueAnchorId(base, usedIds);
				t.pageIds.push(id);
				if (count > 1 || id !== base)
					diagnostics.push({
						code: "W_PAGE_DUPLICATE",
						severity: "warning",
						source: sourceKey,
						message: `Page ${n} uses unique ID ${id}.`,
					});
			}
		});
	for (const token of rawTokens) {
		if (!normalized.startsWith(token.raw, cursor))
			throw new EpubBuildError(
				"Marked token ranges do not cover source in order",
				"E_SOURCE_COVERAGE",
			);
		const start = cursor;
		cursor += token.raw.length;
		const originalEnd = originalOffsets[cursor]!;
		const delta = body.slice(originalCursor, originalEnd);
		const endByte = byteCursor + Buffer.byteLength(delta);
		const endLine = lineCursor + (token.raw.match(/\n/g)?.length ?? 0);
		const range: SourceRange = {
			startByte: byteCursor,
			endByte,
			startLine: lineCursor,
			endLine,
		};
		byteCursor = endByte;
		lineCursor = endLine;
		originalCursor = originalEnd;
		coverageRanges.push(range);
		if (token.type === "space") continue;
		if (token.type === "def") {
			const label = token.tag.toLowerCase().replace(/\s+/g, " ").trim();
			if (definitions.has(label))
				diagnostics.push({
					code: "W_REFERENCE_DUPLICATE",
					severity: "warning",
					source: sourceKey,
					range,
					message: `First definition wins for ${label}.`,
				});
			else
				definitions.set(label, {
					label,
					href: token.href,
					title: token.title,
					range,
				});
			continue;
		}
		const ordinal = units.length + 1;
		const unitId = `s${sourceOrdinal}-u${ordinal}`;
		const anchorIds: TargetId[] = [];
		const add = (
			id: string,
			aliases: string[],
			kind: AnchorTarget["kind"],
		): TargetId => {
			const targetId = `s${sourceOrdinal}-a${++anchorOrdinal}`;
			anchorIds.push(targetId);
			anchors.push({
				targetId,
				sourceKey,
				unitId,
				id,
				aliases: [...new Set([id, ...aliases])],
				kind,
				ordinal: anchorOrdinal,
			});
			return targetId;
		};
		let heading: EpubAtomicUnit["heading"];
		walk(token, (t) => {
			if (t.type === "heading") {
				const text = epubInlineText(t.tokens ?? []);
				const info = AnchorGenerator.extractHeadingInfo([
					"",
					"#".repeat(t.depth),
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
				const data = { level: t.depth, text, targetId };
				if (t === token) heading = data;
				flatOutlineNodes.push({
					id,
					sourceKey,
					level: t.depth,
					label: text,
					targetId,
					children: [],
				});
			}
			if (t.type === "html") {
				for (const n of htmlNodes(t))
					if (n.attrs?.id) add(n.attrs.id.normalize("NFC"), [], "explicit");
				let page = 0;
				if (options.pageBreaks)
					for (const match of t.raw.matchAll(
						/<!--\s*(?:Page|Страница)\s+(\d+)\s*-->/gi,
					)) {
						const n = Number(match[1]);
						const id = t.pageIds?.[page++]!;
						const targetId = add(id, [String(n)], "page");
						pages.push({
							targetId,
							sourceKey,
							unitId,
							pageNumber: n,
							label: String(n),
							id,
						});
					}
			}
		});
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
		const symbols = extractSymbolsFromTokens([token], unitId, sourceKey, range);
		allLinks.push(...symbols.links);
		allImages.push(...symbols.images);
		// Raw HTML links/images participate in the same registry as Markdown symbols.
		walk(token, (t) => {
			for (const n of htmlNodes(t)) {
				if (n.tag === "a" && n.attrs?.href) {
					const symbol: LinkSymbol = {
						sourceKey,
						unitId,
						nodePath: [],
						rawHref: n.attrs.href,
						range,
						kind: "content",
					};
					symbols.links.push(symbol);
					allLinks.push(symbol);
				}
				if (n.tag === "img" && n.attrs?.src) {
					const symbol: ImageSymbol = {
						sourceKey,
						unitId,
						rawSrc: n.attrs.src,
						altText: n.attrs.alt,
						title: n.attrs.title,
						range,
					};
					symbols.images.push(symbol);
					allImages.push(symbol);
				}
			}
		});
		payloadStore.set(unitId, { tokens: [token], ...symbols });
		units.push({
			id: unitId,
			sourceKey,
			ordinal,
			range,
			kind,
			heading,
			keepWithNext: false,
			anchorIds,
			payloadRef: unitId,
		});
	}
	if (cursor !== normalized.length)
		throw new EpubBuildError(
			"Source coverage has a trailing gap",
			"E_SOURCE_COVERAGE",
		);
	for (let i = 0; i < units.length - 1; i++) {
		const unit = units[i]!;
		const token = payloadStore.get(unit.payloadRef)!.tokens[0]!;
		const nontext = token.type === "html" && !epubInlineText([token]).trim();
		unit.keepWithNext = unit.kind === "heading" || nontext;
	}
	const title =
		options.sourceTitle ??
		metadata.title ??
		flatOutlineNodes[0]?.label ??
		sourceKey.split(/[/\\]/).pop()?.replace(/\.md$/i, "") ??
		"Untitled";
	const originalBytes = Buffer.byteLength(source);
	return {
		descriptor: {
			key: sourceKey,
			ordinal: sourceOrdinal,
			title,
			originalBytes,
			sha256: createHash("sha256").update(source).digest("hex"),
			metadata,
		},
		units,
		payloadStore,
		anchors,
		outline: buildOutlineTree(flatOutlineNodes),
		definitions,
		links: allLinks,
		pages,
		images: allImages,
		diagnostics,
		coverage: {
			totalBytes: originalBytes,
			coveredBytes: coverageRanges.reduce(
				(n, r) => n + r.endByte - r.startByte,
				0,
			),
			ranges: coverageRanges,
		},
	};
}
