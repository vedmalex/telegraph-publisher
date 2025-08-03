import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PathResolver } from '../utils/PathResolver';
import {
  type BrokenLink,
  type FileScanResult,
  type LinkVerificationError,
  LinkVerificationException,
  type MarkdownLink
} from './types';

/**
 * LinkVerifier is responsible for verifying the existence of links and identifying broken ones
 */
export class LinkVerifier {
  private pathResolver: PathResolver;
  // Cache for file anchors to avoid re-reading and re-parsing files
  private anchorCache: Map<string, Set<string>> = new Map();

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  /**
   * Verify all local links in a file scan result
   * @param scanResult The file scan result to verify
   * @returns Updated scan result with broken links identified
   */
  async verifyLinks(scanResult: FileScanResult): Promise<FileScanResult> {
    const brokenLinks: BrokenLink[] = [];

    for (const link of scanResult.localLinks) {
      try {
        // Extract path and fragment parts from href
        const [pathPart, ...fragmentParts] = link.href.split('#');
        const fragment = fragmentParts.join('#');

        // Only process if there's a file path to check
        if (pathPart) {
          const resolvedPath = this.resolveLinkPath(pathPart, scanResult.filePath);

          // 1. Verify file existence (existing logic)
          if (!existsSync(resolvedPath)) {
            brokenLinks.push({
              filePath: scanResult.filePath,
              link,
              suggestions: [], // Will be populated by LinkResolver
              canAutoFix: false // Will be determined after suggestions are generated
            });
            continue; // Don't check anchor if file is missing
          }

          // 2. NEW: Verify anchor existence if a fragment is present
          if (fragment) {
            const targetAnchors = this.getAnchorsForFile(resolvedPath);
            // Decode URI component for non-latin characters and slugify it for comparison
            const requestedAnchor = this.generateSlug(decodeURIComponent(fragment));

            if (!targetAnchors.has(requestedAnchor)) {
              // NEW: Find closest match for intelligent suggestions
              const suggestion = this.findClosestAnchor(requestedAnchor, targetAnchors);
              const suggestions = suggestion ? [`${pathPart}#${suggestion}`] : [];

              brokenLinks.push({
                filePath: scanResult.filePath,
                link,
                suggestions, // Now populated with intelligent suggestions
                canAutoFix: false // Keep false for anchor fixes (safety)
              });
            }
          }
        }
        // NOTE: If pathPart is empty (pure fragment link),
        // we skip processing, maintaining existing behavior
      } catch (error) {
        // If we can't resolve the path, consider it broken
        brokenLinks.push({
          filePath: scanResult.filePath,
          link,
          suggestions: [],
          canAutoFix: false
        });
      }
    }

    return {
      ...scanResult,
      brokenLinks
    };
  }

  /**
   * Verify multiple file scan results
   * @param scanResults Array of file scan results
   * @returns Array of updated scan results with broken links identified
   */
  async verifyMultipleFiles(scanResults: FileScanResult[]): Promise<FileScanResult[]> {
    const results: FileScanResult[] = [];

    for (const scanResult of scanResults) {
      results.push(await this.verifyLinks(scanResult));
    }

    return results;
  }

  /**
   * Check if a specific link exists
   * @param linkHref The link URL/path to check
   * @param sourceFilePath Path of the file containing the link
   * @returns True if the link target exists
   */
  linkExists(linkHref: string, sourceFilePath: string): boolean {
    try {
      const resolvedPath = this.resolveLinkPath(linkHref, sourceFilePath);
      return existsSync(resolvedPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolve a link path relative to the source file
   * @param linkHref The link URL/path
   * @param sourceFilePath Path of the file containing the link
   * @returns Absolute path to the link target
   */
  resolveLinkPath(linkHref: string, sourceFilePath: string): string {
    // Handle different types of links
    if (this.isExternalLink(linkHref)) {
      throw new LinkVerificationException(
        'INVALID_PATH' as LinkVerificationError,
        `Cannot resolve external link: ${linkHref}`,
        sourceFilePath
      );
    }

    if (this.isFragmentLink(linkHref)) {
      throw new LinkVerificationException(
        'INVALID_PATH' as LinkVerificationError,
        `Cannot resolve fragment link: ${linkHref}`,
        sourceFilePath
      );
    }

    // Use PathResolver for all path resolutions
    return this.pathResolver.resolve(sourceFilePath, linkHref);
  }

  /**
   * Check if a link is external (HTTP, HTTPS, etc.)
   * @param linkHref Link to check
   * @returns True if link is external
   */
  private isExternalLink(linkHref: string): boolean {
    return linkHref.startsWith('http://') ||
      linkHref.startsWith('https://') ||
      linkHref.startsWith('mailto:') ||
      linkHref.startsWith('ftp://') ||
      linkHref.startsWith('//');
  }

  /**
   * Check if a link is a fragment (anchor) link
   * @param linkHref Link to check
   * @returns True if link is a fragment
   */
  private isFragmentLink(linkHref: string): boolean {
    return linkHref.startsWith('#');
  }

  /**
   * Get detailed verification information for a link
   * @param link The link to verify
   * @param sourceFilePath Path of the file containing the link
   * @returns Verification details
   */
  getVerificationDetails(link: MarkdownLink, sourceFilePath: string): {
    exists: boolean;
    resolvedPath?: string;
    error?: string;
  } {
    try {
      const resolvedPath = this.resolveLinkPath(link.href, sourceFilePath);
      const exists = existsSync(resolvedPath);

      return {
        exists,
        resolvedPath: exists ? resolvedPath : undefined
      };
    } catch (error) {
      return {
        exists: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate that a link path is safe (no directory traversal attacks)
   * @param linkHref Link to validate
   * @param sourceFilePath Source file path
   * @returns True if link is safe
   */
  isLinkSafe(linkHref: string, sourceFilePath: string): boolean {
    try {
      const resolvedPath = this.resolveLinkPath(linkHref, sourceFilePath);
      const sourceDir = dirname(sourceFilePath);
      const projectRoot = this.pathResolver.findProjectRoot(sourceFilePath);

      // Check if resolved path is within project boundaries
      return resolvedPath.startsWith(projectRoot) || resolvedPath.startsWith(sourceDir);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get statistics about link verification
   * @param scanResults Array of verified scan results
   * @returns Verification statistics
   */
  getVerificationStats(scanResults: FileScanResult[]): {
    totalFiles: number;
    totalLinks: number;
    totalLocalLinks: number;
    totalBrokenLinks: number;
    brokenLinkPercentage: number;
    filesByBrokenLinks: number;
  } {
    const totalFiles = scanResults.length;
    const totalLinks = scanResults.reduce((sum, result) => sum + result.allLinks.length, 0);
    const totalLocalLinks = scanResults.reduce((sum, result) => sum + result.localLinks.length, 0);
    const totalBrokenLinks = scanResults.reduce((sum, result) => sum + result.brokenLinks.length, 0);
    const filesByBrokenLinks = scanResults.filter(result => result.brokenLinks.length > 0).length;

    return {
      totalFiles,
      totalLinks,
      totalLocalLinks,
      totalBrokenLinks,
      brokenLinkPercentage: totalLocalLinks > 0 ? (totalBrokenLinks / totalLocalLinks) * 100 : 0,
      filesByBrokenLinks
    };
  }

  /**
   * Generates a URL-friendly slug from a heading text.
   * This mimics the behavior of most Markdown parsers.
   * @param text The heading text.
   * @returns A lower-case, hyphenated slug.
   */
  private generateSlug(text: string): string {
    return text
      .toLowerCase()                           // 1. Normalize case
      .trim()                                  // 2. Remove leading/trailing whitespace
      .replace(/<[^>]+>/g, '')                 // 3. Remove HTML tags
      .replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\s-]/g, '') // 4. Keep letters, numbers, spaces, hyphens (including Unicode)
      .replace(/\s+/g, '-');                   // 5. Replace spaces with hyphens
  }

  /**
   * Extracts all valid anchors (from headings) from a Markdown file.
   * Results are cached to improve performance.
   * @param filePath The absolute path to the Markdown file.
   * @returns A Set containing all valid anchor slugs for the file.
   */
  private getAnchorsForFile(filePath: string): Set<string> {
    if (this.anchorCache.has(filePath)) {
      return this.anchorCache.get(filePath)!;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const headingRegex = /^(#{1,6})\s+(.*)/gm;
      const anchors = new Set<string>();

      let match;
      while ((match = headingRegex.exec(content)) !== null) {
        const headingText = match[2]?.trim();
        if (headingText) {
          anchors.add(this.generateSlug(headingText));
        }
      }

      this.anchorCache.set(filePath, anchors);
      return anchors;
    } catch (error) {
      // If the file can't be read, return an empty set.
      // The file existence check will handle the "broken link" error.
      return new Set<string>();
    }
  }

  /**
   * Calculates a simple string similarity score optimized for anchor text.
   * Uses character intersection approach for performance and simplicity.
   * @param s1 First string (typically the requested anchor)
   * @param s2 Second string (typically an available anchor)
   * @returns Similarity score between 0.0 and 1.0
   */
  private calculateSimilarity(s1: string, s2: string): number {
    // Handle edge cases first
    if (s1 === s2) return 1.0;
    if (s1.length === 0 && s2.length === 0) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    // Count matching characters (order independent for typo tolerance)
    const matchingChars = [...shorter].filter(char => longer.includes(char)).length;
    return matchingChars / longer.length;
  }

  /**
   * Finds the closest matching anchor from a set of available anchors.
   * @param requestedAnchor The anchor that was not found
   * @param availableAnchors A Set of valid anchors in the target file
   * @returns The best suggestion, or null if no suitable match is found
   */
  private findClosestAnchor(requestedAnchor: string, availableAnchors: Set<string>): string | null {
    let bestMatch: string | null = null;
    let highestScore = 0.7; // Minimum similarity threshold

    for (const available of availableAnchors) {
      const score = this.calculateSimilarity(requestedAnchor, available);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = available;
      }
    }
    return bestMatch;
  }
}