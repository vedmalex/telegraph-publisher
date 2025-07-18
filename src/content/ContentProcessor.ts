import { readFileSync } from "node:fs";
import { LinkResolver } from "../links/LinkResolver";
import { MetadataManager } from "../metadata/MetadataManager";
import type { FileMetadata, LocalLink, ProcessedContent } from "../types/metadata";

/**
 * Processes content for publication with link replacement and metadata handling
 */
export class ContentProcessor {

  /**
   * Process file content for publication
   * @param filePath Path to file to process
   * @returns Processed content information
   */
  static processFile(filePath: string): ProcessedContent {
    try {
      const originalContent = readFileSync(filePath, 'utf-8');
      return ContentProcessor.processContent(originalContent, filePath);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  /**
   * Process content string for publication
   * @param content Content to process
   * @param basePath Base path for resolving relative links
   * @returns Processed content information
   */
  static processContent(content: string, basePath: string): ProcessedContent {
    // Extract metadata if present
    const metadata = MetadataManager.parseMetadata(content);

    // Remove metadata from content
    const contentWithoutMetadata = MetadataManager.removeMetadata(content);

    // Find local links
    const localLinks = LinkResolver.findLocalLinks(contentWithoutMetadata, basePath);

    // Initially, content with replaced links is same as original
    // Will be modified by replaceLinksInContent method
    const contentWithReplacedLinks = contentWithoutMetadata;

    return {
      originalContent: content,
      contentWithoutMetadata,
      contentWithReplacedLinks,
      metadata: metadata || undefined,
      localLinks,
      hasChanges: localLinks.length > 0
    };
  }

  /**
   * Replace local links in processed content with Telegraph URLs
   * @param processedContent Previously processed content
   * @param linkMappings Map of local paths to Telegraph URLs
   * @returns Updated processed content with replaced links
   */
  static replaceLinksInContent(
    processedContent: ProcessedContent,
    linkMappings: Map<string, string>
  ): ProcessedContent {
    // Create mapping from original paths to Telegraph URLs
    const replacementMap = new Map<string, string>();

    for (const link of processedContent.localLinks) {
      const telegraphUrl = linkMappings.get(link.resolvedPath);
      if (telegraphUrl) {
        replacementMap.set(link.originalPath, telegraphUrl);
        // Update link object
        link.telegraphUrl = telegraphUrl;
        link.isPublished = true;
      }
    }

    // Replace links in content
    const contentWithReplacedLinks = LinkResolver.replaceLocalLinks(
      processedContent.contentWithoutMetadata,
      replacementMap
    );

    return {
      ...processedContent,
      contentWithReplacedLinks,
      hasChanges: replacementMap.size > 0
    };
  }

  /**
   * Prepare content for Telegraph publication
   * @param processedContent Processed content with replaced links
   * @returns Content ready for Telegraph API
   */
  static prepareForPublication(processedContent: ProcessedContent): string {
    return processedContent.contentWithReplacedLinks;
  }

  /**
   * Create content with injected metadata
   * @param processedContent Original processed content
   * @param metadata Metadata to inject
   * @returns Content with metadata injected
   */
  static injectMetadataIntoContent(
    processedContent: ProcessedContent,
    metadata: FileMetadata
  ): string {
    return MetadataManager.injectMetadata(
      processedContent.contentWithoutMetadata,
      metadata
    );
  }

  /**
   * Validate processed content for publication
   * @param processedContent Content to validate
   * @returns Validation result with any issues found
   */
  static validateContent(processedContent: ProcessedContent): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for broken local links
    const brokenLinks = processedContent.localLinks.filter(link =>
      !LinkResolver.validateLinkTarget(link.resolvedPath)
    );

    if (brokenLinks.length > 0) {
      issues.push(`Broken local links found: ${brokenLinks.map(l => l.originalPath).join(', ')}`);
    }

    // Check for unpublished dependencies if replacement is expected
    const unpublishedLinks = processedContent.localLinks.filter(link =>
      !link.isPublished && LinkResolver.isMarkdownFile(link.resolvedPath)
    );

    if (unpublishedLinks.length > 0) {
      issues.push(`Unpublished dependencies: ${unpublishedLinks.map(l => l.originalPath).join(', ')}`);
    }

    // Check content length
    if (processedContent.contentWithReplacedLinks.trim().length === 0) {
      issues.push('Content is empty after processing');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Get content statistics
   * @param processedContent Content to analyze
   * @returns Content statistics
   */
  static getContentStats(processedContent: ProcessedContent): {
    originalLength: number;
    processedLength: number;
    localLinksCount: number;
    markdownLinksCount: number;
    replacedLinksCount: number;
    hasMetadata: boolean;
  } {
    const markdownLinks = LinkResolver.filterMarkdownLinks(processedContent.localLinks);
    const replacedLinks = processedContent.localLinks.filter(link => link.isPublished);

    return {
      originalLength: processedContent.originalContent.length,
      processedLength: processedContent.contentWithReplacedLinks.length,
      localLinksCount: processedContent.localLinks.length,
      markdownLinksCount: markdownLinks.length,
      replacedLinksCount: replacedLinks.length,
      hasMetadata: processedContent.metadata !== null && processedContent.metadata !== undefined
    };
  }

  /**
   * Create a copy of processed content for safe modification
   * @param processedContent Content to clone
   * @returns Deep copy of processed content
   */
  static cloneProcessedContent(processedContent: ProcessedContent): ProcessedContent {
    return {
      originalContent: processedContent.originalContent,
      contentWithoutMetadata: processedContent.contentWithoutMetadata,
      contentWithReplacedLinks: processedContent.contentWithReplacedLinks,
      metadata: processedContent.metadata ? { ...processedContent.metadata } : processedContent.metadata,
      localLinks: processedContent.localLinks.map(link => ({ ...link })),
      hasChanges: processedContent.hasChanges
    };
  }

  /**
   * Extract title from processed content
   * @param processedContent Content to extract title from
   * @returns Extracted title or null
   */
  static extractTitle(processedContent: ProcessedContent): string | null {
    // First check metadata
    if (processedContent.metadata?.title) {
      return processedContent.metadata.title;
    }

    // Then check content for first heading
    const content = processedContent.contentWithoutMetadata;
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;

      // Check for markdown heading
      const headingMatch = trimmed.match(/^(#+)\s*(.*)/);
      if (headingMatch && headingMatch[2]) {
        return headingMatch[2].trim();
      }

      // Check for bold/italic that could be a title
      const boldMatch = trimmed.match(/^(?:\*{2}|__)(.*?)(?:\*{2}|__)$/);
      if (boldMatch && boldMatch[1]) {
        return boldMatch[1].trim();
      }

      // First non-empty line could be title if short enough
      if (trimmed.length <= 100 && !trimmed.includes('\n')) {
        return trimmed;
      }

      break; // Only check first non-empty line
    }

    return null;
  }
}