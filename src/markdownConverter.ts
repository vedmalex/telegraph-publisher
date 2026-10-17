import type { TelegraphNode } from "./telegraphPublisher"; // Import TelegraphNode interface
import { AnchorGenerator, type HeadingInfo } from "./utils/AnchorGenerator"; // Import unified anchor generator
import { buildSectionNav, renderSectionNavNodes } from "./navigation/sectionNav";
import { parseEpubMarkdown } from "./epub/EpubMarkdownDocument";
import { renderEpubTokens } from "./epub/EpubTokenRenderer";
import type { EpubRenderContext, OutlineNode } from "./epub/EpubTypes";

/**
 * Validates cleaned content to ensure it does not contain unsupported syntax, like raw HTML tags.
 * @param content The content string (expected to be Markdown, potentially with HTML, which we want to disallow).
 * @throws Error if unsupported syntax (HTML tags) is found.
 */
export function validateCleanedContent(content: string): void {
	// This regex specifically looks for HTML-like tags, not Markdown syntax.
	// It should detect things like <p>, <div>, <span>, etc.
	const htmlTagRegex = /<\/?\w+\b[^>]*>/;
	if (htmlTagRegex.test(content)) {
		throw new Error(
			"Content contains unsupported HTML tags. Only Markdown formatting is allowed.",
		);
	}
}

/**
 * Extracts the first heading from Markdown content and returns it as a title,
 * along with the remaining content.
 * @param markdown The raw Markdown content.
 * @returns An object containing the extracted title (or null) and the modified content.
 */
export function extractTitleAndContent(markdown: string): {
	title: string | null;
	content: string;
} {
	const lines = markdown.split(/\r?\n/);
	let title: string | null = null;
	let contentStartIndex = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim() || "";
		if (line === "") {
			contentStartIndex++;
			continue; // Skip empty lines at the beginning
		}

		const headingMatch = line.match(/^(#+)\s*(.*)/);
		// Check if the first non-empty line is a heading or bold/italic text that looks like a title
		const boldItalicMatch = line.match(
			/^(?:\*{2}|__)(.*?)(?:\*{2}|__)$|^\*(.*?)\*$|^_(.*?)_$/,
		);

		if (
			headingMatch &&
			headingMatch.length > 2 &&
			headingMatch[2] !== undefined
		) {
			const headingText = headingMatch[2];
			title = headingText.trim();
			contentStartIndex = i + 1;
			break;
		} else if (boldItalicMatch) {
			// If it's a bold/italic line, consider it a title if no heading was found yet
			title = (
				boldItalicMatch[1] ||
				boldItalicMatch[2] ||
				boldItalicMatch[3] ||
				""
			).trim();
			contentStartIndex = i + 1;
			break;
		}
		// If the first non-empty line is not a recognized title format, treat entire content as is
		break;
	}

	const remainingContent = lines.slice(contentStartIndex).join("\n");

	return { title, content: remainingContent };
}

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
			// Consume the pipe escape, retaining all other backslashes.
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
	return line.includes("|") && cells.length > 0 &&
		cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

/** Render tables without discarding empty headers or surplus row values. */
function parseTable(tableLines: string[], asHtmlTable: boolean = false): TelegraphNode {
	if (tableLines.length < 2 || !isTableDelimiter(tableLines[1] ?? "")) {
		return { tag: "p", children: processInlineMarkdown(tableLines.join("\n")) };
	}
	const headers = splitTableRow(tableLines[0]!);
	const rows = tableLines.slice(2).map(splitTableRow);
	const width = Math.max(headers.length, splitTableRow(tableLines[1]!).length,
		...rows.map(row => row.length));
	const columns = Array.from({ length: width }, (_, i) => headers[i] ?? "");
	if (asHtmlTable) {
		return {
			tag: "table",
			children: [
				{ tag: "thead", children: [{ tag: "tr", children: columns.map(header => ({
					tag: "th", children: header ? processInlineMarkdown(header) : [""],
				})) }] },
				{ tag: "tbody", children: rows.map(row => ({ tag: "tr", children: columns.map((_, i) => ({
					tag: "td", children: row[i] ? processInlineMarkdown(row[i]!) : [""],
				})) })) },
			],
		};
	}
	return {
		tag: "ol",
		children: rows.map((row, index) => ({
			tag: "li",
			children: [String(index + 1), { tag: "ul", children: columns.map((header, i) => ({
				tag: "li",
				children: [...processInlineMarkdown(header || "—"), ": ",
					...processInlineMarkdown(row[i] ?? "")],
			})) }],
		})),
	};
}

/**
 * Creates children nodes for ToC links that handle formatting but prevent nested links
 * @param heading The heading object with text and display information
 * @returns Array of TelegraphNode children for the ToC link
 */
function createTocChildren(heading: { level: number; text: string; displayText: string; textForAnchor: string }): (string | TelegraphNode)[] {
	// Check if this is a heading-link (e.g., "## [Link Text](./file.md)")
	const linkInHeadingMatch = heading.text.match(/^\[(.*?)\]\((.*?)\)$/);
	if (linkInHeadingMatch) {
		// For heading-links, use only the plain text to avoid nested links
		return [heading.textForAnchor];
	}
	
	// For normal headings with formatting, process inline Markdown to preserve bold, italic, etc.
	return processInlineMarkdown(heading.displayText);
}

/**
 * Creates children nodes for ToC links using HeadingInfo from AnchorGenerator.
 * Handles heading-links by extracting only the text to avoid nested link elements.
 * @param headingInfo The HeadingInfo object from AnchorGenerator.
 * @returns Array of TelegraphNode elements for the link content.
 */
function createTocChildrenFromHeadingInfo(headingInfo: HeadingInfo): (string | TelegraphNode)[] {
	// Check if this is a heading-link using metadata
	if (headingInfo.metadata.hasLink && headingInfo.linkInfo) {
		// For heading-links, use only the plain text to avoid nested links
		return [headingInfo.linkInfo.text];
	}
	
	// For normal headings with formatting, process inline Markdown to preserve bold, italic, etc.
	return processInlineMarkdown(headingInfo.displayText);
}

/**
 * Generates a Table of Contents (ToC) as an aside element from Markdown content.
 * Only generates ToC if there are 2 or more headings in the document.
 * Uses the same heading processing logic as the main converter for consistency.
 * @param markdown The raw Markdown content to scan for headings.
 * @returns TelegraphNode for aside element with ToC, or null if insufficient headings.
 */
function generateTocAside(markdown: string, tocTitle: string = ''): TelegraphNode | null {
	const headings: { level: number; text: string; displayText: string; textForAnchor: string }[] = [];
	const lines = markdown.split(/\r?\n/);

	// 1. Scan for all headings using the same regex as main converter
	for (const line of lines) {
		const headingMatch = line.match(/^(#+)\s+(.*)/);
		if (headingMatch?.[1] && headingMatch[2] !== undefined) {
			const level = headingMatch[1].length;
			const originalText = headingMatch[2].trim();
			let textForAnchor = originalText;
			
			// NEW: Check if the heading text is a Markdown link
			const linkInHeadingMatch = originalText.match(/^\[(.*?)\]\((.*?)\)$/);
			if (linkInHeadingMatch) {
				// If it's a link, use only its text part for the anchor
				textForAnchor = linkInHeadingMatch[1] || '';
			}

			let displayText = originalText;

			// 2. Apply the same heading strategy logic as main converter
			switch (level) {
				case 1:
				case 2:
				case 3:
				case 4:
					displayText = originalText;
					break;
							case 5:
				displayText = `> ${originalText}`;
				textForAnchor = linkInHeadingMatch ? `> ${linkInHeadingMatch[1]}` : `> ${originalText}`;
				break;
			case 6:
				displayText = `>> ${originalText}`;
				textForAnchor = linkInHeadingMatch ? `>> ${linkInHeadingMatch[1]}` : `>> ${originalText}`;
				break;
			default:
				// Handle edge case: levels > 6
				displayText = `>>> ${originalText}`;
				textForAnchor = linkInHeadingMatch ? `>>> ${linkInHeadingMatch[1]}` : `>>> ${originalText}`;
				break;
			}

			headings.push({ level, text: originalText, displayText, textForAnchor });
		}
	}

	// 3. Check if ToC should be generated (2+ headings required)
	if (headings.length < 2) {
		return null;
	}

	// 4. Build ToC structure as list items
	const listItems: TelegraphNode[] = [];
	for (const heading of headings) {
		// IMPORTANT: Use textForAnchor for anchor generation to handle link headings properly
		// Based on empirical research: remove only < and > characters, replace spaces with hyphens
		const anchor = heading.textForAnchor
			.trim()
			.replace(/[<]/g, '') // 1. Remove < characters only (preserve > for H5/H6 prefixes)
			.replace(/ /g, '-');  // 2. Replace spaces with hyphens
		
		const linkNode: TelegraphNode = {
			tag: 'a',
			attrs: { href: `#${anchor}` },
			children: createTocChildren(heading)
		};
		
		listItems.push({
			tag: 'li',
			children: [linkNode],
		});
	}

	// 5. Return aside element with optional heading and unordered list
	const children: any[] = [];
	
	// Add heading only if tocTitle is provided and not empty
	if (tocTitle && tocTitle.trim()) {
		children.push({
			tag: 'h3',
			children: [tocTitle]
		});
	}
	
	// Always add the list
	children.push({
		tag: 'ul',
		children: listItems
	});
	
	return {
		tag: 'aside',
		children
	};
}

/**
 * Generates a Table of Contents (ToC) using the unified AnchorGenerator.
 * This ensures 100% consistency between TOC anchors and link validation anchors.
 * Only generates ToC if there are 2 or more headings in the document.
 * @param markdown The raw Markdown content to scan for headings.
 * @returns TelegraphNode for aside element with ToC, or null if insufficient headings.
 */
/**
 * Builds the in-text table of contents as a nested list.
 *
 * A flat list loses the shape of the book: in a volume where every verse is a
 * heading, chapters and verses sit side by side and the reader cannot tell one
 * from the other. Nesting each heading under the nearest shallower one restores
 * that shape without needing the levels to be contiguous - books skip levels.
 */
function buildNestedTocItems(headings: HeadingInfo[], asciiAnchors: boolean = false): TelegraphNode[] {
	const roots: TelegraphNode[] = [];
	// Each stack entry holds the list item and the heading level it came from.
	const stack: { item: TelegraphNode; level: number }[] = [];

	for (const headingInfo of headings) {
		const item: TelegraphNode = {
			tag: 'li',
			children: [{
				tag: 'a',
				attrs: { href: `#${asciiAnchors ? AnchorGenerator.generateAsciiAnchor(headingInfo) : AnchorGenerator.generateAnchor(headingInfo)}` },
				children: createTocChildrenFromHeadingInfo(headingInfo)
			}],
		};

		while (stack.length > 0 && stack[stack.length - 1]!.level >= headingInfo.level) {
			stack.pop();
		}

		const parent = stack[stack.length - 1];
		if (!parent) {
			roots.push(item);
		} else {
			const children = parent.item.children as (string | TelegraphNode)[];
			const last = children[children.length - 1];
			const sublist = (typeof last === 'object' && last?.tag === 'ul')
				? last
				: (children.push({ tag: 'ul', children: [] }), children[children.length - 1] as TelegraphNode);
			(sublist.children as TelegraphNode[]).push(item);
		}

		stack.push({ item, level: headingInfo.level });
	}

	return roots;
}

function generateTocAsideWithAnchorGenerator(markdown: string, tocTitle: string = '', tocDepth: number = Number.POSITIVE_INFINITY, nested: boolean = false, asciiAnchors: boolean = false): TelegraphNode | null {
	// Use AnchorGenerator to parse headings with unified logic
	const headings = AnchorGenerator.parseHeadingsFromContent(markdown)
		.filter(h => h.level <= tocDepth);
	
	// Check if ToC should be generated (2+ headings required)
	if (headings.length < 2) {
		return null;
	}

	const listItems: TelegraphNode[] = nested
		? buildNestedTocItems(headings, asciiAnchors)
		: headings.map(headingInfo => ({
			tag: 'li',
			children: [{
				tag: 'a',
				attrs: { href: `#${asciiAnchors ? AnchorGenerator.generateAsciiAnchor(headingInfo) : AnchorGenerator.generateAnchor(headingInfo)}` },
				children: createTocChildrenFromHeadingInfo(headingInfo)
			} as TelegraphNode],
		}));

	// Return aside element with optional heading and unordered list
	const children: any[] = [];
	
	// Add heading only if tocTitle is provided and not empty
	if (tocTitle && tocTitle.trim()) {
		children.push({
			tag: 'h3',
			children: [tocTitle]
		});
	}
	
	// Always add the list
	children.push({
		tag: 'ul',
		children: listItems
	});
	
	return {
		tag: 'aside',
		children
	};
}

/**
 * Assembles a paragraph, honouring hard line breaks.
 *
 * A line ending in two or more spaces is a hard break in Markdown, and Sanskrit
 * is written that way: each line of a śloka ends there, and running the lines
 * together loses the metre the text is set in. A plain newline inside a
 * paragraph renders as a space, so the break has to become an explicit element.
 *
 * Only the EPUB path does this. Telegraph pages published before now were laid
 * out without it, and turning it on there would reflow every one of them.
 */
function buildParagraphChildren(lines: string[], target: string): (string | TelegraphNode)[] {
	if (target !== "epub" || !lines.some(line => /\S {2,}$/.test(line))) {
		return processInlineMarkdown(lines.join("\n"));
	}

	const children: (string | TelegraphNode)[] = [];
	lines.forEach((line, index) => {
		const hardBreak = /\S {2,}$/.test(line);
		children.push(...processInlineMarkdown(line.replace(/\s+$/, "")));

		if (index < lines.length - 1) {
			children.push(hardBreak ? { tag: "br" } : "\n");
		}
	});
	return children;
}

type ListMarker = { indent: number; tag: "ol" | "ul"; number?: number; text: string };

function listIndent(line: string): number {
	// Preserve the converter's established two-space tab/nesting convention.
	return (line.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
}

function matchListMarker(line: string): ListMarker | null {
	if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return null;
	const match = line.match(/^[ \t]*(?:(\d{1,9})[.)]|([-*+]))[ \t]+(.*)$/);
	if (!match) return null;
	return { indent: listIndent(line), tag: match[1] ? "ol" : "ul",
		number: match[1] ? Number(match[1]) : undefined, text: match[3] ?? "" };
}

/**
 * Lists own indented continuation blocks; a dedent hands control to their parent.
 * Telegra.ph only accepts href/src attributes, so non-natural ordered sequences
 * become explicitly numbered paragraphs, never numbered text inside an <ol>.
 * EPUB can retain semantic lists using start/value attributes.
 */
function parseListBlock(lines: string[], start: number, target: string): { nodes: TelegraphNode[]; next: number } {
	const first = matchListMarker(lines[start]!)!;
	const items: TelegraphNode[] = [];
	const numbers: number[] = [];
	let cursor = start;
	while (cursor < lines.length) {
		const marker = matchListMarker(lines[cursor]!);
		if (!marker || marker.indent !== first.indent || marker.tag !== first.tag) break;
		const children: (string | TelegraphNode)[] = [];
		let paragraph = [marker.text];
		const flush = () => {
			if (!paragraph.length) return;
			// Hard breaks inside lists are meaningful on both targets. Keep the
			// legacy non-list Telegraph paragraph behavior unchanged.
			const content = buildParagraphChildren(paragraph, "epub");
			if (!children.length) children.push(...content);
			else children.push({ tag: "p", children: content });
			paragraph = [];
		};
		cursor++;
		while (cursor < lines.length) {
			const line = lines[cursor]!;
			if (!line.trim()) {
				flush();
				cursor++;
				continue;
			}
			const nested = matchListMarker(line);
			if (nested && nested.indent > first.indent) {
				flush();
				const parsed = parseListBlock(lines, cursor, target);
				children.push(...parsed.nodes);
				cursor = parsed.next;
				continue;
			}
			if (listIndent(line) <= first.indent) break;
			const body = line.trimStart();
			const fence = body.match(/^(`{3,}|~{3,})/);
			if (fence) {
				flush();
				const code: string[] = [];
				const indent = line.match(/^[ \t]*/)?.[0].length ?? 0;
				cursor++;
				while (cursor < lines.length && !new RegExp(`^${fence[1]![0]}{${fence[1]!.length},}\\s*$`).test(lines[cursor]!.trimStart())) {
					code.push(lines[cursor]!.slice(indent));
					cursor++;
				}
				if (cursor < lines.length) cursor++;
				children.push({ tag: "pre", children: [{ tag: "code", children: [code.join("\n").trimEnd()] }] });
				continue;
			}
			paragraph.push(body);
			cursor++;
		}
		flush();
		items.push({ tag: "li", children });
		if (marker.number !== undefined) numbers.push(marker.number);
	}
	if (first.tag === "ol" && target !== "epub" && numbers.some((number, index) => number !== index + 1)) {
		const paragraphs: TelegraphNode[] = [];
		items.forEach((item, index) => {
			const children = item.children ?? [];
			const inline: (string | TelegraphNode)[] = [`${numbers[index]}. `];
			let split = 0;
			while (split < children.length) {
				const child = children[split]!;
				if (typeof child !== "string" && ["p", "ol", "ul", "pre"].includes(child.tag ?? "")) break;
				inline.push(child);
				split++;
			}
			paragraphs.push({ tag: "p", children: inline });
			paragraphs.push(...children.slice(split) as TelegraphNode[]);
		});
		return { nodes: paragraphs, next: cursor };
	}
	const list: TelegraphNode = { tag: first.tag, children: items };
	if (first.tag === "ol" && target === "epub") {
		if (numbers[0] !== 1) list.attrs = { start: String(numbers[0]) };
		numbers.forEach((number, index) => {
			if (index > 0 && number !== numbers[index - 1]! + 1) items[index]!.attrs = { value: String(number) };
		});
	}
	return { nodes: [list], next: cursor };
}

/**
 * Removes HTML comments before any other parsing.
 *
 * A comment is not markup the reader should ever see, but an unclosed one is
 * worse than visible: everything up to the next "-->" anywhere later in the
 * file would be swallowed, taking headings with it. Books converted from PDF
 * carry page markers like "<!-- Page 12 -->", and a truncated marker is common
 * enough that the unclosed case needs its own rule - cut only to the end of the
 * line, so the rest of the book survives.
 */
function stripHtmlComments(markdown: string): string {
	return markdown
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<!--[^\n]*$/gm, "");
}

/** A page marker left by PDF conversion: "<!-- Page 12 -->". */
const PAGE_MARKER = /<!--\s*(?:Page|Страница)\s+(\d+)\s*-->/gi;

/**
 * Turns page markers into EPUB 3 page breaks.
 *
 * The printed page number is worth keeping — it is how a translation is
 * checked against its source — but it is not a heading and has no business in
 * the table of contents. EPUB has a place for exactly this: a pagebreak
 * carries the number, readers offer "go to page", and the numbers live in
 * their own page-list, not in the contents.
 */
const PAGE_PLACEHOLDER = "\u0000page:";

function markPageBreaks(markdown: string): { markdown: string; pages: number[] } {
	const pages: number[] = [];
	const out = markdown.replace(PAGE_MARKER, (_match, digits: string) => {
		const page = Number.parseInt(digits, 10);
		pages.push(page);
		// A placeholder, not the span itself: written as HTML here it would be
		// escaped into the text and the reader would see the markup.
		return `${PAGE_PLACEHOLDER}${page}\u0000`;
	});
	return { markdown: out, pages };
}

/** Replaces the placeholders left above with real page-break nodes. */
function injectPageBreaks(nodes: (TelegraphNode | string)[]): (TelegraphNode | string)[] {
	const out: (TelegraphNode | string)[] = [];
	for (const node of nodes) {
		if (typeof node === "string") {
			if (!node.includes(PAGE_PLACEHOLDER)) {
				out.push(node);
				continue;
			}
			const parts = node.split(/\u0000page:(\d+)\u0000/);
			parts.forEach((part, index) => {
				if (index % 2 === 1) {
					out.push({
						tag: "span",
						attrs: {
							"epub:type": "pagebreak",
							role: "doc-pagebreak",
							id: `page-${part}`,
							"aria-label": part,
						},
						children: [],
					});
				} else if (part) {
					out.push(part);
				}
			});
			continue;
		}
		if (node.children) {
			node.children = injectPageBreaks(node.children);
		}
		out.push(node);
	}
	return out;
}

/**
 * Converts Markdown content directly into an array of TelegraphNode objects.
 * This function replaces the need for an intermediate HTML conversion step and 'mrkdwny' library.
 * It directly parses Markdown elements into the structure expected by the Telegra.ph API.
 * @param markdown The raw Markdown content.
 * @returns An array of TelegraphNode objects representing the parsed content.
 */
export function convertMarkdownToTelegraphNodes(
	markdown: string,
	options: {
		generateToc?: boolean;
		inlineToC?: boolean;
		tocTitle?: string;
		tocSeparators?: boolean;
		/**
		 * Target rendering environment:
		 * - "telegraph" (default) – optimize for Telegra.ph API (no tables)
		 * - "epub" – allow richer structures like <table>
		 * - "svg" – simplified for SVG image generation
		 */
		target?: "telegraph" | "epub" | "svg";
		/** Deepest heading level to include in the in-text table of contents.
		 * Unset means no limit: books use levels beyond h6 and dropping them by
		 * default would silently shorten existing tables of contents. */
		tocDepth?: number;
		/** Render the in-text table of contents as a nested list. */
		tocNested?: boolean;
		/** Where the in-text table of contents goes: before the text, after it, or both. */
		tocPosition?: "start" | "end" | "both";
		/** Shape of the in-text contents: the full list, or a row of jump points. */
		tocMode?: "full" | "blocks";
		/** Caption of the jump row. */
		navCaption?: string;
		/** Fewest sections before a jump row is worth its place. */
		navThreshold?: number;
		/** Most jump points a row may hold. */
		navMaxItems?: number;
		/** Keep printed page numbers as EPUB page breaks instead of dropping them. */
		pageBreaks?: boolean;
		/** Filled with the page numbers found, for the package's page-list. */
		pageList?: number[];
	} = {},
): TelegraphNode[] {
	if (options.target === "epub") {
		const {
			generateToc = true,
			inlineToC = true,
			tocTitle,
			tocSeparators = true,
			tocDepth = Number.POSITIVE_INFINITY,
			tocNested = false,
			tocPosition = "start",
			tocMode = "full",
			navCaption = "К тексту:",
			navThreshold,
			navMaxItems,
			pageBreaks = false,
			pageList,
		} = options;

		const parsed = parseEpubMarkdown(markdown, "epub-source", { pageBreaks });

		if (pageBreaks && pageList) {
			for (const page of parsed.pages) {
				pageList.push(page.pageNumber);
			}
		}

		const context: EpubRenderContext = {
			sourceKey: "epub-source",
			anchors: parsed.anchors,
			definitions: parsed.definitions,
			pageBreaks,
			epubVersion: 3,
		};

		const contentNodes: TelegraphNode[] = [];
		for (const unit of parsed.units) {
			const payload = parsed.payloadStore.get(unit.payloadRef);
			if (payload?.tokens) {
				contentNodes.push(...renderEpubTokens(payload.tokens, context));
			}
		}

		if (generateToc && inlineToC && tocMode !== "none") {
   const flatten=(items:OutlineNode[]):OutlineNode[]=>items.flatMap(n=>[n,...flatten(n.children)]);
   const headings=flatten(parsed.outline).filter(n=>n.level<=tocDepth);
   const counts=new Map<number,number>();for(const h of headings)counts.set(h.level,(counts.get(h.level)??0)+1);
   const level=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];
   const row=headings.filter(h=>h.level===level);
   const infos=row.map(h=>AnchorGenerator.extractHeadingInfo(["","#".repeat(h.level),h.label] as unknown as RegExpMatchArray));
   const milestones=buildSectionNav(infos,{threshold:navThreshold,maxItems:navMaxItems,asciiAnchors:true});
   const useBlocks=tocMode==="blocks" || (tocMode==="auto" && milestones!==null);
   const tocNodes:TelegraphNode[]=[];
   if(useBlocks){
    if(milestones)tocNodes.push(...renderSectionNavNodes(milestones.map(item=>({...item,anchor:row[item.ordinal-1]!.id})),navCaption,tocPosition==="end"?"end":"start"));
   } else if(headings.length>=2){
    const list=(items:OutlineNode[]):TelegraphNode[]=>items.flatMap(h=>h.level>tocDepth?list(h.children):[{tag:"li",children:[{tag:"a",attrs:{href:`#${h.id}`},children:[h.label]},...(tocNested&&h.children.length?[{tag:"ul",children:list(h.children)}]:[])]}]);
    if(tocSeparators)tocNodes.push({tag:"hr"});
    if(tocTitle?.trim())tocNodes.push({tag:"h3",children:[tocTitle]});
    tocNodes.push({tag:"ul",children:list(tocNested?parsed.outline:headings.map(h=>({...h,children:[]})))});
    if(tocSeparators)tocNodes.push({tag:"hr"});
   }
   if(tocPosition!=="end")contentNodes.unshift(...tocNodes);
   if(tocPosition==="end" || tocPosition==="both")contentNodes.push(...tocNodes);
  }

		return contentNodes;
	}

	const { generateToc = true, inlineToC = true, tocTitle, tocSeparators = true, target = "telegraph", tocDepth = Number.POSITIVE_INFINITY, tocNested = false, tocPosition = "start", tocMode = "full", navCaption = "К тексту:", navThreshold, navMaxItems } = options;

	if (options.pageBreaks) {
		const marked = markPageBreaks(markdown);
		markdown = marked.markdown;
		options.pageList?.push(...marked.pages);
	}
	markdown = stripHtmlComments(markdown);

	const nodes: TelegraphNode[] = [];
	// Held aside until the end when tocPosition asks for it there.
	const tocNodes: TelegraphNode[] = [];
	let currentParagraphLines: string[] = [];

	const flushParagraph = () => {
		if (currentParagraphLines.length === 0) {
			return;
		}

		// Treat consecutive non-empty lines as a single paragraph block
		// and preserve single line breaks as '\n' within the paragraph.
		const paragraphContent = currentParagraphLines.join("\n");

		if (paragraphContent.trim().length === 0) {
			currentParagraphLines = [];
			return;
		}

		nodes.push({ tag: "p", children: buildParagraphChildren(currentParagraphLines, target) });

		currentParagraphLines = [];
	};
	
	// Generate and add Table of Contents if enabled and there are 2+ headings
	// Note: inlineToC controls whether ToC is rendered inline in the content
	// generateToc controls whether ToC generation should be attempted at all
	if (generateToc && inlineToC) {
		// Feature flag: Use unified AnchorGenerator for consistent anchor generation
		// Depth and nesting are implemented only in the unified builder, so asking
		// for either selects it regardless of the flag: silently ignoring an
		// explicit option would be worse than taking the newer path.
		const tocShapeRequested = Number.isFinite(tocDepth) || tocNested;
		// The EPUB target always takes the unified path: ASCII transliteration
		// of anchors lives only there, and the legacy builder would emit
		// Cyrillic hrefs pointing at Latin ids.
		const USE_UNIFIED_ANCHORS = tocShapeRequested || target === 'epub' ||
									process.env.USE_UNIFIED_ANCHORS === 'true' || 
									process.env.NODE_ENV !== 'production';
		
		if (tocMode === "blocks") {
			// A chapter of hundreds of numbered sections needs a way in, not a
			// list of everything it holds: such a list runs longer than the
			// chapter itself and buries the chapters around it.
			const items = buildSectionNav(AnchorGenerator.parseHeadingsFromContent(markdown), {
				threshold: navThreshold,
				maxItems: navMaxItems,
				asciiAnchors: target === 'epub',
			});
			if (items) {
				if (tocPosition !== "end") {
					nodes.push(...renderSectionNavNodes(items, navCaption, "start"));
				}
				if (tocPosition === "end" || tocPosition === "both") {
					// Repeated at the foot of the chapter: having read to the
					// bottom, the reader should not have to climb back up to move on.
					tocNodes.push(...renderSectionNavNodes(items, navCaption, "end"));
				}
			}
		} else {

		const tocAside = USE_UNIFIED_ANCHORS 
			? generateTocAsideWithAnchorGenerator(markdown, tocTitle, tocDepth, tocNested, target === 'epub')
			: generateTocAside(markdown, tocTitle);
			
		if (tocAside) {
			// Add HR before TOC (if separators enabled)
			if (tocSeparators) {
				tocNodes.push({ tag: 'hr' });
			}
			
			// Extract TOC elements from aside and add them separately for better Telegram compatibility
			if (tocAside.children) {
				for (const child of tocAside.children) {
					if (typeof child !== 'string') {
						tocNodes.push(child);
					}
				}
			}
			
			// Add HR after TOC (if separators enabled)
			if (tocSeparators) {
				tocNodes.push({ tag: 'hr' });
			}
		}

		// A table of contents placed at the end suits a long list: the reader
		// meets the text first and finds the index where an index belongs in a
		// printed book. Placed at the start it is a map of what follows.
		if (tocPosition !== "end") {
			nodes.push(...tocNodes);
			tocNodes.length = 0;
		}
		}
	}
	
	const lines = markdown.split(/\r?\n/);

	let inCodeBlock = false;
	let codeFence = "";
	let codeBlockContent: string[] = [];


	let inBlockquote = false;
	let blockquoteContent: string[] = [];

	let inTable = false;
	let tableLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] || "";

		// Handle code blocks first (they have highest priority)
		const fenceMatch = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/);
		if (fenceMatch && (!inCodeBlock || (fenceMatch[1]![0] === codeFence[0] && fenceMatch[1]!.length >= codeFence.length && !fenceMatch[2]!.trim()))) {
			if (inCodeBlock) {
				// End of code block
				// Close any open blocks first
				flushParagraph();
				if (inTable) {
					nodes.push(parseTable(tableLines, target === "epub"));
					inTable = false;
					tableLines = [];
				}
				if (inBlockquote) {
					nodes.push({
						tag: "blockquote",
						children: processInlineMarkdown(blockquoteContent.join("\n")),
					});
					inBlockquote = false;
					blockquoteContent = [];
				}

				nodes.push({
					tag: "pre",
					children: [
						{ tag: "code", children: [codeBlockContent.join("\n").trimEnd()] },
					],
				});
				codeBlockContent = [];
				inCodeBlock = false;
			} else {
				// Start of code block
				// Close any open blocks first
				flushParagraph();
				if (inTable) {
					nodes.push(parseTable(tableLines, target === "epub"));
					inTable = false;
					tableLines = [];
				}
				if (inBlockquote) {
					nodes.push({
						tag: "blockquote",
						children: processInlineMarkdown(blockquoteContent.join("\n")),
					});
					inBlockquote = false;
					blockquoteContent = [];
				}

				codeFence = fenceMatch[1]!;
				inCodeBlock = true;
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlockContent.push(line);
			continue;
		}

		// A header must be immediately followed by a real delimiter. A pipe
		// alone may be a Sanskrit daṇḍa and does not start a table.
		const nextLine = lines[i + 1] ?? "";
		const isTableLine = inTable
			? line.includes("|") && line.trim() !== ""
			: line.includes("|") && isTableDelimiter(nextLine);

		if (isTableLine) {
			if (!inTable) {
				// Close any open blocks first
				flushParagraph();
				if (inBlockquote) {
					nodes.push({
						tag: "blockquote",
						children: processInlineMarkdown(blockquoteContent.join("\n")),
					});
					inBlockquote = false;
					blockquoteContent = [];
				}

				inTable = true;
				tableLines = [];
			}
			tableLines.push(line);
			continue;
		} else if (inTable) {
			// End of table
			flushParagraph();
			nodes.push(parseTable(tableLines, target === "epub"));
			inTable = false;
			tableLines = [];
			// Continue processing current line
		}

		// Handle blockquotes
		if (line.startsWith(">")) {
			if (!inBlockquote) {
				// If previously in a list, close it first
				flushParagraph();
				inBlockquote = true;
				blockquoteContent = [];
			}
			blockquoteContent.push(line.substring(1).trimStart()); // Remove '>' and leading space
			continue;
		} else if (inBlockquote) {
			// If not a blockquote line, but was in blockquote, close it
			flushParagraph();
			nodes.push({
				tag: "blockquote",
				children: processInlineMarkdown(blockquoteContent.join("\n")),
			});
			inBlockquote = false;
			blockquoteContent = [];
			// Process current line as a new element
		}

		// Handle headings (MOVED UP - before lists to prevent numbered headings from being parsed as list items)
		const headingMatch = line.match(/^(#+)\s*(.*)/);
		if (headingMatch?.[1] && headingMatch[2] !== undefined) {
			// Close any open blocks before adding a heading
			flushParagraph();
			if (inBlockquote) {
				nodes.push({
					tag: "blockquote",
					children: processInlineMarkdown(blockquoteContent.join("\n")),
				});
				inBlockquote = false;
				blockquoteContent = [];
			}

			// Use unified AnchorGenerator for consistent heading processing and ID generation
			const headingInfo = AnchorGenerator.extractHeadingInfo(headingMatch);
			// EPUB ids must be ASCII: readers resolve URI fragments per RFC 3986
			// and a raw Cyrillic fragment never lands. Telegraph anchors are
			// produced by Telegra.ph itself and must stay byte-for-byte intact.
			const anchorId = target === 'epub'
				? AnchorGenerator.generateAsciiAnchor(headingInfo)
				: AnchorGenerator.generateAnchor(headingInfo);
			
			const level = headingInfo.level;
			const displayText = headingInfo.displayText;
			let tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' = 'h3';

			if (target === "epub") {
				// EPUB is plain XHTML and has all six levels. Collapsing them the
				// Telegraph way would flatten a book's structure: chapter headings
				// and verse headings would become indistinguishable, and the
				// navigation built from them could no longer be limited by depth.
				const epubTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
				tag = epubTags[Math.min(Math.max(level, 1), 6) - 1] ?? 'h3';
			} else {
				// Map headings to Telegraph API compatible tags with visual hierarchy preservation
				// Telegraph API only supports h3 and h4 tags for headings
				switch (level) {
					case 1:
					case 2:
					case 3:
						// H1, H2, H3 → h3 (highest available level in Telegraph API)
						tag = 'h3';
						break;
					case 4:
					case 5:
					case 6:
					default:
						// H4 and below → h4
						tag = 'h4';
						break;
				}
			}

			const processedChildren = processInlineMarkdown(displayText);
			
			// Only add ID attribute if target is EPUB
			// Telegraph API does not support ID attributes on headings
			const attrs: Record<string, string> = {};
			if (target === 'epub') {
				attrs.id = anchorId;
			}
			
			const node: TelegraphNode = { 
				tag, 
				children: processedChildren 
			};
			
			if (Object.keys(attrs).length > 0) {
				node.attrs = attrs;
			}
			
			nodes.push(node);
			continue;
		}

		// Consume the entire list before the outer block parser sees its indented body.
		if (matchListMarker(line)) {
			flushParagraph();
			const parsed = parseListBlock(lines, i, target);
			nodes.push(...parsed.nodes);
			i = parsed.next - 1;
			continue;
		}

		// Handle horizontal rules (---, ***, ___ with optional spaces)
		if (line.match(/^\s*([-*_])(?:\s*\1){2,}\s*$/)) {
			// Close any open blocks before adding HR
			flushParagraph();
			if (inBlockquote) {
				nodes.push({
					tag: "blockquote",
					children: processInlineMarkdown(blockquoteContent.join("\n")),
				});
				inBlockquote = false;
				blockquoteContent = [];
			}
			nodes.push({ tag: "hr" });
			continue;
		}

		// Handle empty lines or plain paragraphs
		if (line.trim() === "") {
			// Empty line ends the current paragraph (if any)
			if (!inBlockquote && !inCodeBlock && !inTable) {
				flushParagraph();
			}
			continue;
		}

		// If we reach here, it's a plain paragraph line
		// Close any open blocks (lists, blockquotes) if this line is not part of them
		if (inBlockquote) {
			nodes.push({
				tag: "blockquote",
				children: processInlineMarkdown(blockquoteContent.join("\n")),
			});
			inBlockquote = false;
			blockquoteContent = [];
		}

		// Accumulate paragraph lines; they will be merged into full paragraphs
		currentParagraphLines.push(line);
	}

	// After loop, close any open blocks
	flushParagraph();
	if (inCodeBlock) {
		nodes.push({
			tag: "pre",
			children: [
				{ tag: "code", children: [codeBlockContent.join("\n").trimEnd()] },
			],
		}); // Trim end for final code block
	}
	if (inBlockquote) {
		nodes.push({
			tag: "blockquote",
			children: processInlineMarkdown(blockquoteContent.join("\n")),
		});
	}
	if (inTable) {
		nodes.push(parseTable(tableLines, target === "epub"));
	}

	// Anything still held aside belongs after the text.
	nodes.push(...tocNodes);

	// Filter out any empty paragraph nodes that might have been created unnecessarily
	const cleaned = nodes.filter(
		(node) =>
			!(
				node.tag === "p" &&
				(!node.children ||
					node.children.length === 0 ||
					(node.children.length === 1 && node.children[0] === ""))
			),
	);

	return options.pageBreaks
		? (injectPageBreaks(cleaned) as TelegraphNode[])
		: cleaned;
}

function processInlineMarkdown(text: string): (string | TelegraphNode)[] {
	const result: (string | TelegraphNode)[] = [];
	let currentIndex = 0;

	// Define patterns for different inline elements
	const patterns = [
		// Images: ![alt](src) – must go BEFORE link pattern to avoid overlap
		{ regex: /!\[([^[\]]*)\]\(([^()]*)\)/g, tag: "img", isImage: true },
		{ regex: /\*\*(.*?)\*\*/g, tag: "strong" },
		{ regex: /__(.*?)__/g, tag: "strong" },
		{ regex: /\*(.*?)\*/g, tag: "em" },
		{ regex: /_(.*?)_/g, tag: "em" },
		{ regex: /`(.*?)`/g, tag: "code" },
		{ regex: /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, tag: "a", isLink: true },
	];

	// Find all matches with their positions
	const matches: Array<{
		index: number;
		length: number;
		tag: string;
		content: string;
		href?: string;
		isImage?: boolean;
	}> = [];

		for (const pattern of patterns as any[]) {
		pattern.regex.lastIndex = 0; // Reset regex
		let match: RegExpExecArray | null = null;
		match = pattern.regex.exec(text);
		while (match !== null) {
			if (match.index !== undefined) {
				if (pattern.isImage) {
					matches.push({
						index: match.index,
						length: match[0].length,
						tag: pattern.tag,
						content: match[1] || "",
						href: match[2] || "",
						isImage: true,
					});
				} else if (pattern.isLink) {
					matches.push({
						index: match.index,
						length: match[0].length,
						tag: pattern.tag,
						content: match[1] || "",
						href: match[2] || "",
					});
				} else {
					matches.push({
						index: match.index,
						length: match[0].length,
						tag: pattern.tag,
						content: match[1] || "",
					});
				}
			}
			match = pattern.regex.exec(text);
		}
	}

	// Sort matches by index to process them in order
	matches.sort((a, b) => a.index - b.index);

	// Process matches and build result
	for (const match of matches) {
		// Add plain text before this match
		if (match.index > currentIndex) {
			const plainText = text.substring(currentIndex, match.index);
			if (plainText) {
				result.push(plainText);
			}
		}

		// Skip if this match overlaps with previous processed content
		if (match.index < currentIndex) {
			continue;
		}

		// Add the formatted element
		if (match.isImage && match.href !== undefined) {
			result.push({
				tag: "img",
				attrs: { src: match.href, alt: match.content },
				children: [],
			});
		} else if (match.tag === "a" && match.href !== undefined) {
			result.push({
				tag: "a",
				attrs: { href: match.href },
				children: processInlineMarkdown(match.content),
			});
		} else if (match.tag === "code") {
			result.push({
				tag: match.tag,
				children: [match.content],
			});
		} else {
			result.push({
				tag: match.tag,
				children: processInlineMarkdown(match.content),
			});
		}

		currentIndex = match.index + match.length;
	}

	// Add any remaining plain text
	if (currentIndex < text.length) {
		const remainingText = text.substring(currentIndex);
		if (remainingText) {
			result.push(remainingText);
		}
	}

	// If no matches found, return the original text
	if (result.length === 0) {
		return [text];
	}

	return result;
}
