import type { TelegraphNode } from "./telegraphPublisher"; // Import TelegraphNode interface

/**
 * Converts Markdown content directly into an array of TelegraphNode objects.
 * This function replaces the need for an intermediate HTML conversion step and 'mrkdwny' library.
 * It directly parses Markdown elements into the structure expected by the Telegra.ph API.
 * @param markdown The raw Markdown content.
 * @returns An array of TelegraphNode objects representing the parsed content.
 */
export function convertMarkdownToTelegraphNodes(markdown: string): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];
  const lines = markdown.split(/\r?\n/);

  let inCodeBlock = false;
  let inList = false;
  let currentListTag: 'ul' | 'ol' | '' = '';
  let currentListItems: TelegraphNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || ''; // Ensure line is always a string

    // Handle code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) { // End of code block
        const codeContent = currentListItems.map(node => {
          if (node.children && node.children[0]) {
            return String(node.children[0]);
          }
          return '';
        }).join('\n');
        nodes.push({ tag: "code", children: [codeContent] });
        currentListItems = []; // Clear for next use
      }
      continue;
    }

    if (inCodeBlock) {
      currentListItems.push({ tag: "text", children: [line] });
      continue;
    }

    // Handle headings
    const headingMatch = line.match(/^(#+)\s*(.*)/);
    if (headingMatch && headingMatch[1] && headingMatch[2] !== undefined) {
      if (inList) { // If was in a list, close it first
        nodes.push({ tag: currentListTag, children: currentListItems });
        inList = false;
        currentListItems = [];
      }
      const level = headingMatch[1].length;
      const text = headingMatch[2] || ''; // Use nullish coalescing
      nodes.push({ tag: `h${level}`, children: processInlineMarkdown(text) });
      continue;
    }

    // Handle blockquotes
    const blockquoteMatch = line.match(/^>\s*(.*)/);
    if (blockquoteMatch && blockquoteMatch[1] !== undefined) {
      if (inList) { // If was in a list, close it first
        nodes.push({ tag: currentListTag, children: currentListItems });
        inList = false;
        currentListItems = [];
      }
      const text = blockquoteMatch[1] || ''; // Use nullish coalescing
      nodes.push({ tag: "blockquote", children: processInlineMarkdown(text) });
      continue;
    }

    // Handle lists
    const listItemMatch = line.match(/^(-|\*)\s+(.*)|(\d+)\.\s+(.*)/);
    if (listItemMatch) {
      if (!inList) {
        inList = true;
        currentListTag = listItemMatch[1] ? 'ul' : 'ol';
        currentListItems = [];
      }
      let textContent = '';
      if (listItemMatch[2] !== undefined) {
        textContent = listItemMatch[2];
      } else if (listItemMatch[4] !== undefined) {
        textContent = listItemMatch[4];
      }
      if (textContent) {
        currentListItems.push({ tag: "li", children: processInlineMarkdown(textContent.trim()) });
      }
      continue;
    } else if (inList) { // Continue list if the next line is indented or empty (for multiline list items)
      const nextLine = lines[i + 1]; // Can be string or undefined
      // Check if next line is indented or empty, for now, just consider empty lines close the list
      if (line.trim() === '' && i + 1 < lines.length && (nextLine || '').trim() !== '') {
        // Treat as a new paragraph within the list item or new list item if indented
        currentListItems.push({ tag: "p", children: processInlineMarkdown(line.trim()) }); // This might need refinement
        continue;
      } else if (line.trim() !== '') { // If it's not a list item, assume it's a new paragraph closing the list
        nodes.push({ tag: currentListTag, children: currentListItems });
        inList = false;
        currentListItems = [];
        // Process the current line as a paragraph
        nodes.push({ tag: "p", children: processInlineMarkdown(line.trim()) });
        continue;
      }
    }

    // Handle horizontal rules (simple check for now)
    if (line.match(/^[*-]{3,}\s*$/)) {
      if (inList) { // Close list before hr
        nodes.push({ tag: currentListTag, children: currentListItems });
        inList = false;
        currentListItems = [];
      }
      nodes.push({ tag: "hr" });
      continue;
    }

    // Handle empty lines or plain paragraphs
    if (line.trim() === '') {
      if (inList) {
        const nextLine = lines[i + 1]; // Can be string or undefined
        // Empty line within a list might mean multi-paragraph list item or end of list
        // For now, close the list if followed by non-list content
        if (i + 1 < lines.length && !(nextLine || '').match(/^(-|\*)\s+(.*)|(\d+)\.\s+(.*)/) && (nextLine || '').trim() !== '') {
          nodes.push({ tag: currentListTag, children: currentListItems });
          inList = false;
          currentListItems = [];
        } else if (i + 1 < lines.length && (nextLine || '').trim() === '') {
            // Multiple empty lines, keep the list open but don't add to content
            continue;
        } else {
          // Empty line, could be part of a multi-line list item, just continue
          continue; // Don't add empty node
        }
      } else {
        // Plain empty line, represent as a paragraph with empty content if it's not a sequence of multiple empty lines
        const lastNode = nodes[nodes.length - 1];
        if (nodes.length > 0 && typeof lastNode === 'object' && lastNode.tag === 'p' && lastNode.children && lastNode.children.length === 1 && lastNode.children[0] === '') {
            // If the last node was an empty paragraph, skip adding another one
            continue;
        }
        nodes.push({ tag: "p", children: [""] });
      }
      continue;
    }

    // Default: treat as a paragraph
    if (inList) { // If in a list, treat as part of the current list item
        // This case needs more sophisticated logic for multi-line list items
        // For simplicity, for now, assume single line list items or new paragraphs
        nodes.push({ tag: currentListTag, children: currentListItems });
        inList = false;
        currentListItems = [];
        nodes.push({ tag: "p", children: processInlineMarkdown(line.trim()) });
    } else {
        nodes.push({ tag: "p", children: processInlineMarkdown(line.trim()) });
    }
  }

  // Close any open lists at the end of the file
  if (inList) {
    nodes.push({ tag: currentListTag, children: currentListItems });
  }

  return nodes.filter(node => {
    if (typeof node === 'object' && node.tag === 'p' && node.children && node.children.length === 1 && node.children[0] === '') {
        return false; // Filter out empty paragraphs unless they are intentional breaks
    }
    return true;
  });
}

/**
 * Processes inline Markdown elements (bold, italic, links, code) within a given string.
 * @param text The text containing inline Markdown.
 * @returns An array of strings or TelegraphNode objects.
 */
function processInlineMarkdown(text: string): (string | TelegraphNode)[] {
  const result: (string | TelegraphNode)[] = [];
  // Using a more robust regex to capture various inline elements and plain text
  const inlineRegex = /(\*\*(.+?)\*\*)|(__(.+?)__)|(\*(.+?)\*)|(_(.+?)_)|(?:\[([^\]]+?)\]\((.+?)\))|(`([^`]+?)`)|([^*_`\[\]<>]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add any plain text before the current match
    if (match.index > lastIndex) {
      result.push(text.substring(lastIndex, match.index));
    }

    // Determine which group matched and process accordingly
    if (match[1] && match[2]) { // **bold**
      result.push({ tag: "strong", children: processInlineMarkdown(match[2]) });
    } else if (match[3] && match[4]) { // __bold__
      result.push({ tag: "strong", children: processInlineMarkdown(match[4]) });
    } else if (match[5] && match[6]) { // *italic*
      result.push({ tag: "em", children: processInlineMarkdown(match[6]) });
    } else if (match[7] && match[8]) { // _italic_
      result.push({ tag: "em", children: processInlineMarkdown(match[8]) });
    } else if (match[9] && match[10]) { // [link text](url)
      const linkText = match[9];
      const url = match[10];
      result.push({ tag: "a", attrs: { href: url }, children: processInlineMarkdown(linkText) });
    } else if (match[11] && match[12]) { // `code`
      result.push({ tag: "code", children: [match[12]] });
    } else if (match[13]) { // Plain text (must be the last alternative)
      result.push(match[13]);
    }

    lastIndex = inlineRegex.lastIndex;
  }

  // Add any remaining plain text after the last match
  if (lastIndex < text.length) {
    result.push(text.substring(lastIndex));
  }

  return result.filter(item => typeof item === 'string' ? item.trim() !== '' : true);
}

/**
 * Validates the structure of the Markdown content for shloka1.1.1.md.
 * Checks for specific headings and patterns.
 * @param markdownContent The Markdown content as a string.
 * @returns True if the content structure is valid, false otherwise.
 */
export function validateContentStructure(markdownContent: string): boolean {
  console.log("🔎 Starting content structure validation for шлока1.1.1.md...");

  let isValid = true;

  // Check for the main heading
  if (!markdownContent.includes('### **Связный пословный перевод Шримад-Бхагаватам 1.1.1**')) {
    console.error("❌ Validation Error: Missing main heading '### **Связный пословный перевод Шримад-Бхагаватам 1.1.1**'");
    isValid = false;
  }

  // Check for 'Полный текст:' section
  if (!markdownContent.includes('**Полный текст:**')) {
    console.error("❌ Validation Error: Missing section '**Полный текст:**'");
    isValid = false;
  }

  // Check for 'Разбор и связный перевод:' section
  if (!markdownContent.includes('**Разбор и связный перевод:**')) {
    console.error("❌ Validation Error: Missing section '**Разбор и связный перевод:**'");
    isValid = false;
  }

  // Check for 'Часть N: ...' headings and corresponding blockquotes/Svyazno patterns
  const partHeadings = markdownContent.match(/\*\*Часть (\d+):\s(.*?)\*\*/g);
  if (!partHeadings || partHeadings.length < 5) { // Assuming there are at least 5 parts based on the file
    console.error("❌ Validation Error: Insufficient 'Часть N: ...' headings found.");
    isValid = false;
  }

  partHeadings?.forEach(heading => {
    const partNumberMatch = heading.match(/Часть (\d+):/);
    if (partNumberMatch) {
      const partNumber = partNumberMatch[1];
      // Check for corresponding blockquote pattern for each part
      const blockquoteRegex = new RegExp(`>\\s*\\*\\*.*?\\*\\*`, 'm');
      if (!markdownContent.includes(heading) || !blockquoteRegex.test(markdownContent.substring(markdownContent.indexOf(heading)))) {
        console.error(`❌ Validation Error: Missing or malformed blockquote for '${heading}'.`);
        isValid = false;
      }

      // Check for corresponding 'Связно:' pattern for each part
      const svyaznoRegex = new RegExp(`\\*\\*Связно:\\*\\*\\s*«.*?»`, 'm');
      if (!markdownContent.includes(heading) || !svyaznoRegex.test(markdownContent.substring(markdownContent.indexOf(heading)))) {
        console.error(`❌ Validation Error: Missing or malformed 'Связно:' for '${heading}'.`);
        isValid = false;
      }
    }
  });

  // Check for 'Итоговый связный перевод в едином тексте:' section
  if (!markdownContent.includes('### **Итоговый связный перевод в едином тексте:**')) {
    console.error("❌ Validation Error: Missing final section '### **Итоговый связный перевод в едином тексте:**'");
    isValid = false;
  }

  if (isValid) {
    console.log("✅ Content structure validated successfully.");
  } else {
    console.log("⚠️  Content structure validation failed. Please review the errors above.");
  }

  return isValid;
}