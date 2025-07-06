import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Removes specific formatting from a Markdown file:
 * - Markdown styling (bold, italic, strikethrough, links, images, headings, lists, blockquotes, code blocks)
 * - Replaces multiple newlines with a single newline.
 * - Removes leading/trailing whitespace from each line.
 * Overwrites the original file.
 * @param filePath The path to the Markdown file.
 */
export function cleanMarkdownFile(filePath: string) {
    try {
        const fullPath = resolve(process.cwd(), filePath);
        let content = readFileSync(fullPath, 'utf8');

        // Remove Markdown styling (bold, italic, strikethrough, links, images, headings, lists, blockquotes, code blocks)
        content = content.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
        content = content.replace(/__(.*?)__/g, '$1'); // Bold
        content = content.replace(/\*(.*?)\*/g, '$1');  // Italic
        content = content.replace(/_(.*?)_/g, '$1');  // Italic
        content = content.replace(/~~(.*?)~~/g, '$1'); // Strikethrough
        content = content.replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Links
        content = content.replace(/!\[(.*?)\]\(.*?\)/g, '$1'); // Images
        content = content.replace(/^#+\s/gm, ''); // Headings
        content = content.replace(/^[*-]\s/gm, ''); // Lists
        content = content.replace(/^>\s/gm, ''); // Blockquotes
        content = content.replace(/```[\s\S]*?```/g, ''); // Code blocks
        content = content.replace(/`/g, ''); // Inline code

        // Replace multiple newlines with a single newline
        content = content.replace(/\n{2,}/g, '\n');

        // Remove leading/trailing whitespace from each line
        content = content.split('\n').map(line => line.trim()).join('\n');

        writeFileSync(fullPath, content, 'utf8');
        console.log(`Successfully cleaned: ${filePath}`);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.error(`Error: File not found - ${filePath}`);
        } else {
            console.error(`Error processing file ${filePath}: ${error.message}`);
        }
        process.exit(1);
    }
}

// Get file path from command line arguments when executed directly
if (import.meta.main) {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error('Usage: bun clean-md <file-path>');
        process.exit(1);
    }

    cleanMarkdownFile(filePath);
}
