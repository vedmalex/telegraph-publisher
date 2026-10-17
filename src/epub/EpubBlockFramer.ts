import { Lexer, Marked, type Token, Tokenizer } from "marked";
import {
	EpubBuildError,
	type ReferenceDefinition,
	type SourceRange,
} from "./EpubTypes";

export interface FramedBlock {
	raw: string;
	range: SourceRange;
	complete: boolean;
	type?: string;
}

function splitTableRow(line: string): string[] {
	const source = line.trim();
	const cells: string[] = [];
	let cell = "";
	let leadingBorder = false;
	let trailingBorder = false;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (char !== "|") {
			cell += char;
			continue;
		}
		let backslashes = 0;
		for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) backslashes++;
		if (backslashes % 2 === 1) {
			cell = `${cell.slice(0, -1)}|`;
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
	const firstLine = lines[0];
	const secondLine = lines[1];
	if (!firstLine || !secondLine) return;
	if (!firstLine.includes("|") || !isTableDelimiter(secondLine)) return;
	const tableLines = [firstLine, secondLine];
	for (let i = 2; i < lines.length; i++) {
		const line = lines[i];
		if (
			!line ||
			!line.trim() ||
			!line.includes("|") ||
			/^[ \t]{0,3}(`{3,}|~{3,})/.test(line)
		)
			break;
		tableLines.push(line);
	}
	const headers = splitTableRow(firstLine);
	const delimiterCells = splitTableRow(secondLine);
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
			tokens: h
				? (lexer.inlineTokens(h.replace(/\\/g, "\\\\")) as Token[])
				: [],
			header: true,
			align: align[i] ?? null,
		})),
		align,
		rows: rows.map((r) =>
			columns.map((_, i) => ({
				text: r[i] ?? "",
				tokens: r[i]
					? (lexer.inlineTokens(r[i]?.replace(/\\/g, "\\\\") ?? "") as Token[])
					: [],
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
	const firstLine = lines[0];
	if (!firstLine) return;
	const firstMarker = matchListMarker(firstLine);
	if (!firstMarker || firstMarker.indent > 3) return;

	function parseLevel(startIdx: number): { token: Token; next: number } | null {
		const startLine = lines[startIdx];
		if (!startLine) return null;
		const first = matchListMarker(startLine);
		if (!first) return null;
		const items: Array<{
			type: "list_item";
			raw: string;
			task: boolean;
			loose: boolean;
			text: string;
			tokens: Token[];
			value?: number;
			attrs?: { value: string };
		}> = [];
		const numbers: number[] = [];
		let cursor = startIdx;

		while (cursor < lines.length) {
			const currentLine = lines[cursor];
			if (!currentLine) break;
			const marker = matchListMarker(currentLine);
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
				const line = lines[cursor];
				if (!line) {
					cursor++;
					continue;
				}
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
					const fenceChar = fence[1]?.[0] ?? "`";
					const fenceLen = fence[1]?.length ?? 3;
					cursor++;
					while (cursor < lines.length) {
						const codeLine = lines[cursor];
						if (!codeLine) break;
						if (
							new RegExp(`^${fenceChar}{${fenceLen},}\\s*$`).test(
								codeLine.trimStart(),
							)
						) {
							break;
						}
						code.push(codeLine.slice(indent));
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
				const prev = numbers[index - 1];
				if (index > 0 && prev !== undefined && number !== prev + 1) {
					const targetItem = items[index];
					if (targetItem) {
						targetItem.attrs = { value: String(number) };
					}
				}
			});
		}

		while (cursor > startIdx && !lines[cursor - 1]?.trim()) cursor--;

		const consumedLines = lines.slice(startIdx, cursor);
		const raw = consumedLines.join("\n");
		const token: Token = {
			type: "list",
			raw,
			ordered: first.tag === "ol",
			start: numbers.length && numbers[0] !== undefined ? numbers[0] : 1,
			loose: false,
			items,
			...(first.tag === "ol" && numbers[0] !== 1
				? { attrs: { start: String(numbers[0]) } }
				: {}),
		} as unknown as Token;

		return { token, next: cursor };
	}

	const res = parseLevel(0);
	if (!res) return;
	return res.token;
}

export function createFramerMarked(
	definitions?: Map<string, ReferenceDefinition>,
): Marked {
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
							text: match[1] ?? "",
							tokens: this.lexer.inline(match[1] ?? "") as Token[],
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
				const match = /^ {0,3}(#+)[ \t]+([^\n]+?)(?:[ \t]+#+)? *(?:\n+|$)/.exec(
					src,
				);
				if (match) {
					let text = match[2]?.trim() ?? "";
					let explicitId: string | undefined;
					const customMatch = text.match(/^(.*?)[ \t]+{#([^\\s{}]+)}$/);
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

	if (definitions && definitions.size > 0) {
		markedInstance.lexer = (src: string, options?: any) => {
			const lexer = new Lexer(options ?? markedInstance.defaults);
			for (const [key, def] of definitions.entries()) {
				lexer.tokens.links[key.toLowerCase()] = {
					href: def.href,
					title: def.title ?? "",
				};
			}
			return lexer.lex(src);
		};
	}

	return markedInstance;
}

export class EpubBlockFramer {
	private readonly initialLine: number;
	private readonly initialByte: number;
	private currentLine: number;
	private currentByte: number;
	private buffer = "";
	private readonly marked: Marked;

	constructor(options?: {
		initialLine?: number;
		initialByte?: number;
		definitions?: Map<string, ReferenceDefinition>;
	}) {
		this.initialLine = options?.initialLine ?? 1;
		this.initialByte = options?.initialByte ?? 0;
		this.currentLine = this.initialLine;
		this.currentByte = this.initialByte;
		this.marked = createFramerMarked(options?.definitions);
	}

	push(text: string, endOfInput = false): FramedBlock[] {
		this.buffer += text;
		const result: FramedBlock[] = [];

		while (this.buffer.length > 0) {
			let inputToProcess = this.buffer;
			if (!endOfInput && inputToProcess.endsWith("\r")) {
				inputToProcess = inputToProcess.slice(0, -1);
			}
			if (inputToProcess.length === 0) break;

			if (!endOfInput) {
				const lastNl = inputToProcess.lastIndexOf("\n");
				if (lastNl === -1) break;
				inputToProcess = inputToProcess.slice(0, lastNl + 1);
			}

			let normalized = "";
			const originalOffsets = [0];
			for (let i = 0; i < inputToProcess.length; i++) {
				const char = inputToProcess[i];
				if (char === "\r") {
					if (inputToProcess[i + 1] === "\n") i++;
					normalized += "\n";
				} else {
					normalized += char ?? "";
				}
				originalOffsets.push(i + 1);
			}

			const tokens = this.marked.lexer(normalized);
			if (tokens.length === 0) {
				if (endOfInput && this.buffer.trim().length > 0) {
					throw new EpubBuildError(
						"Unconsumed non-whitespace text cannot form a valid block",
						"E_PARSE",
					);
				}
				break;
			}

			let safeCount = endOfInput ? tokens.length : 0;
			if (!endOfInput) {
				for (let i = 0; i < tokens.length - 1; i++) {
					const t = tokens[i];
					if (!t) break;
					if (t.type === "list") {
						const onlySpacesAfter = tokens
							.slice(i + 1)
							.every((x) => x.type === "space");
						if (onlySpacesAfter) break;
					}
					if (t.type === "code") {
						const openMatch = t.raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
						if (openMatch) {
							const fenceChar = openMatch[1]?.[0] ?? "`";
							const fenceLen = openMatch[1]?.length ?? 3;
							const escapedChar = fenceChar === "`" ? "\\`" : "~";
							const closeRegex = new RegExp(
								`\\n[ \\t]{0,3}${escapedChar}{${fenceLen},}[ \\t]*(\\r?\\n|$)`,
							);
							if (!closeRegex.test(t.raw)) break;
						}
					}
					if (t.type === "html") {
						if (t.raw.startsWith("<!--") && !t.raw.includes("-->")) break;
						if (/^<script/i.test(t.raw) && !/<\/script>/i.test(t.raw)) break;
						if (/^<style/i.test(t.raw) && !/<\/style>/i.test(t.raw)) break;
						if (/^<pre/i.test(t.raw) && !/<\/pre>/i.test(t.raw)) break;
					}
					safeCount = i + 1;
				}
			}

			if (safeCount === 0) break;

			let consumedNormalized = 0;
			for (let i = 0; i < safeCount; i++) {
				const token = tokens[i];
				if (!token) break;
				const tokenLen = token.raw.length;
				const startNorm = consumedNormalized;
				const endNorm = startNorm + tokenLen;
				consumedNormalized = endNorm;

				const origStart = originalOffsets[startNorm] ?? 0;
				const origEnd = originalOffsets[endNorm] ?? inputToProcess.length;
				const raw = inputToProcess.slice(origStart, origEnd);

				const endByte = this.currentByte + Buffer.byteLength(raw, "utf8");
				const endLine = this.currentLine + (raw.match(/\n/g)?.length ?? 0);

				result.push({
					raw,
					range: {
						startByte: this.currentByte,
						endByte,
						startLine: this.currentLine,
						endLine,
					},
					complete: true,
					type: token.type,
				});

				this.currentByte = endByte;
				this.currentLine = endLine;
			}

			const totalOrigConsumed =
				originalOffsets[consumedNormalized] ?? inputToProcess.length;
			this.buffer = this.buffer.slice(totalOrigConsumed);
		}

		if (endOfInput && this.buffer.trim().length > 0) {
			throw new EpubBuildError(
				"Unconsumed non-whitespace text cannot form a valid block",
				"E_PARSE",
			);
		}

		return result;
	}

	finish(): FramedBlock[] {
		return this.push("", true);
	}
}
