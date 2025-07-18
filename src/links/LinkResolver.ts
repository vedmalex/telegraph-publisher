import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { LocalLink } from "../types/metadata";

/**
 * Resolves local markdown links and manages link replacement
 */
export class LinkResolver {
  private static readonly MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;
  private static readonly LOCAL_LINK_PATTERNS = [
    /^\.\.?\//,  // Relative paths: ./ or ../
    /^[^/]/,     // Relative paths without prefix
    /^\/[^/]/    // Absolute paths starting with /
  ];

  /**
   * Find all local links in markdown content
   * @param content Markdown content to analyze
   * @param basePath Base file path for resolving relative links
   * @returns Array of local links found
   */
  static findLocalLinks(content: string, basePath: string): LocalLink[] {
    const links: LocalLink[] = [];
    const baseDir = dirname(basePath);

    // Find all matches first
    const matches = Array.from(content.matchAll(LinkResolver.MARKDOWN_LINK_REGEX));

    for (const match of matches) {
      const [fullMatch, linkText, linkPath] = match;

      if (!fullMatch || !linkText || !linkPath) continue;

      // Skip external links (http, https, mailto, etc.)
      if (LinkResolver.isExternalLink(linkPath)) continue;

      // Skip anchor links
      if (linkPath.startsWith('#')) continue;

      // Check if this is a local file link
      if (LinkResolver.isLocalFileLink(linkPath)) {
        const resolvedPath = LinkResolver.resolveLocalPath(linkPath, baseDir);

        links.push({
          text: linkText,
          originalPath: linkPath,
          resolvedPath,
          isPublished: false, // Will be determined later
          fullMatch: fullMatch,
          startIndex: match.index,
          endIndex: match.index + fullMatch.length
        });
      }
    }

    return links;
  }

  /**
   * Resolve local file path to absolute path
   * @param linkPath Original link path
   * @param baseDir Base directory for resolving relative paths
   * @returns Resolved absolute path
   */
  static resolveLocalPath(linkPath: string, baseDir: string): string {
    // Handle absolute paths
    if (isAbsolute(linkPath)) {
      return linkPath;
    }

    // Handle relative paths
    return resolve(baseDir, linkPath);
  }

  /**
   * Validate that link target exists and is accessible
   * @param linkPath Path to validate
   * @returns True if file exists
   */
  static validateLinkTarget(linkPath: string): boolean {
    try {
      // Try the path as-is first
      if (existsSync(linkPath)) {
        return true;
      }

      // Try decoding URL-encoded characters
      const decodedPath = decodeURIComponent(linkPath);
      if (existsSync(decodedPath)) {
        return true;
      }

      return false;
    } catch (error) {
      console.warn(`Error validating link target ${linkPath}:`, error);
      return false;
    }
  }

  /**
   * Replace local links with Telegraph URLs in content
   * @param content Original content
   * @param linkReplacements Map of original paths to Telegraph URLs
   * @returns Content with replaced links
   */
  static replaceLocalLinks(
    content: string,
    linkReplacements: Map<string, string>
  ): string {
    let modifiedContent = content;

    // Reset regex state
    LinkResolver.MARKDOWN_LINK_REGEX.lastIndex = 0;

    // Collect all replacements to apply them in reverse order (to maintain indices)
    const replacements: Array<{
      startIndex: number;
      endIndex: number;
      newLink: string;
    }> = [];

    // Find all matches first
    const matches = Array.from(content.matchAll(LinkResolver.MARKDOWN_LINK_REGEX));

    for (const match of matches) {
      const [fullMatch, linkText, linkPath] = match;

      if (!fullMatch || !linkText || !linkPath) continue;

      // Skip external links
      if (LinkResolver.isExternalLink(linkPath)) continue;

      // Check if we have a replacement for this link
      const telegraphUrl = linkReplacements.get(linkPath);
      if (telegraphUrl) {
        const newLink = `[${linkText}](${telegraphUrl})`;
        replacements.push({
          startIndex: match.index,
          endIndex: match.index + fullMatch.length,
          newLink
        });
      }
    }

    // Apply replacements in reverse order to maintain indices
    replacements.sort((a, b) => b.startIndex - a.startIndex);

    for (const replacement of replacements) {
      modifiedContent =
        modifiedContent.substring(0, replacement.startIndex) +
        replacement.newLink +
        modifiedContent.substring(replacement.endIndex);
    }

    return modifiedContent;
  }

  /**
   * Get all unique local file paths from links
   * @param links Array of local links
   * @returns Set of unique resolved file paths
   */
  static getUniqueFilePaths(links: LocalLink[]): Set<string> {
    const paths = new Set<string>();

    for (const link of links) {
      if (LinkResolver.validateLinkTarget(link.resolvedPath)) {
        paths.add(link.resolvedPath);
      }
    }

    return paths;
  }

  /**
   * Filter links to only include markdown files
   * @param links Array of local links
   * @returns Links pointing to markdown files
   */
  static filterMarkdownLinks(links: LocalLink[]): LocalLink[] {
    return links.filter(link => LinkResolver.isMarkdownFile(link.resolvedPath));
  }

  /**
   * Check if path points to a markdown file
   * @param filePath File path to check
   * @returns True if file has markdown extension
   */
  static isMarkdownFile(filePath: string): boolean {
    const markdownExtensions = ['.md', '.markdown', '.mdown', '.mkd'];
    return markdownExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  /**
   * Check if link is external (http, https, etc.)
   * @param linkPath Link path to check
   * @returns True if link is external
   */
  private static isExternalLink(linkPath: string): boolean {
    try {
      const url = new URL(linkPath);
      return ['http:', 'https:', 'mailto:', 'ftp:', 'file:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Check if link path represents a local file
   * @param linkPath Link path to check
   * @returns True if link appears to be local file
   */
  private static isLocalFileLink(linkPath: string): boolean {
    // Skip query parameters and fragments
    const cleanPath = linkPath.split('?')[0]?.split('#')[0] || '';

    return LinkResolver.LOCAL_LINK_PATTERNS.some(pattern => pattern.test(cleanPath));
  }

  /**
   * Extract file extension from path
   * @param filePath File path
   * @returns File extension including dot
   */
  static getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot === -1 ? '' : filePath.substring(lastDot);
  }

  /**
   * Create link replacement map from file paths to Telegraph URLs
   * @param filePaths Set of file paths
   * @param getUrlForPath Function to get Telegraph URL for file path
   * @returns Map of original paths to Telegraph URLs
   */
  static createReplacementMap(
    filePaths: Set<string>,
    getUrlForPath: (path: string) => string | null
  ): Map<string, string> {
    const replacements = new Map<string, string>();

    for (const filePath of filePaths) {
      const telegraphUrl = getUrlForPath(filePath);
      if (telegraphUrl) {
        replacements.set(filePath, telegraphUrl);
      }
    }

    return replacements;
  }
}