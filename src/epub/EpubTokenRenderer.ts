import type { Token, Tokens } from "marked";
import { AnchorGenerator } from "../utils/AnchorGenerator";
import type { EpubRenderContext, TelegraphNode } from "./EpubTypes";

/** Decode character references before the XHTML serializer escapes text once. */
export function decodeEpubEntities(text: string): string {
	const named: Record<string, string> = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		nbsp: "\u00a0",
		ndash: "–",
		mdash: "—",
		hellip: "…",
		copy: "©",
		reg: "®",
		laquo: "«",
		raquo: "»",
		lsquo: "‘",
		rsquo: "’",
		ldquo: "“",
		rdquo: "”",
	};
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, key: string) => {
		if (key[0] !== "#") return named[key] ?? raw;
		const n =
			key[1]?.toLowerCase() === "x"
				? parseInt(key.slice(2), 16)
				: parseInt(key.slice(1), 10);
		return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
			? String.fromCodePoint(n)
			: "\ufffd";
	});
}
const htmlTags = new Set(
	"p div span a em strong del code pre blockquote ul ol li table thead tbody tr th td h1 h2 h3 h4 h5 h6 br hr img".split(
		" ",
	),
);
const voidTags = new Set(["br", "hr", "img"]);
const allowedAttrs = new Set(
	"id name href src alt title class start colspan rowspan scope aria-label epub:type role align".split(
		" ",
	),
);
function unsupported(
	raw: string,
	context: EpubRenderContext,
): (string | TelegraphNode)[] {
	context.diagnostics?.push({
		code: "W_HTML_UNSUPPORTED",
		severity: "warning",
		source: context.sourceKey,
		message: "Unsupported HTML was preserved as literal text.",
	});
	return [raw];
}
/** Strict structural HTML subset: unsupported or malformed fragments stay visible. */
export function parseEpubHtml(
	raw: string,
	context: EpubRenderContext,
): (string | TelegraphNode)[] {
	const root: (string | TelegraphNode)[] = [];
	const stack: { tag: string; children: (string | TelegraphNode)[] }[] = [
		{ tag: "", children: root },
	];
	const parts =
		raw.match(
			/<!--[\s\S]*?-->|<\/?[A-Za-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</g,
		) ?? [];
	for (const part of parts) {
		const current = stack[stack.length - 1]!;
		if (part.startsWith("<!--")) {
			const page = /^<!--\s*(?:Page|Страница)\s+(\d+)\s*-->$/i.exec(part);
			if (page && context.pageBreaks) {
				const number = page[1]!;
				// IDs are attached to HTML tokens by the document pass; this helper is also public.
				const attrs: Record<string, string> = {
					id: `page-${number}`,
					"aria-label": number,
				};
				if (context.epubVersion !== 2) {
					attrs["epub:type"] = "pagebreak";
					attrs.role = "doc-pagebreak";
				}
				current.children.push({ tag: "span", attrs, children: [] });
			}
			continue;
		}
		if (!part.startsWith("<")) {
			current.children.push(decodeEpubEntities(part));
			continue;
		}
		const match = /^<(\/)?([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/.exec(part);
		if (!match) return unsupported(raw, context);
		const tag = match[2]!.toLowerCase();
		if (!htmlTags.has(tag)) return unsupported(raw, context);
		if (match[1]) {
			if (match[3]!.trim() || stack.length === 1 || current.tag !== tag)
				return unsupported(raw, context);
			stack.pop();
			continue;
		}
		const attrs: Record<string, string> = {};
		let rest = match[3]!;
		while (rest.trim()) {
			const attr =
				/^\s+([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(
					rest,
				);
			if (!attr) return unsupported(raw, context);
			rest = rest.slice(attr[0].length);
			const name = attr[1]!.toLowerCase();
			if (!allowedAttrs.has(name)) return unsupported(raw, context);
			let value = decodeEpubEntities(attr[2] ?? attr[3] ?? attr[4] ?? "");
			if (
				(name === "href" || name === "src") &&
				/^\s*(?:javascript|vbscript):/i.test(value)
			)
				return unsupported(raw, context);
			if (name === "href") value = context.targetMap?.get(value) ?? value;
			if (name === "src") value = context.imageMap?.get(value) ?? value;
			attrs[name === "name" && tag === "a" ? "id" : name] = value;
		}
		const node: TelegraphNode = {
			tag,
			children: [],
			...(Object.keys(attrs).length ? { attrs } : {}),
		};
		current.children.push(node);
		if (!voidTags.has(tag) && !match[4])
			stack.push({ tag, children: node.children! });
	}
	return stack.length === 1 ? root : unsupported(raw, context);
}

function inline(
	tokens: readonly Token[],
	context: EpubRenderContext,
	verse = false,
): (string | TelegraphNode)[] {
	// HTML inline tokens are individual opening/closing tags. Parse them together,
	// retaining Markdown-generated nodes in opaque slots rather than reparsing their text.
	if (tokens.some((t) => t.type === "html")) {
		let marker = "\u0000epub-slot:";
		while (tokens.some((t) => t.raw.includes(marker))) marker += "_";
		const slots: (string | TelegraphNode)[][] = [];
		const raw = tokens
			.map((t) =>
				t.type === "html"
					? t.raw
					: `${marker}${slots.push(inline([t], context, verse)) - 1}\u0000`,
			)
			.join("");
		const nodes = parseEpubHtml(raw, context);
		const expand = (
			children: (string | TelegraphNode)[],
		): (string | TelegraphNode)[] =>
			children.flatMap((child) => {
				if (typeof child !== "string") {
					if (child.children) child.children = expand(child.children);
					return [child];
				}
				const out: (string | TelegraphNode)[] = [];
				let cursor = 0;
				for (
					let pos = child.indexOf(marker);
					pos >= 0;
					pos = child.indexOf(marker, cursor)
				) {
					const end = child.indexOf("\u0000", pos + marker.length);
					if (end < 0) break;
					out.push(
						child.slice(cursor, pos),
						...(slots[Number(child.slice(pos + marker.length, end))] ?? []),
					);
					cursor = end + 1;
				}
				out.push(child.slice(cursor));
				return out.filter((x) => x !== "");
			});
		return expand(nodes);
	}
	const out: (string | TelegraphNode)[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case "text":
				if (token.tokens)
					out.push(...inline(token.tokens ?? [], context, verse));
				else {
					const text = decodeEpubEntities(token.text);
					const lines = verse ? text.split("\n") : [text];
					lines.forEach((line, i) => {
						if (i) out.push({ tag: "br" });
						out.push(line);
					});
				}
				break;
			case "escape":
				out.push(token.text);
				break;
			case "strong":
			case "em":
			case "del":
				out.push({
					tag: token.type,
					children: inline(token.tokens ?? [], context, verse),
				});
				break;
			case "codespan":
				out.push({ tag: "code", children: [token.text] });
				break;
			case "link":
				out.push({
					tag: "a",
					attrs: {
						href: context.targetMap?.get(token.href) ?? token.href,
						...(token.title ? { title: token.title } : {}),
					},
					children: inline(token.tokens ?? [], context, verse),
				});
				break;
			case "image":
				out.push({
					tag: "img",
					attrs: {
						src: context.imageMap?.get(token.href) ?? token.href,
						alt: decodeEpubEntities(token.text),
						...(token.title ? { title: token.title } : {}),
					},
				});
				break;
			case "br":
				out.push({ tag: "br" });
				break;
			default:
				if ("text" in token && typeof token.text === "string")
					out.push(decodeEpubEntities(token.text));
		}
	}
	return out;
}
export function epubInlineText(tokens: readonly Token[]): string {
	const text = (nodes: (string | TelegraphNode)[]): string =>
		nodes
			.map((n) =>
				typeof n === "string"
					? n
					: n.tag === "img"
						? (n.attrs?.alt ?? "")
						: text(n.children ?? []),
			)
			.join("");
	return text(inline(tokens, { sourceKey: "" }));
}
export function renderEpubTokens(
	tokens: readonly Token[],
	context: EpubRenderContext,
): TelegraphNode[] {
	const nodes: TelegraphNode[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case "heading": {
				const t = token as Tokens.Heading & {
					anchorId?: string;
					explicitId?: string;
				};
				const info = AnchorGenerator.extractHeadingInfo([
					"",
					"#".repeat(t.depth),
					epubInlineText(t.tokens ?? []),
				] as unknown as RegExpMatchArray);
				const children = inline(t.tokens ?? [], context);
				if (t.depth > 6) children.unshift(">>> ");
				nodes.push({
					tag: `h${Math.min(t.depth, 6)}`,
					attrs: {
						id:
							t.anchorId ??
							t.explicitId ??
							AnchorGenerator.generateAsciiAnchor(info),
					},
					children,
				});
				break;
			}
			case "paragraph":
				nodes.push({
					tag: "p",
					children: inline(
						token.tokens ?? [],
						context,
						/[|।॥]/.test(token.text) || /\S {2,}$/m.test(token.raw),
					),
				});
				break;
			case "code":
				nodes.push({
					tag: "pre",
					children: [{ tag: "code", children: [token.text] }],
				});
				break;
			case "blockquote":
				nodes.push({
					tag: "blockquote",
					children: renderEpubTokens(token.tokens ?? [], context),
				});
				break;
			case "list": {
				const list = token as Tokens.List & { attrs?: Record<string, string> };
				nodes.push({
					tag: list.ordered ? "ol" : "ul",
					...(list.attrs ? { attrs: list.attrs } : list.ordered && list.start !== 1
						? { attrs: { start: String(list.start) } }
						: {}),
					children: list.items.map((item: any) => ({
						tag: "li",
						...(item.attrs ? { attrs: item.attrs } : {}),
						children: [
							...(item.task
								? [{ tag: "span", children: [item.checked ? "☑ " : "☐ "] }]
								: []),
							...renderEpubTokens(item.tokens, context),
						],
					})),
				});
				break;
			}
			case "table": {
				const table = token as Tokens.Table;
				const cells = (row: Tokens.TableCell[], tag: string): TelegraphNode[] =>
					row.map((cell, i) => ({
						tag,
						...(table.align[i]
							? { attrs: { style: `text-align: ${table.align[i]}` } }
							: {}),
						children: cell.tokens && cell.tokens.length > 0 ? inline(cell.tokens, context) : [""],
					}));
				nodes.push({
					tag: "table",
					children: [
						{
							tag: "thead",
							children: [{ tag: "tr", children: cells(table.header, "th") }],
						},
						{
							tag: "tbody",
							children: table.rows.map((row) => ({
								tag: "tr",
								children: cells(row, "td"),
							})),
						},
					],
				});
				break;
			}
			case "hr":
				nodes.push({ tag: "hr" });
				break;
			case "html": {
				const children = parseEpubHtml(token.raw, context);
				const pageIds = (
					token as Token & { pageIds?: string[]; pageId?: string }
				).pageIds;
				let page = 0;
				const update = (items: (string | TelegraphNode)[]) => {
					for (const n of items)
						if (typeof n !== "string") {
							if (n.attrs?.["aria-label"] && /^page-/.test(n.attrs.id ?? "")) {
								n.attrs.id =
									pageIds?.[page++] ??
									(token as Token & { pageId?: string }).pageId ??
									n.attrs.id!;
							}
							if (n.children) update(n.children);
						}
				};
				update(children);
				for (const n of children)
					if (typeof n !== "string" || n.trim())
						nodes.push(typeof n === "string" ? { tag: "p", children: [n] } : n);
				break;
			}
			case "text":
				nodes.push({
					tag: "p",
					children: token.tokens
						? inline(token.tokens ?? [], context)
						: [decodeEpubEntities(token.text)],
				});
				break;
			case "space":
			case "def":
				break;
			default:
				if ("tokens" in token && Array.isArray(token.tokens))
					nodes.push(...renderEpubTokens(token.tokens ?? [], context));
		}
	}
	return nodes;
}
