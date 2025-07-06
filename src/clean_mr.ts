import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Removes specific Markdown formatting from a given string content.
 * - Markdown styling (bold, italic, strikethrough, links, images, headings, lists, blockquotes, code blocks)
 * - Replaces multiple newlines with a single newline.
 * - Removes leading/trailing whitespace from each line.
 * @param content The Markdown content as a string.
 * @returns The cleaned content string.
 */
export function cleanMarkdownString(content: string): string {
    let cleanedContent = content;

    // Replace multiple newlines with a single newline
    cleanedContent = cleanedContent.replace(/\n{2,}/g, '\n');

    // Remove leading/trailing whitespace from each line
    cleanedContent = cleanedContent.split('\n').map(line => line.trim()).join('\n');

    return cleanedContent;
}

/**
 * Reads a Markdown file, cleans its content, and overwrites the original file.
 * @param filePath The path to the Markdown file.
 */
export function cleanMarkdownFile(filePath: string) {
    try {
        const fullPath = resolve(process.cwd(), filePath);
        const content = readFileSync(fullPath, 'utf8');

        const cleanedContent = cleanMarkdownString(content);

        writeFileSync(fullPath, cleanedContent, 'utf8');
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
