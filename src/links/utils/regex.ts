// Balanced Markdown link regex utilities
// Generates a new global RegExp instance to avoid shared lastIndex state across calls

/**
 * Returns a new RegExp that matches Markdown links with balanced parentheses in URLs.
 * Pattern supports nested brackets in link text and balanced parentheses in link href.
 */
export function newMarkdownLinkRegex(): RegExp {
  // This pattern mirrors the improved regex used in LinkScanner.extractLinks
  // [text](href) where:
  //  - text supports nested [] pairs
  //  - href supports balanced parentheses segments
  const pattern = /\[([^\[\]]*(?:\[[^\]]*\][^\[\]]*)*)\]\(([^()]*?(?:\([^()]*\)[^()]*)*)\)/g;
  // Create a new instance each time to keep RegExp state local per parsing loop
  return new RegExp(pattern, 'g');
}
