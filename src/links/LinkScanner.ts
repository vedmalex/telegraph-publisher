import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type FileScanResult,
  type LinkVerificationError,
  LinkVerificationException,
  type MarkdownLink,
  type ProgressCallback,
  type ScanConfig
} from './types';
import { newMarkdownLinkRegex } from './utils/regex';
import { isMarkdownFilePath } from './utils/fs';

/**
 * LinkScanner is responsible for discovering Markdown files and extracting links from them
 */
export class LinkScanner {
  private config: Required<ScanConfig>;

  constructor(config: ScanConfig = {}) {
    this.config = {
      extensions: config.extensions || ['.md', '.markdown'],
      ignoreDirs: config.ignoreDirs || ['.git', 'node_modules', 'dist', '.specstory'],
      maxDepth: config.maxDepth ?? -1,
      followSymlinks: config.followSymlinks ?? false
    };
  }

  /**
   * Find all Markdown files in the given path (file or directory)
   * @param targetPath Path to scan
   * @param progressCallback Optional progress callback
   * @returns Array of file paths
   */
  async findMarkdownFiles(targetPath: string, progressCallback?: ProgressCallback): Promise<string[]> {
    const resolvedPath = resolve(targetPath);

    if (!existsSync(resolvedPath)) {
      throw new LinkVerificationException(
        'FILE_NOT_FOUND' as LinkVerificationError,
        `Path does not exist: ${resolvedPath}`,
        resolvedPath
      );
    }

    const stat = statSync(resolvedPath);

    if (stat.isFile()) {
      // Single file - check if it's a markdown file
      if (this.isMarkdownFile(resolvedPath)) {
        return [resolvedPath];
      }
      return [];
    }

    if (stat.isDirectory()) {
      return this.scanDirectoryRecursive(resolvedPath, 0, progressCallback);
    }

    return [];
  }

  /**
   * Scan a single file for Markdown links
   * @param filePath Path to the file to scan
   * @returns Scan result for the file
   */
  async scanFile(filePath: string): Promise<FileScanResult> {
    const startTime = Date.now();

    try {
      const content = readFileSync(filePath, 'utf-8');
      const allLinks = LinkScanner.extractLinks(content);
      const localLinks = allLinks.filter((link: MarkdownLink) => this.isLocalLink(link.href));

      return {
        filePath,
        allLinks,
        localLinks,
        brokenLinks: [], // Will be populated by LinkVerifier
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      throw new LinkVerificationException(
        'PARSE_ERROR' as LinkVerificationError,
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      );
    }
  }

  /**
   * Extract Markdown links from content using regex
   * @param content File content to parse
   * @returns Array of found links
   */
  public static extractLinks(content: string): MarkdownLink[] {
    const links: MarkdownLink[] = [];
    const lines = content.split('\n');

    lines.forEach((line, lineIndex) => {
      const linkRegex = newMarkdownLinkRegex();

      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(line)) !== null) {
        const [fullMatch, text, href] = match;
        const columnStart = match.index || 0;
        const columnEnd = columnStart + fullMatch.length;

        links.push({
          text: (text || '').trim(),
          href: (href || '').trim(),
          lineNumber: lineIndex + 1, // 1-based line numbers
          columnStart,
          columnEnd
        });
      }
    });

    return links;
  }

  /**
   * Check if a link is local (not external URL)
   * @param href Link URL/path
   * @returns True if the link is local
   */
  private isLocalLink(href: string): boolean {
    // External links start with protocol or are email/ftp links
    if (href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('mailto:') ||
      href.startsWith('ftp://') ||
      href.startsWith('//')) {
      return false;
    }

    // Fragment-only links (#section) are NOT counted as local files here.
    // Anchor verification is handled by LinkVerifier with file context.
    if (href.startsWith('#')) {
      return false;
    }

    return true;
  }

  /**
   * Recursively scan directory for markdown files
   * @param dirPath Directory to scan
   * @param currentDepth Current recursion depth
   * @param progressCallback Optional progress callback
   * @returns Array of markdown file paths
   */
  private async scanDirectoryRecursive(
    dirPath: string,
    currentDepth: number,
    progressCallback?: ProgressCallback
  ): Promise<string[]> {
    const files: string[] = [];

    // Check depth limit
    if (this.config.maxDepth >= 0 && currentDepth >= this.config.maxDepth) {
      return files;
    }

    try {
      const entries = readdirSync(dirPath);
      let processedCount = 0;

      for (const entry of entries) {
        if (progressCallback) {
          progressCallback(processedCount, entries.length, `Scanning: ${entry}`);
        }

        const fullPath = join(dirPath, entry);

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip ignored directories
            if (!this.shouldIgnoreDirectory(entry)) {
              const subFiles = await this.scanDirectoryRecursive(
                fullPath,
                currentDepth + 1,
                progressCallback
              );
              files.push(...subFiles);
            }
          } else if (stat.isFile() && this.isMarkdownFile(fullPath)) {
            files.push(fullPath);
          }
        } catch (error) {
          // Skip files/directories that can't be accessed
          console.warn(`Warning: Could not access ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
        }

        processedCount++;
      }
    } catch (error) {
      throw new LinkVerificationException(
        'PERMISSION_DENIED' as LinkVerificationError,
        `Cannot read directory: ${error instanceof Error ? error.message : String(error)}`,
        dirPath
      );
    }

    return files.sort();
  }

  /**
   * Check if a file is a markdown file based on extension
   * @param filePath Path to check
   * @returns True if file is markdown
   */
  private isMarkdownFile(filePath: string): boolean {
    // Prefer shared util, but respect custom extensions if provided in config
    if (this.config.extensions && this.config.extensions.length > 0) {
      const lower = filePath.toLowerCase();
      return this.config.extensions.some(ext => lower.endsWith(ext.toLowerCase()));
    }
    return isMarkdownFilePath(filePath);
  }

  /**
   * Check if a directory should be ignored during scanning
   * @param dirName Directory name to check
   * @returns True if directory should be ignored
   */
  private shouldIgnoreDirectory(dirName: string): boolean {
    // Ignore hidden directories (starting with .)
    if (dirName.startsWith('.')) {
      return true;
    }

    // Ignore explicitly configured directories
    return this.config.ignoreDirs.includes(dirName);
  }

  /**
   * Get scan configuration
   * @returns Current scan configuration
   */
  getConfig(): Required<ScanConfig> {
    return { ...this.config };
  }

  /**
   * Update scan configuration
   * @param newConfig New configuration to merge
   */
  updateConfig(newConfig: Partial<ScanConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
}