import { existsSync } from 'node:fs';
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
        const resolvedPath = this.resolveLinkPath(link.href, scanResult.filePath);

        if (!existsSync(resolvedPath)) {
          brokenLinks.push({
            filePath: scanResult.filePath,
            link,
            suggestions: [], // Will be populated by LinkResolver
            canAutoFix: false // Will be determined after suggestions are generated
          });
        }
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
}