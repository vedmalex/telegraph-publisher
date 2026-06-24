import { marked } from "marked";

/**
 * Convert Markdown to HTML
 * Uses the 'marked' library for parsing
 */
export function convertMarkdownToHtml(markdown: string): string {
  // Configure marked for better output
  marked.setOptions({
    gfm: true,  // GitHub Flavored Markdown
    breaks: false,  // Don't convert \n to <br>
  });

  let html: string;
  const result = marked.parse(markdown);

  // Handle async result (marked can return Promise in some cases)
  if (typeof result === "string") {
    html = result;
  } else {
    // If it's a promise, we need to handle it synchronously
    // For simplicity, use the sync version
    html = marked.parse(markdown, { async: false }) as string;
  }

  // Wrap text content inside blockquote paragraphs with <code> tags
  // This matches the structural wrapping done in EPUB's nodeToHtml
  // and ensures citations/Sanskrit text renders with proper code font.
  html = wrapBlockquoteContentInCode(html);

  return html;
}

/**
 * Post-process HTML to wrap text inside blockquote <p> tags with <code>.
 * Handles nested markup inside blockquotes (bold, italic, links, etc.)
 */
function wrapBlockquoteContentInCode(html: string): string {
  return html.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/gi,
    (_match, content: string) => {
      // Wrap content of each <p> inside the blockquote with <code>
      const wrappedContent = content.replace(
        /<p>([\s\S]*?)<\/p>/gi,
        '<p><code>$1</code></p>'
      );
      return `<blockquote>${wrappedContent}</blockquote>`;
    }
  );
}


