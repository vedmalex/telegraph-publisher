import type { TelegraphNode } from "./telegraphPublisher"; // Import TelegraphNode interface

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

/**
 * Parses a Markdown table and converts it to a nested list structure.
 * @param tableLines Array of lines that form the table
 * @returns TelegraphNode representing the nested list structure
 */
function parseTable(tableLines: string[]): TelegraphNode {
	if (tableLines.length < 3) {
		// Not a valid table, return as paragraphs
		return { tag: "p", children: [tableLines.join("\n")] };
	}

	// Parse header row
	const headerLine = tableLines[0];
	if (!headerLine) {
		return { tag: "p", children: [tableLines.join("\n")] };
	}
	// Split by | but keep empty cells, then remove first and last empty cells
	const allHeaders = headerLine.split("|").map((cell) => cell.trim());
	const headers = allHeaders.slice(1, -1).filter((cell) => cell !== "");

	// Skip separator line (tableLines[1])

	// Parse data rows
	const dataRows = tableLines.slice(2);
	const listItems: TelegraphNode[] = [];

	dataRows.forEach((row, index) => {
		// Split by | but keep empty cells (don't filter them out)
		const allCells = row.split("|").map((cell) => cell.trim());
		// Remove first and last empty cells (they're from leading/trailing |)
		const cells = allCells.slice(1, -1);

		if (cells.length === 0) return; // Skip empty rows

		// Create nested list for this row
		const nestedItems: TelegraphNode[] = [];

		// Use the number of headers as the reference
		const numColumns = headers.length;

		for (let i = 0; i < numColumns; i++) {
			const header = headers[i] || `Колонка ${i + 1}`;
			const value = cells[i] || "";
			nestedItems.push({
				tag: "li",
				children: [`${header}: ${value}`],
			});
		}

		// Create the main list item with number and nested list
		listItems.push({
			tag: "li",
			children: [
				`${index + 1}`,
				{
					tag: "ul",
					children: nestedItems,
				},
			],
		});
	});

	return {
		tag: "ol",
		children: listItems,
	};
}

/**
 * Generates a Table of Contents (ToC) as an aside element from Markdown content.
 * Only generates ToC if there are 2 or more headings in the document.
 * Uses the same heading processing logic as the main converter for consistency.
 * @param markdown The raw Markdown content to scan for headings.
 * @returns TelegraphNode for aside element with ToC, or null if insufficient headings.
 */
function generateTocAside(markdown: string): TelegraphNode | null {
	const headings: { level: number; text: string; displayText: string }[] = [];
	const lines = markdown.split(/\r?\n/);

	// 1. Scan for all headings using the same regex as main converter
	for (const line of lines) {
		const headingMatch = line.match(/^(#+)\s+(.*)/);
		if (headingMatch?.[1] && headingMatch[2] !== undefined) {
			const level = headingMatch[1].length;
			const originalText = headingMatch[2].trim();
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
					displayText = `» ${originalText}`;
					break;
				case 6:
					displayText = `»» ${originalText}`;
					break;
				default:
					// Handle edge case: levels > 6
					displayText = `»»» ${originalText}`;
					break;
			}

			headings.push({ level, text: originalText, displayText });
		}
	}

	// 3. Check if ToC should be generated (2+ headings required)
	if (headings.length < 2) {
		return null;
	}

	// 4. Build ToC structure as list items
	const listItems: TelegraphNode[] = [];
	for (const heading of headings) {
		// Use the same anchor generation logic as LinkVerifier
		// IMPORTANT: Generate anchor from displayText to match what LinkVerifier will find
		const anchor = heading.displayText.trim().replace(/ /g, '-');
		
		const linkNode: TelegraphNode = {
			tag: 'a',
			attrs: { href: `#${anchor}` },
			children: [heading.displayText] // Use display text with prefixes
		};
		
		listItems.push({
			tag: 'li',
			children: [linkNode],
		});
	}

	// 5. Return aside element with unordered list
	return {
		tag: 'aside',
		children: [{
			tag: 'ul',
			children: listItems
		}]
	};
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
): TelegraphNode[] {
	const nodes: TelegraphNode[] = [];
	
	// Generate and add Table of Contents if there are 2+ headings
	const tocAside = generateTocAside(markdown);
	if (tocAside) {
		nodes.push(tocAside);
	}
	
	const lines = markdown.split(/\r?\n/);

	let inCodeBlock = false;
	let codeBlockContent: string[] = [];

	let inList = false;
	let currentListTag: "ul" | "ol" | "" = "";
	let currentListItems: TelegraphNode[] = [];

	let inBlockquote = false;
	let blockquoteContent: string[] = [];

	let inTable = false;
	let tableLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] || "";

		// Handle code blocks first (they have highest priority)
		if (line.startsWith("```")) {
			if (inCodeBlock) {
				// End of code block
				// Close any open blocks first
				if (inTable) {
					nodes.push(parseTable(tableLines));
					inTable = false;
					tableLines = [];
				}
				if (inList) {
					nodes.push({ tag: currentListTag, children: currentListItems });
					inList = false;
					currentListItems = [];
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
				if (inTable) {
					nodes.push(parseTable(tableLines));
					inTable = false;
					tableLines = [];
				}
				if (inList) {
					nodes.push({ tag: currentListTag, children: currentListItems });
					inList = false;
					currentListItems = [];
				}
				if (inBlockquote) {
					nodes.push({
						tag: "blockquote",
						children: processInlineMarkdown(blockquoteContent.join("\n")),
					});
					inBlockquote = false;
					blockquoteContent = [];
				}

				inCodeBlock = true;
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlockContent.push(line);
			continue;
		}

		// Handle table detection and parsing
		const isTableLine = line.includes("|") && line.trim() !== "";
		const isTableSeparator = /^\s*\|?[\s\-|:]+\|?\s*$/.test(line);

		if (isTableLine || isTableSeparator) {
			if (!inTable) {
				// Close any open blocks first
				if (inList) {
					nodes.push({ tag: currentListTag, children: currentListItems });
					inList = false;
					currentListItems = [];
				}
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
			nodes.push(parseTable(tableLines));
			inTable = false;
			tableLines = [];
			// Continue processing current line
		}

		// Handle blockquotes
		if (line.startsWith(">")) {
			if (!inBlockquote) {
				// If previously in a list, close it first
				if (inList) {
					nodes.push({ tag: currentListTag, children: currentListItems });
					inList = false;
					currentListItems = [];
				}
				inBlockquote = true;
				blockquoteContent = [];
			}
			blockquoteContent.push(line.substring(1).trimStart()); // Remove '>' and leading space
			continue;
		} else if (inBlockquote) {
			// If not a blockquote line, but was in blockquote, close it
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
			if (inList) {
				nodes.push({ tag: currentListTag, children: currentListItems });
				inList = false;
				currentListItems = [];
			}
			if (inBlockquote) {
				nodes.push({
					tag: "blockquote",
					children: processInlineMarkdown(blockquoteContent.join("\n")),
				});
				inBlockquote = false;
				blockquoteContent = [];
			}
			const level = headingMatch[1].length;
			const originalText = headingMatch[2] || "";
			let displayText = originalText;
			let tag: 'h3' | 'h4' = 'h3';

			// Map headings to Telegraph API compatible tags with visual hierarchy preservation
			// Telegraph API only supports h3 and h4 tags for headings
			switch (level) {
				case 1:
				case 2:
				case 3:
					// H1, H2, H3 → h3 (highest available level in Telegraph API)
					tag = 'h3';
					displayText = originalText;
					break;
				case 4:
					// H4 → h4 (direct mapping, supported by Telegraph API)
					tag = 'h4';
					displayText = originalText;
					break;
				case 5:
					// H5 → h4 with visual prefix to preserve hierarchy and enable anchors
					tag = 'h4';
					displayText = `» ${originalText}`;
					break;
				case 6:
					// H6 → h4 with double visual prefix to preserve hierarchy and enable anchors
					tag = 'h4';
					displayText = `»» ${originalText}`;
					break;
				default:
					// Handle edge case: levels > 6 as h4 with triple visual prefix
					tag = 'h4';
					displayText = `»»» ${originalText}`;
					break;
			}

			const processedChildren = processInlineMarkdown(displayText);
			nodes.push({ tag, children: processedChildren });
			continue;
		}

		// Handle lists (NOW AFTER HEADINGS)
		const listItemMatch = line.match(/^(-|\*)\s+(.*)|(\d+)\.\s+(.*)/);
		if (listItemMatch) {
			if (!inList) {
				// If previously in a blockquote, close it first
				if (inBlockquote) {
					nodes.push({
						tag: "blockquote",
						children: processInlineMarkdown(blockquoteContent.join("\n")),
					});
					inBlockquote = false;
					blockquoteContent = [];
				}
				inList = true;
				currentListTag = listItemMatch[1] ? "ul" : "ol";
				currentListItems = [];
			}
			let textContent = "";
			if (listItemMatch[2] !== undefined) {
				textContent = listItemMatch[2];
			} else if (listItemMatch[4] !== undefined) {
				textContent = listItemMatch[4];
			}
			if (textContent) {
				currentListItems.push({
					tag: "li",
					children: processInlineMarkdown(textContent.trim()),
				});
			}
			continue;
		} else if (inList) {
			// If not a list item, but was in a list, close it
			if (line.trim() === "") {
				// Empty line closes a list
				nodes.push({ tag: currentListTag, children: currentListItems });
				inList = false;
				currentListItems = [];
				continue; // Don't add empty paragraph for the empty line
			} else {
				// New content, close list and process as new paragraph
				nodes.push({ tag: currentListTag, children: currentListItems });
				inList = false;
				currentListItems = [];
				// Process current line as a new element (paragraph)
			}
		}

		// Handle horizontal rules (simple check for now)
		if (line.match(/^[*-]{3,}\s*$/)) {
			// Close any open blocks before adding HR
			if (inList) {
				nodes.push({ tag: currentListTag, children: currentListItems });
				inList = false;
				currentListItems = [];
			}
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
			// Do not add empty paragraphs if previous node was also an empty paragraph
			const lastNode = nodes[nodes.length - 1];
			if (
				nodes.length > 0 &&
				typeof lastNode === "object" &&
				lastNode.tag === "p" &&
				(!lastNode.children ||
					lastNode.children.length === 0 ||
					(lastNode.children.length === 1 && lastNode.children[0] === ""))
			) {
				continue; // Skip adding redundant empty paragraph
			}
			if (!inList && !inBlockquote && !inCodeBlock && !inTable) {
				// Only add empty paragraph if not inside a block
				nodes.push({ tag: "p", children: [""] });
			}
			continue;
		}

		// If we reach here, it's a plain paragraph line
		// Close any open blocks (lists, blockquotes) if this line is not part of them
		if (inList) {
			nodes.push({ tag: currentListTag, children: currentListItems });
			inList = false;
			currentListItems = [];
		}
		if (inBlockquote) {
			nodes.push({
				tag: "blockquote",
				children: processInlineMarkdown(blockquoteContent.join("\n")),
			});
			inBlockquote = false;
			blockquoteContent = [];
		}

		nodes.push({ tag: "p", children: processInlineMarkdown(line) });
	}

	// After loop, close any open blocks
	if (inCodeBlock) {
		nodes.push({
			tag: "pre",
			children: [
				{ tag: "code", children: [codeBlockContent.join("\n").trimEnd()] },
			],
		}); // Trim end for final code block
	}
	if (inList) {
		nodes.push({ tag: currentListTag, children: currentListItems });
	}
	if (inBlockquote) {
		nodes.push({
			tag: "blockquote",
			children: processInlineMarkdown(blockquoteContent.join("\n")),
		});
	}
	if (inTable) {
		nodes.push(parseTable(tableLines));
	}

	// Filter out any empty paragraph nodes that might have been created unnecessarily
	return nodes.filter(
		(node) =>
			!(
				node.tag === "p" &&
				(!node.children ||
					node.children.length === 0 ||
					(node.children.length === 1 && node.children[0] === ""))
			),
	);
}

function processInlineMarkdown(text: string): (string | TelegraphNode)[] {
	const result: (string | TelegraphNode)[] = [];
	let currentIndex = 0;

	// Define patterns for different inline elements
	const patterns = [
		{ regex: /\*\*(.*?)\*\*/g, tag: "strong" },
		{ regex: /__(.*?)__/g, tag: "strong" },
		{ regex: /\*(.*?)\*/g, tag: "em" },
		{ regex: /_(.*?)_/g, tag: "em" },
		{ regex: /`(.*?)`/g, tag: "code" },
		{ regex: /\[(.*?)\]\((.*?)\)/g, tag: "a", isLink: true },
	];

	// Find all matches with their positions
	const matches: Array<{
		index: number;
		length: number;
		tag: string;
		content: string;
		href?: string;
	}> = [];

	for (const pattern of patterns) {
		pattern.regex.lastIndex = 0; // Reset regex
		let match: RegExpExecArray | null = null;
		match = pattern.regex.exec(text);
		while (match !== null) {
			if (match.index !== undefined) {
				if (pattern.isLink) {
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
		if (match.tag === "a" && match.href !== undefined) {
			result.push({
				tag: "a",
				attrs: { href: match.href },
				children: [match.content],
			});
		} else {
			result.push({
				tag: match.tag,
				children: [match.content],
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
