import type { PagesCacheManager } from "../cache/PagesCacheManager";
import type { LocalLink, TelegraphLink } from "../types/metadata";
import { LinkResolver } from "./LinkResolver";

/**
 * Resolves bidirectional links between local files and Telegraph URLs
 */
export class BidirectionalLinkResolver extends LinkResolver {
  private cacheManager: PagesCacheManager;

  constructor(cacheManager: PagesCacheManager) {
    super();
    this.cacheManager = cacheManager;
  }

  /**
   * Find Telegraph links in content that should be converted to local links
   * @param content Content to analyze
   * @returns Array of Telegraph links found
   */
  static findTelegraphLinks(content: string, cacheManager: PagesCacheManager): TelegraphLink[] {
    const links: TelegraphLink[] = [];
    const telegraphLinkRegex = /\[([^\]]*)\]\((https:\/\/telegra\.ph\/[^)]+)\)/g;

    let match: RegExpExecArray | null;
    match = telegraphLinkRegex.exec(content);
    while (match !== null) {
      const [fullMatch, linkText, telegraphUrl] = match;

      if (!fullMatch || !linkText || !telegraphUrl) continue;

      const localFilePath = cacheManager.getLocalPath(telegraphUrl);
      const shouldConvert = localFilePath !== null;

      links.push({
        text: linkText,
        telegraphUrl,
        localFilePath: localFilePath || undefined,
        fullMatch,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
        shouldConvertToLocal: shouldConvert
      });

      match = telegraphLinkRegex.exec(content);
    }

    return links;
  }

  /**
   * Enhanced local link detection with internal link marking
   * @param content Content to analyze
   * @param basePath Base file path
   * @param cacheManager Cache manager for checking published status
   * @returns Array of local links with internal link flags
   */
  static findLocalLinksEnhanced(
    content: string,
    basePath: string,
    cacheManager: PagesCacheManager
  ): LocalLink[] {
    const localLinks = LinkResolver.findLocalLinks(content, basePath);

    // Mark internal links (links to our published pages)
    for (const link of localLinks) {
      const telegraphUrl = cacheManager.getTelegraphUrl(link.resolvedPath);
      if (telegraphUrl) {
        link.isPublished = true;
        link.telegraphUrl = telegraphUrl;
        link.isInternalLink = true;
      }
    }

    return localLinks;
  }

  /**
   * Replace Telegraph links with local links in content
   * @param content Original content
   * @param telegraphLinks Telegraph links to replace
   * @returns Content with Telegraph links replaced with local links
   */
  static replaceTelegraphLinksWithLocal(
    content: string,
    telegraphLinks: TelegraphLink[]
  ): string {
    let modifiedContent = content;

    // Sort by start index in reverse order to maintain indices
    const sortedLinks = telegraphLinks
      .filter(link => link.shouldConvertToLocal && link.localFilePath)
      .sort((a, b) => b.startIndex - a.startIndex);

    for (const link of sortedLinks) {
      const localLink = `[${link.text}](${link.localFilePath})`;
      modifiedContent =
        modifiedContent.substring(0, link.startIndex) +
        localLink +
        modifiedContent.substring(link.endIndex);
    }

    return modifiedContent;
  }

  /**
   * Create bidirectional content processing result
   * @param content Original content
   * @param basePath Base file path
   * @param cacheManager Cache manager
   * @returns Enhanced processed content with bidirectional links
   */
  static processBidirectionalContent(
    content: string,
    basePath: string,
    cacheManager: PagesCacheManager
  ): {
    contentWithLocalLinks: string;
    contentWithTelegraphLinks: string;
    localLinks: LocalLink[];
    telegraphLinks: TelegraphLink[];
    hasLocalToTelegraphChanges: boolean;
    hasTelegraphToLocalChanges: boolean;
  } {
    // Find local links that might need Telegraph URL replacement
    const localLinks = BidirectionalLinkResolver.findLocalLinksEnhanced(content, basePath, cacheManager);

    // Find Telegraph links that might need local link replacement
    const telegraphLinks = BidirectionalLinkResolver.findTelegraphLinks(content, cacheManager);

    // Create content with Telegraph URLs (for publishing)
    const linkReplacements = new Map<string, string>();
    for (const link of localLinks) {
      if (link.telegraphUrl && link.isInternalLink) {
        linkReplacements.set(link.originalPath, link.telegraphUrl);
      }
    }
    const contentWithTelegraphLinks = LinkResolver.replaceLocalLinks(content, linkReplacements);

    // Create content with local links (for source file)
    const contentWithLocalLinks = BidirectionalLinkResolver.replaceTelegraphLinksWithLocal(content, telegraphLinks);

    return {
      contentWithLocalLinks,
      contentWithTelegraphLinks,
      localLinks,
      telegraphLinks,
      hasLocalToTelegraphChanges: linkReplacements.size > 0,
      hasTelegraphToLocalChanges: telegraphLinks.some(link => link.shouldConvertToLocal)
    };
  }

  /**
   * Update source file with local links if Telegraph links were found
   * @param filePath File path to update
   * @param contentWithLocalLinks Content with Telegraph links replaced by local links
   * @param originalContent Original file content
   * @param hasTelegraphToLocalChanges Whether any Telegraph to local changes were made
   * @returns Whether file was updated
   */
  static updateSourceFileWithLocalLinks(
    filePath: string,
    contentWithLocalLinks: string,
    originalContent: string,
    hasTelegraphToLocalChanges: boolean
  ): boolean {
    if (!hasTelegraphToLocalChanges || contentWithLocalLinks === originalContent) {
      return false;
    }

    try {
      const fs = require("node:fs");
      fs.writeFileSync(filePath, contentWithLocalLinks, "utf-8");
      console.log(`✅ Updated source file with local links: ${filePath}`);
      return true;
    } catch (error) {
      console.error(`❌ Error updating source file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Analyze bidirectional link changes
   * @param localLinks Local links found
   * @param telegraphLinks Telegraph links found
   * @returns Analysis of link changes
   */
  static analyzeBidirectionalChanges(
    localLinks: LocalLink[],
    telegraphLinks: TelegraphLink[]
  ): {
    localToTelegraphCount: number;
    telegraphToLocalCount: number;
    internalLinksCount: number;
    externalTelegraphLinksCount: number;
    summary: string[];
  } {
    const localToTelegraphCount = localLinks.filter(link => link.isInternalLink).length;
    const telegraphToLocalCount = telegraphLinks.filter(link => link.shouldConvertToLocal).length;
    const internalLinksCount = localLinks.filter(link => link.isInternalLink).length;
    const externalTelegraphLinksCount = telegraphLinks.filter(link => !link.shouldConvertToLocal).length;

    const summary: string[] = [];

    if (localToTelegraphCount > 0) {
      summary.push(`${localToTelegraphCount} local link(s) will be replaced with Telegraph URLs in published content`);
    }

    if (telegraphToLocalCount > 0) {
      summary.push(`${telegraphToLocalCount} Telegraph link(s) will be replaced with local links in source file`);
    }

    if (internalLinksCount > 0) {
      summary.push(`${internalLinksCount} internal link(s) detected between your published pages`);
    }

    if (externalTelegraphLinksCount > 0) {
      summary.push(`${externalTelegraphLinksCount} external Telegraph link(s) will remain unchanged`);
    }

    return {
      localToTelegraphCount,
      telegraphToLocalCount,
      internalLinksCount,
      externalTelegraphLinksCount,
      summary
    };
  }

  /**
   * Validate bidirectional link consistency
   * @param localLinks Local links
   * @param telegraphLinks Telegraph links
   * @param cacheManager Cache manager
   * @returns Validation results
   */
  static validateBidirectionalLinks(
    localLinks: LocalLink[],
    telegraphLinks: TelegraphLink[],
    cacheManager: PagesCacheManager
  ): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for broken local links
    for (const link of localLinks) {
      if (!LinkResolver.validateLinkTarget(link.resolvedPath)) {
        errors.push(`Broken local link: ${link.originalPath}`);
      }
    }

    // Check for Telegraph links that should be local but aren't in cache
    for (const link of telegraphLinks) {
      if (cacheManager.isOurPage(link.telegraphUrl) && !link.localFilePath) {
        warnings.push(`Telegraph link to our page but no local file mapping: ${link.telegraphUrl}`);
      }
    }

    // Check for circular references
    const localPaths = localLinks.map(link => link.resolvedPath);
    const duplicates = localPaths.filter((path, index) => localPaths.indexOf(path) !== index);
    if (duplicates.length > 0) {
      warnings.push(`Duplicate local links detected: ${duplicates.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    };
  }
}