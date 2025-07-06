import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Removes specific Markdown formatting from a given string content,
 * leaving a plain text representation. This function is intended to strip
 * all Markdown syntax for purposes like cleaning article titles.
 * @param content The Markdown content as a string.
 * @returns The cleaned content string.
 */
export function cleanMarkdownString(content: string): string {
    let cleanedContent = content;

    // --- Only remove inline Markdown syntax and heading markers ---

    // 1. Remove heading markers (e.g., # Heading, ## Subheading), keeping heading text
    cleanedContent = cleanedContent.replace(/^(#+)\s*/gm, '');

    // 2. Remove inline code (e.g., `code`)
    cleanedContent = cleanedContent.replace(/`([^`]+?)`/g, '$1');

    // 3. Remove images (e.g., ![alt text](url)), keeping alt text
    cleanedContent = cleanedContent.replace(/!\[(.*?)\]\(.*?\)/g, '$1');

    // 4. Remove links (e.g., [link text](url)), keeping link text
    cleanedContent = cleanedContent.replace(/\[(.*?)\]\(.*?\)/g, '$1');

    // 5. Remove bold/italic formatting (e.g., **bold**, *italic*), keeping content
    // Order matters for overlapping syntax (e.g., ***bold-italic*** should be handled by bold/italic first)
    cleanedContent = cleanedContent.replace(/\*\*(.*?)\*\*/g, '$1'); // **bold**
    cleanedContent = cleanedContent.replace(/__(.*?)__/g, '$1');     // __bold__
    cleanedContent = cleanedContent.replace(/\*(.*?)\*/g, '$1');   // *italic*
    cleanedContent = cleanedContent.replace(/_(.*?)_/g, '$1');     // _italic_

    // 6. Remove remaining common Markdown punctuation that might appear in titles
    cleanedContent = cleanedContent.replace(/[\*_`\[\]()]/g, '');

    // --- Post-processing / Normalization ---

    // Replace multiple spaces/tabs with single space
    cleanedContent = cleanedContent.replace(/[ \t]+/g, ' ');

    // Trim leading/trailing whitespace
    cleanedContent = cleanedContent.trim();

    return cleanedContent;
}

/**
 * Reads a Markdown file, cleans its content, and overwrites the original file.
 * This function is intended for full file cleaning, but its usage should be reviewed
 * if only parts of the file need cleaning. For this project, it might be deprecated
 * in favor of targeted string cleaning.
 * @param filePath The path to the Markdown file.
 */
export function cleanMarkdownFile(filePath: string) {
    try {
        const fullPath = resolve(process.cwd(), filePath);
        const content = readFileSync(fullPath, 'utf8');

        // NOTE: This now uses a less aggressive cleanMarkdownString.
        // If full file markdown stripping is needed in the future,
        // cleanMarkdownString would need a mode or a separate function.
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
