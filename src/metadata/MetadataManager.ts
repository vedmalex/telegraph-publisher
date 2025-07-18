import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { FileMetadata, PublicationStatus } from "../types/metadata";
import { PublicationStatus as Status } from "../types/metadata";

/**
 * Manages YAML front-matter metadata in markdown files
 */
export class MetadataManager {
  private static readonly FRONTMATTER_DELIMITER = "---";
  private static readonly YAML_INDENT = "  ";

  /**
   * Parse metadata from file content
   * @param content File content with potential YAML front-matter
   * @returns Parsed metadata or null if none found
   */
  static parseMetadata(content: string): FileMetadata | null {
    const lines = content.split(/\r?\n/);

    // Check if file starts with front-matter delimiter
    if (lines.length < 3 || lines[0]?.trim() !== MetadataManager.FRONTMATTER_DELIMITER) {
      return null;
    }

    // Find closing delimiter
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === MetadataManager.FRONTMATTER_DELIMITER) {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex === -1) {
      return null;
    }

    // Extract YAML content
    const yamlLines = lines.slice(1, closingIndex);
    const yamlContent = yamlLines.join('\n');

    try {
      return MetadataManager.parseYamlMetadata(yamlContent);
    } catch (error) {
      console.warn('Failed to parse YAML metadata:', error);
      return null;
    }
  }

  /**
   * Parse YAML metadata content
   * @param yamlContent Raw YAML content
   * @returns Parsed metadata
   */
  private static parseYamlMetadata(yamlContent: string): FileMetadata | null {
    const metadata: Partial<FileMetadata> = {};
    const lines = yamlContent.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');

      switch (key) {
        case 'telegraphUrl':
          metadata.telegraphUrl = value;
          break;
        case 'editPath':
          metadata.editPath = value;
          break;
        case 'username':
          metadata.username = value;
          break;
        case 'publishedAt':
          metadata.publishedAt = value;
          break;
        case 'originalFilename':
          metadata.originalFilename = value;
          break;
        case 'title':
          metadata.title = value;
          break;
        case 'description':
          metadata.description = value;
          break;
      }
    }

    // Validate required fields
    if (metadata.telegraphUrl && metadata.editPath && metadata.username &&
      metadata.publishedAt && metadata.originalFilename) {
      return metadata as FileMetadata;
    }

    return null;
  }

  /**
   * Inject metadata into file content
   * @param content Original file content
   * @param metadata Metadata to inject
   * @returns Content with injected metadata
   */
  static injectMetadata(content: string, metadata: FileMetadata): string {
    const yamlContent = MetadataManager.serializeMetadata(metadata);
    const contentWithoutExistingMetadata = MetadataManager.removeMetadata(content);

    return `${MetadataManager.FRONTMATTER_DELIMITER}\n${yamlContent}\n${MetadataManager.FRONTMATTER_DELIMITER}\n\n${contentWithoutExistingMetadata}`;
  }

  /**
   * Update existing metadata in file content
   * @param content File content with existing metadata
   * @param metadata New metadata to update
   * @returns Content with updated metadata
   */
  static updateMetadata(content: string, metadata: FileMetadata): string {
    return MetadataManager.injectMetadata(content, metadata);
  }

  /**
   * Remove metadata from file content
   * @param content File content with potential metadata
   * @returns Content without metadata
   */
  static removeMetadata(content: string): string {
    const lines = content.split(/\r?\n/);

    // Check if file starts with front-matter delimiter
    if (lines.length < 3 || lines[0]?.trim() !== MetadataManager.FRONTMATTER_DELIMITER) {
      return content;
    }

    // Find closing delimiter
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === MetadataManager.FRONTMATTER_DELIMITER) {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex === -1) {
      return content;
    }

    // Return content after closing delimiter, removing empty lines at start
    const remainingLines = lines.slice(closingIndex + 1);
    while (remainingLines.length > 0 && remainingLines[0]?.trim() === '') {
      remainingLines.shift();
    }

    return remainingLines.join('\n');
  }

  /**
   * Validate metadata integrity
   * @param metadata Metadata to validate
   * @returns True if metadata is valid
   */
  static validateMetadata(metadata: FileMetadata | null): boolean {
    if (!metadata) return false;

    // Check required fields
    if (!metadata.telegraphUrl || !metadata.editPath || !metadata.username ||
      !metadata.publishedAt || !metadata.originalFilename) {
      return false;
    }

    // Validate URL format
    try {
      new URL(metadata.telegraphUrl);
    } catch {
      return false;
    }

    // Validate timestamp format
    if (isNaN(Date.parse(metadata.publishedAt))) {
      return false;
    }

    return true;
  }

  /**
   * Determine publication status of file
   * @param filePath Path to file to check
   * @returns Publication status
   */
  static getPublicationStatus(filePath: string): PublicationStatus {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const metadata = MetadataManager.parseMetadata(content);

      if (!metadata) {
        return Status.NOT_PUBLISHED;
      }

      if (MetadataManager.validateMetadata(metadata)) {
        return Status.PUBLISHED;
      } else {
        return Status.METADATA_CORRUPTED;
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return Status.METADATA_MISSING;
    }
  }

  /**
   * Get publication info from file
   * @param filePath Path to file
   * @returns Metadata if file is published, null otherwise
   */
  static getPublicationInfo(filePath: string): FileMetadata | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return MetadataManager.parseMetadata(content);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Check if file is published
   * @param filePath Path to file to check
   * @returns True if file has valid metadata
   */
  static isPublished(filePath: string): boolean {
    return MetadataManager.getPublicationStatus(filePath) === Status.PUBLISHED;
  }

  /**
   * Create metadata object from publication result
   * @param url Telegraph URL
   * @param path Telegraph path
   * @param username Author username
   * @param filePath Original file path
   * @param title Optional title
   * @param description Optional description
   * @returns Complete metadata object
   */
  static createMetadata(
    url: string,
    path: string,
    username: string,
    filePath: string,
    title?: string,
    description?: string
  ): FileMetadata {
    return {
      telegraphUrl: url,
      editPath: path,
      username,
      publishedAt: new Date().toISOString(),
      originalFilename: basename(filePath),
      title,
      description
    };
  }

  /**
   * Serialize metadata to YAML format
   * @param metadata Metadata to serialize
   * @returns YAML string
   */
  private static serializeMetadata(metadata: FileMetadata): string {
    const lines: string[] = [];

    lines.push(`telegraphUrl: "${metadata.telegraphUrl}"`);
    lines.push(`editPath: "${metadata.editPath}"`);
    lines.push(`username: "${metadata.username}"`);
    lines.push(`publishedAt: "${metadata.publishedAt}"`);
    lines.push(`originalFilename: "${metadata.originalFilename}"`);

    if (metadata.title) {
      lines.push(`title: "${metadata.title}"`);
    }

    if (metadata.description) {
      lines.push(`description: "${metadata.description}"`);
    }

    return lines.join('\n');
  }
}