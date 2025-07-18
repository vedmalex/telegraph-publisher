import { writeFileSync } from "node:fs";
import { ContentProcessor } from "../content/ContentProcessor";
import { DependencyManager } from "../dependencies/DependencyManager";
import { LinkResolver } from "../links/LinkResolver";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { MetadataManager } from "../metadata/MetadataManager";
import { TelegraphPublisher } from "../telegraphPublisher";
import type {
  DependencyNode,
  FileMetadata,
  MetadataConfig,
  ProcessedContent,
  PublicationProgress,
  PublicationResult
} from "../types/metadata";
import { PublicationStatus } from "../types/metadata";

/**
 * Enhanced Telegraph publisher with metadata management and dependency resolution
 */
export class EnhancedTelegraphPublisher extends TelegraphPublisher {
  private config: MetadataConfig;
  private dependencyManager: DependencyManager;

  constructor(config: MetadataConfig) {
    super();
    this.config = config;
    this.dependencyManager = new DependencyManager(config);
  }

  /**
   * Publish file with metadata management and dependency resolution
   * @param filePath Path to file to publish
   * @param username Author username
   * @param options Publishing options
   * @returns Publication result
   */
  async publishWithMetadata(
    filePath: string,
    username: string,
    options: {
      withDependencies?: boolean;
      forceRepublish?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, forceRepublish = false, dryRun = false } = options;

      // Check if file is already published and handle accordingly
      const publicationStatus = MetadataManager.getPublicationStatus(filePath);
      const existingMetadata = MetadataManager.getPublicationInfo(filePath);

      if (publicationStatus === PublicationStatus.PUBLISHED && !forceRepublish) {
        // File is already published, use edit instead
        return await this.editWithMetadata(filePath, username, { withDependencies, dryRun });
      }

      // Process dependencies if requested
      if (withDependencies) {
        const dependencyResult = await this.publishDependencies(filePath, username, dryRun);
        if (!dependencyResult.success) {
          return {
            success: false,
            error: `Failed to publish dependencies: ${dependencyResult.error}`,
            isNewPublication: true
          };
        }
      }

      // Process the main file
      const processed = ContentProcessor.processFile(filePath);

      // Replace local links with Telegraph URLs if dependencies were published
      const processedWithLinks = withDependencies
        ? await this.replaceLinksWithTelegraphUrls(processed, filePath)
        : processed;

      // Validate content with relaxed rules for depth 1
      const isDepthOne = this.config.maxDependencyDepth === 1;
      const validation = ContentProcessor.validateContent(processedWithLinks, {
        allowBrokenLinks: isDepthOne,
        allowUnpublishedDependencies: isDepthOne
      });
      if (!validation.isValid) {
        return {
          success: false,
          error: `Content validation failed: ${validation.issues.join(', ')}`,
          isNewPublication: true
        };
      }

      if (dryRun) {
        return {
          success: true,
          url: `[DRY RUN] Would publish: ${filePath}`,
          path: `[DRY RUN] New page path`,
          isNewPublication: true
        };
      }

      // Prepare content for publication
      const contentForPublication = ContentProcessor.prepareForPublication(processedWithLinks);
      const title = ContentProcessor.extractTitle(processedWithLinks) || 'Untitled';

      // Convert to Telegraph nodes
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication);

      // Create new page
      const page = await this.publishNodes(title, telegraphNodes);

      // Create metadata - preserve original title from metadata if it exists
      const originalTitle = processed.metadata?.title;
      const metadataTitle = originalTitle || title;
      const metadata = MetadataManager.createMetadata(
        page.url,
        page.path,
        username,
        filePath,
        metadataTitle
      );

      // Inject metadata into file
      const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, metadata);
      writeFileSync(filePath, contentWithMetadata, 'utf-8');

      return {
        success: true,
        url: page.url,
        path: page.path,
        isNewPublication: true,
        metadata
      };

    } catch (error) {
      console.error(`Error publishing file ${filePath}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        isNewPublication: true
      };
    }
  }

  /**
   * Edit existing published file with metadata management
   * @param filePath Path to file to edit
   * @param username Author username
   * @param options Edit options
   * @returns Publication result
   */
  async editWithMetadata(
    filePath: string,
    username: string,
    options: {
      withDependencies?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, dryRun = false } = options;

      // Get existing metadata
      const existingMetadata = MetadataManager.getPublicationInfo(filePath);
      if (!existingMetadata) {
        return {
          success: false,
          error: 'File is not published or metadata is corrupted',
          isNewPublication: false
        };
      }

      // Process dependencies if requested
      if (withDependencies) {
        const dependencyResult = await this.publishDependencies(filePath, username, dryRun);
        if (!dependencyResult.success) {
          return {
            success: false,
            error: `Failed to publish dependencies: ${dependencyResult.error}`,
            isNewPublication: false
          };
        }
      }

      // Process the file
      const processed = ContentProcessor.processFile(filePath);

      // Replace local links with Telegraph URLs if dependencies were published
      const processedWithLinks = withDependencies
        ? await this.replaceLinksWithTelegraphUrls(processed, filePath)
        : processed;

      // Validate content with relaxed rules for depth 1
      const isDepthOne = this.config.maxDependencyDepth === 1;
      const validation = ContentProcessor.validateContent(processedWithLinks, {
        allowBrokenLinks: isDepthOne,
        allowUnpublishedDependencies: isDepthOne
      });
      if (!validation.isValid) {
        return {
          success: false,
          error: `Content validation failed: ${validation.issues.join(', ')}`,
          isNewPublication: false
        };
      }

      if (dryRun) {
        return {
          success: true,
          url: existingMetadata.telegraphUrl,
          path: existingMetadata.editPath,
          isNewPublication: false
        };
      }

      // Prepare content for publication
      const contentForPublication = ContentProcessor.prepareForPublication(processedWithLinks);
      const title = ContentProcessor.extractTitle(processedWithLinks) || existingMetadata.title || 'Untitled';

      // Convert to Telegraph nodes
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication);

      // Edit existing page
      const page = await this.editPage(existingMetadata.editPath, title, telegraphNodes, username);

      // Update metadata with new timestamp - preserve original title from metadata if it exists
      const originalTitle = processed.metadata?.title;
      const metadataTitle = originalTitle || title;
      const updatedMetadata: FileMetadata = {
        ...existingMetadata,
        publishedAt: new Date().toISOString(),
        title: metadataTitle
      };

      // Update metadata in file
      const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, updatedMetadata);
      writeFileSync(filePath, contentWithMetadata, 'utf-8');

      return {
        success: true,
        url: page.url,
        path: page.path,
        isNewPublication: false,
        metadata: updatedMetadata
      };

    } catch (error) {
      console.error(`Error editing file ${filePath}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        isNewPublication: false
      };
    }
  }

  /**
   * Publish file dependencies recursively
   * @param filePath Root file path
   * @param username Author username
   * @param dryRun Whether to perform dry run
   * @returns Success status and any errors
   */
  async publishDependencies(
    filePath: string,
    username: string,
    dryRun: boolean = false
  ): Promise<{ success: boolean; error?: string; publishedFiles?: string[] }> {
    try {
      // Build dependency tree
      const dependencyTree = this.dependencyManager.buildDependencyTree(filePath);

      // Analyze dependencies
      const analysis = this.dependencyManager.analyzeDependencyTree(dependencyTree);

      // Check for circular dependencies
      if (analysis.circularDependencies.length > 0) {
        console.warn('Circular dependencies detected:', analysis.circularDependencies);
        // Continue with publishing, but log the warning
      }

      // Get files that need to be published
      const filesToPublish = this.dependencyManager.getFilesToPublish(dependencyTree);

      if (filesToPublish.length === 0) {
        return { success: true, publishedFiles: [] };
      }

      const publishedFiles: string[] = [];

      // Publish files in dependency order
      for (const fileToPublish of analysis.publishOrder) {
        if (filesToPublish.includes(fileToPublish) && fileToPublish !== filePath) {
          const result = await this.publishWithMetadata(fileToPublish, username, {
            withDependencies: false, // Avoid infinite recursion
            dryRun
          });

          if (result.success) {
            publishedFiles.push(fileToPublish);
            this.dependencyManager.markAsProcessed(fileToPublish);
          } else {
            return {
              success: false,
              error: `Failed to publish dependency ${fileToPublish}: ${result.error}`,
              publishedFiles
            };
          }
        }
      }

      return { success: true, publishedFiles };

    } catch (error) {
      console.error(`Error publishing dependencies for ${filePath}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Replace local links in processed content with Telegraph URLs
   * @param processed Processed content
   * @param basePath Base file path for resolving links
   * @returns Content with replaced links
   */
  private async replaceLinksWithTelegraphUrls(
    processed: ProcessedContent,
    basePath: string
  ): Promise<ProcessedContent> {
    const linkMappings = new Map<string, string>();

    // Get unique file paths from local links
    const markdownLinks = LinkResolver.filterMarkdownLinks(processed.localLinks);
    const uniquePaths = LinkResolver.getUniqueFilePaths(markdownLinks);

    // Get Telegraph URLs for published files
    for (const filePath of uniquePaths) {
      const metadata = MetadataManager.getPublicationInfo(filePath);
      if (metadata) {
        linkMappings.set(filePath, metadata.telegraphUrl);
      }
    }

    // Replace links in content
    return ContentProcessor.replaceLinksInContent(processed, linkMappings);
  }

  /**
   * Get publication progress for batch operations
   * @param filePaths Array of file paths to process
   * @returns Publication progress information
   */
  getPublicationProgress(filePaths: string[]): PublicationProgress {
    let processedFiles = 0;
    let successfulPublications = 0;
    let failedPublications = 0;

    for (const filePath of filePaths) {
      if (this.dependencyManager.isProcessed(filePath)) {
        processedFiles++;
        const status = MetadataManager.getPublicationStatus(filePath);
        if (status === PublicationStatus.PUBLISHED) {
          successfulPublications++;
        } else {
          failedPublications++;
        }
      }
    }

    return {
      totalFiles: filePaths.length,
      processedFiles,
      successfulPublications,
      failedPublications,
      progressPercentage: Math.round((processedFiles / filePaths.length) * 100)
    };
  }

  /**
   * Reset dependency manager state
   */
  resetState(): void {
    this.dependencyManager.reset();
  }

  /**
   * Update configuration
   * @param config New configuration
   */
  updateConfig(config: Partial<MetadataConfig>): void {
    this.config = { ...this.config, ...config };
    this.dependencyManager = new DependencyManager(this.config);
  }
}