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

  const html = marked.parse(markdown);
  
  // Handle async result (marked can return Promise in some cases)
  if (typeof html === "string") {
    return html;
  }
  
  // If it's a promise, we need to handle it synchronously
  // For simplicity, use the sync version
  return marked.parse(markdown, { async: false }) as string;
}

