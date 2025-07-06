import * as fs from 'fs';
import * as path from 'path';

/**
 * Removes specific formatting from a Markdown file:
 * - Empty HTML comments (<!-- -->)
 * - Markdown links ([text](url) -> text)
 * - Lines starting with ::: or :::::
 * - Escaped brackets \[ \] -> [ ]
 * - Custom annotations like {#...}, ]{#...}, ]{#...}[
 * - Outer brackets from synonym lists [*text*;] -> *text*;
 * Overwrites the original file.
 * @param filepath The path to the Markdown file.
 */
function cleanMarkdownFile(filepath: string): void {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    // Preserve original newlines if possible
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);

    const cleanedLines: string[] = [];
    let inBlock = false; // Flag to track if we are inside a ::: block

    for (const line of lines) {
      console.log(`Original line: "${line}"`); // Debug: original line

      const trimmedLine = line.trim();

      // Handle block directives ::: or :::::
      if (trimmedLine.startsWith(':::') || trimmedLine.startsWith(':::::')) {
        inBlock = !inBlock; // Toggle block state
        console.log(`Skipping block directive line. inBlock: ${inBlock}`); // Debug
        continue; // Skip the directive line itself
      }

      if (inBlock) {
        console.log("Skipping line inside block."); // Debug
        continue; // Skip lines inside the block
      }

      // 1. Skip empty HTML comment lines
      if (trimmedLine === '<!-- -->') {
        console.log("Skipping empty HTML comment."); // Debug
        continue;
      }

      let processedLine = line;

      // 3. Replace Markdown links [text](url) with text
      processedLine = processedLine.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
      console.log(`After links: "${processedLine}"`); // Debug

      // 4. Replace escaped brackets \[ and \] with regular brackets [ and ]
      processedLine = processedLine.replace(/\\\\[/g, '[').replace(/\\\\]/g, ']');
      console.log(`After escaped brackets: "${processedLine}"`); // Debug

      // 5. Replace custom annotations
      // 5a: ]{#...}[ -> ' ' (space to prevent merging words)
      processedLine = processedLine.replace(/\]\{#.*?\}\[/g, ' ');
      console.log(`After ]{#...}[ : "${processedLine}"`); // Debug
      // 5b: ]{#...} -> '' (remove remaining)
      processedLine = processedLine.replace(/\]\{#.*?\}/g, '');
      console.log(`After ]{#...} : "${processedLine}"`); // Debug
      // 5c: {#...} -> '' (remove header/other annotations)
      processedLine = processedLine.replace(/\{#.*?\}/g, '');
      console.log(`After {#...} : "${processedLine}"`); // Debug

      // 6. Replace outer brackets from synonym lists like [*text* --- desc;]
      // Matches [ followed by *...; and anything else not ] then ]
      processedLine = processedLine.replace(/\[(\*.*?;[^\]]*)\]/g, '$1');
      console.log(`After synonym brackets: "${processedLine}"`); // Debug

      // 7. Trim trailing whitespace potentially left by replacements
      processedLine = processedLine.trimEnd();
      console.log(`Final processed line: "${processedLine}"`); // Debug

      cleanedLines.push(processedLine);
    }

    const cleanedContent = cleanedLines.join(newline);
    console.log(`\n--- Final cleaned content ---\n"${cleanedContent}"\n--- End ---`); // Debug: final content

    fs.writeFileSync(filepath, cleanedContent, 'utf-8');
    console.log(`Successfully cleaned: ${filepath}`);

  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(`Error: File not found - ${filepath}`);
    } else {
      console.error(`Error processing file ${filepath}: ${err.message}`);
    }
  }
}

/**
 * Processes a given path, cleaning Markdown files or traversing directories.
 * @param targetPath The file or directory path to process.
 */
function processPath(targetPath: string): void {
  try {
    if (!fs.existsSync(targetPath)) {
        console.error(`Error: Path does not exist - ${targetPath}`);
        return;
    }

    const stats = fs.statSync(targetPath);

    if (stats.isFile()) {
      if (targetPath.toLowerCase().endsWith('.md')) {
        cleanMarkdownFile(targetPath);
      } else {
        console.log(`Skipping non-Markdown file: ${targetPath}`);
      }
    } else if (stats.isDirectory()) {
      console.log(`Processing directory: ${targetPath}`);
      const entries = fs.readdirSync(targetPath);
      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry);
        processPath(fullPath); // Recursive call for subdirectories/files
      }
    } else {
         console.error(`Error: Path is not a file or directory - ${targetPath}`);
    }
  } catch (err: any) {
     console.error(`Error accessing path ${targetPath}: ${err.message}`);
  }
}

// --- Main Execution ---
const args = process.argv.slice(2); // Get command line arguments after node and script name

if (args.length === 0) {
  console.error('Usage: bun clean_mr.ts <file_or_directory_path> ...');
  // Or: ts-node clean_script.ts <file_or_directory_path> ...
  // Or: node dist/clean_script.js <file_or_directory_path> ... (after compiling)
  process.exit(1);
}

for (const target of args) {
  processPath(target);
}

console.log('Script finished.');
