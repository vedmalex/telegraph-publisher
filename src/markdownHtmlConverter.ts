import { convertMarkdownToTelegraphNodes } from "./markdownConverter";
import type { TelegraphNode } from "./telegraphPublisher";

/**
 * Convert Markdown to HTML for PDF and SVG.
 *
 * Those exports used to go through a second parser. Four spaces of indent,
 * which this corpus uses for steps under a numbered item, became an indented
 * code block there, so `*идам̇…* и *мӯла-мантру…*` was printed with the
 * asterisks still in the text. PDF and SVG now use the same nodes as EPUB.
 */
export function convertMarkdownToHtml(markdown: string): string {
	const nodes = convertMarkdownToTelegraphNodes(markdown, {
		generateToc: false,
		target: "epub",
	});
	const html = nodes.map(node => nodeToHtml(node)).join("");
	return wrapBlockquoteContentInCode(html);
}

function nodeToHtml(node: string | TelegraphNode): string {
	if (typeof node === "string") return escapeHtml(node);
	const tag = node.tag || "p";
	const attrs = Object.entries(node.attrs ?? {})
		.map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
		.join(" ");
	const children = (node.children ?? []).map(child => nodeToHtml(child)).join("");
	if (tag === "br" || tag === "hr" || tag === "img") {
		return `<${tag}${attrs ? ` ${attrs}` : ""} />`;
	}
	return `<${tag}${attrs ? ` ${attrs}` : ""}>${children}</${tag}>`;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Post-process HTML to wrap text inside blockquote <p> tags with <code>.
 * Handles nested markup inside blockquotes (bold, italic, links, etc.)
 */
function wrapBlockquoteContentInCode(html: string): string {
	return html.replace(
		/<blockquote>([\s\S]*?)<\/blockquote>/gi,
		(_match, content: string) => {
			const wrappedContent = content.replace(
				/<p>([\s\S]*?)<\/p>/gi,
				"<p><code>$1</code></p>",
			);
			return `<blockquote>${wrappedContent}</blockquote>`;
		},
	);
}
