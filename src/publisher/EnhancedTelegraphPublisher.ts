import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import type { PagesCacheManager } from "../cache/PagesCacheManager";
import { ProgressIndicator } from "../cli/ProgressIndicator";
import { ContentProcessor } from "../content/ContentProcessor";
import { DependencyManager } from "../dependencies/DependencyManager";
import { LinkResolver } from "../links/LinkResolver";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { MetadataManager } from "../metadata/MetadataManager";
import { RateLimiter } from "../ratelimiter/RateLimiter";
import { type TelegraphNode, type TelegraphPage, TelegraphPublisher } from "../telegraphPublisher";
import type {
  FileMetadata,
  MetadataConfig,
  ProcessedContent,
  PublicationProgress,
  PublicationResult,
  PublishedPageInfo
} from "../types/metadata";
import { PublicationStatus } from "../types/metadata";
import { PathResolver } from '../utils/PathResolver';

/**
 * Enhanced Telegraph publisher with metadata management and dependency resolution
 */
export class EnhancedTelegraphPublisher extends TelegraphPublisher {
  private config: MetadataConfig;
  private dependencyManager: DependencyManager;
  private cacheManager?: PagesCacheManager;
  private currentAccessToken?: string;
  private rateLimiter: RateLimiter;
  private baseCacheDirectory?: string;

  constructor(config: MetadataConfig) {
    super();
    this.config = config;
    this.dependencyManager = new DependencyManager(config, PathResolver.getInstance());
    this.rateLimiter = new RateLimiter(config.rateLimiting);
  }

  /**
   * Set base directory for cache files (for bulk operations)
   * @param directory Base directory where cache should be created
   */
  setBaseCacheDirectory(directory: string): void {
    this.baseCacheDirectory = directory;
  }

  /**
   * Set access token and initialize cache manager
   * @param token Access token
   */
  override setAccessToken(token: string): void {
    super.setAccessToken(token);
    this.currentAccessToken = token;
    // Initialize cache manager when access token is set
    // We'll set it up when we know the directory from the first file being processed
  }

  /**
   * Initialize cache manager for the given directory
   * @param filePath Path to file being processed
   */
  private initializeCacheManager(filePath: string): void {
    if (!this.cacheManager && this.currentAccessToken) {
      // Use base cache directory if set (for bulk operations),
      // otherwise use file's directory (for single file operations)
      const directory = this.baseCacheDirectory || dirname(filePath);
      const { PagesCacheManager } = require("../cache/PagesCacheManager");
      this.cacheManager = new PagesCacheManager(directory, this.currentAccessToken);
    }
  }

  /**
   * Add page to cache after successful publication
   * @param filePath Local file path
   * @param url Telegraph URL
   * @param path Telegraph path
   * @param title Page title
   * @param username Author username
   */
  private addToCache(filePath: string, url: string, path: string, title: string, username: string): void {
    if (this.cacheManager) {
      const pageInfo: PublishedPageInfo = {
        telegraphUrl: url,
        editPath: path,
        localFilePath: filePath,
        title: title,
        authorName: username,
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      this.cacheManager.addPage(pageInfo);
    }
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
      debug?: boolean;
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, forceRepublish = false, dryRun = false, debug = false } = options;

      // Initialize cache manager for this directory
      this.initializeCacheManager(filePath);

      // Check if file is already published and handle accordingly
      const publicationStatus = MetadataManager.getPublicationStatus(filePath);
      const existingMetadata = MetadataManager.getPublicationInfo(filePath);

      // Also check cache for existing publication info
      let cacheInfo: PublishedPageInfo | null = null;
      if (this.cacheManager) {
        cacheInfo = this.cacheManager.getPageByLocalPath(filePath);
      }

      // If file has metadata or exists in cache, treat as published (unless forced)
      const isPublished = publicationStatus === PublicationStatus.PUBLISHED || cacheInfo !== null;

      if (isPublished && !forceRepublish) {
        // File is already published, use edit instead
        // If we have cache info but no file metadata, we need to restore metadata to file
        if (cacheInfo && !existingMetadata) {
          console.log(`📋 Found ${filePath} in cache but missing metadata in file, restoring...`);
          
          // Calculate content hash for restored metadata
          const processed = ContentProcessor.processFile(filePath);
          const contentHash = this.calculateContentHash(processed.contentWithoutMetadata);
          
          const restoredMetadata: FileMetadata = {
            telegraphUrl: cacheInfo.telegraphUrl,
            editPath: cacheInfo.editPath,
            username: cacheInfo.authorName,
            publishedAt: cacheInfo.publishedAt,
            originalFilename: cacheInfo.localFilePath ? basename(cacheInfo.localFilePath) : basename(filePath),
            title: cacheInfo.title,
            contentHash
          };

          // Restore metadata to file
          const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, restoredMetadata);
          writeFileSync(filePath, contentWithMetadata, 'utf-8');

          console.log(`✅ Metadata restored to ${filePath} from cache`);
        }

        return await this.editWithMetadata(filePath, username, { withDependencies, dryRun, debug });
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
        ? await this.replaceLinksWithTelegraphUrls(processed)
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

      // Prepare content for publication
      const contentForPublication = ContentProcessor.prepareForPublication(processedWithLinks);
      const title = ContentProcessor.extractTitle(processedWithLinks) || 'Untitled';

      // Convert to Telegraph nodes
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication);

      // Save debug JSON if requested
      if (debug && dryRun) {
        const jsonOutputPath = resolve(filePath.replace(/\.md$/, ".json"));
        try {
          writeFileSync(jsonOutputPath, JSON.stringify(telegraphNodes, null, 2), 'utf-8');
          ProgressIndicator.showStatus(`💾 Debug JSON saved to: ${jsonOutputPath}`, 'info');
        } catch (error) {
          ProgressIndicator.showStatus(`❌ Failed to save debug JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      }

      if (dryRun) {
        return {
          success: true,
          url: `[DRY RUN] Would publish: ${filePath}`,
          path: `[DRY RUN] New page path`,
          isNewPublication: true
        };
      }

      // Create new page
      const page = await this.publishNodes(title, telegraphNodes);

      // Create metadata - preserve original title from metadata if it exists
      const originalTitle = processed.metadata?.title;
      const metadataTitle = originalTitle || title;
      
      // Calculate content hash for new publication
      const contentHash = this.calculateContentHash(processedWithLinks.contentWithoutMetadata);
      
      const metadata = MetadataManager.createMetadata(
        page.url,
        page.path,
        username,
        filePath,
        contentHash,
        metadataTitle
      );

      // Inject metadata into file
      const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, metadata);
      writeFileSync(filePath, contentWithMetadata, 'utf-8');

      // Add to cache after successful publication
      this.addToCache(filePath, page.url, page.path, metadataTitle, username);

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
      debug?: boolean;
      forceRepublish?: boolean;
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, dryRun = false, debug = false } = options;

      // Initialize cache manager for this directory
      this.initializeCacheManager(filePath);

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

      // Process the main file
      const processed = ContentProcessor.processFile(filePath);

      // NEW: Content change detection
      if (!options.forceRepublish) {
        const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);
        
        if (existingMetadata.contentHash && existingMetadata.contentHash === currentHash) {
          ProgressIndicator.showStatus(
            `📄 Content unchanged. Skipping publication of ${basename(filePath)}.`, 
            "info"
          );
          
          return {
            success: true,
            url: existingMetadata.telegraphUrl,
            path: existingMetadata.editPath,
            isNewPublication: false,
            metadata: existingMetadata
          };
        }
      }

      // Replace local links with Telegraph URLs if dependencies were published
      const processedWithLinks = withDependencies
        ? await this.replaceLinksWithTelegraphUrls(processed)
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

      // Prepare content for publication
      const contentForPublication = ContentProcessor.prepareForPublication(processedWithLinks);
      const title = ContentProcessor.extractTitle(processedWithLinks) || existingMetadata.title || 'Untitled';

      // Convert to Telegraph nodes
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication);

      // Save debug JSON if requested
      if (debug && dryRun) {
        const jsonOutputPath = resolve(filePath.replace(/\.md$/, ".json"));
        try {
          writeFileSync(jsonOutputPath, JSON.stringify(telegraphNodes, null, 2), 'utf-8');
          ProgressIndicator.showStatus(`💾 Debug JSON saved to: ${jsonOutputPath}`, 'info');
        } catch (error) {
          ProgressIndicator.showStatus(`❌ Failed to save debug JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      }

      if (dryRun) {
        return {
          success: true,
          url: existingMetadata.telegraphUrl,
          path: existingMetadata.editPath,
          isNewPublication: false,
          metadata: existingMetadata
        };
      }

      // Edit existing page
      const page = await this.editPage(existingMetadata.editPath, title, telegraphNodes, username);

      // Update metadata with new timestamp and content hash - preserve original title from metadata if it exists
      const originalTitle = processed.metadata?.title;
      const metadataTitle = originalTitle || title;
      
      // Calculate updated content hash after successful publication
      const updatedContentHash = this.calculateContentHash(processed.contentWithoutMetadata);
      
      const updatedMetadata: FileMetadata = {
        ...existingMetadata,
        publishedAt: new Date().toISOString(),
        title: metadataTitle,
        contentHash: updatedContentHash
      };

      // Update metadata in file
      const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, updatedMetadata);
      writeFileSync(filePath, contentWithMetadata, 'utf-8');

      // Update cache after successful edit
      if (this.cacheManager) {
        this.cacheManager.updatePage(page.url, {
          title: metadataTitle,
          authorName: username,
          lastUpdated: new Date().toISOString()
        });
      }

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
   * Override publishNodes with rate limiting
   * @param title Page title
   * @param nodes Telegraph nodes
   * @returns Published page
   */
  override async publishNodes(
    title: string,
    nodes: TelegraphNode[],
  ): Promise<TelegraphPage> {
    // Apply rate limiting before API call
    await this.rateLimiter.beforeCall();

    try {
      // Call parent implementation
      const result = await super.publishNodes(title, nodes);

      // Mark successful call
      this.rateLimiter.markSuccessfulCall();

      return result;
    } catch (error) {
      // Check if this is a FLOOD_WAIT error
      if (error instanceof Error && error.message.includes('FLOOD_WAIT_')) {
        const waitMatch = error.message.match(/FLOOD_WAIT_(\d+)/);
        if (waitMatch?.[1]) {
          const waitSeconds = parseInt(waitMatch[1], 10);
          console.warn(`🚦 Rate limited: waiting ${waitSeconds}s before retry...`);

          // Handle FLOOD_WAIT with our rate limiter
          await this.rateLimiter.handleFloodWait(waitSeconds);

          // Retry the call
          return await super.publishNodes(title, nodes);
        }
      }

      // Re-throw non-FLOOD_WAIT errors
      throw error;
    }
  }

  /**
   * Override editPage with rate limiting
   * @param path Page path
   * @param title Page title
   * @param nodes Telegraph nodes
   * @param authorName Author name
   * @param authorUrl Author URL
   * @returns Updated page
   */
  override async editPage(
    path: string,
    title: string,
    nodes: TelegraphNode[],
    authorName?: string,
    authorUrl?: string,
  ): Promise<TelegraphPage> {
    // Apply rate limiting before API call
    await this.rateLimiter.beforeCall();

    try {
      // Call parent implementation
      const result = await super.editPage(path, title, nodes, authorName, authorUrl);

      // Mark successful call
      this.rateLimiter.markSuccessfulCall();

      return result;
    } catch (error) {
      // Check if this is a FLOOD_WAIT error
      if (error instanceof Error && error.message.includes('FLOOD_WAIT_')) {
        const waitMatch = error.message.match(/FLOOD_WAIT_(\d+)/);
        if (waitMatch?.[1]) {
          const waitSeconds = parseInt(waitMatch[1], 10);
          console.warn(`🚦 Rate limited: waiting ${waitSeconds}s before retry...`);

          // Handle FLOOD_WAIT with our rate limiter
          await this.rateLimiter.handleFloodWait(waitSeconds);

          // Retry the call
          return await super.editPage(path, title, nodes, authorName, authorUrl);
        }
      }

      // Re-throw non-FLOOD_WAIT errors
      throw error;
    }
  }

  /**
   * Get rate limiting metrics
   * @returns Current rate limiting metrics
   */
  getRateLimitingMetrics(): string {
    return this.rateLimiter.formatMetrics();
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
    this.dependencyManager = new DependencyManager(this.config, PathResolver.getInstance());

    // Update rate limiter configuration if provided
    if (config.rateLimiting) {
      this.rateLimiter.updateConfig(config.rateLimiting);
    }
  }

  /**
   * Calculates SHA-256 hash of content for change detection.
   * Uses content excluding YAML front-matter for precise change detection.
   * @param content The processed content without metadata
   * @returns Hex-encoded SHA-256 hash
   */
  private calculateContentHash(content: string): string {
    try {
      return createHash('sha256').update(content, 'utf8').digest('hex');
    } catch (error) {
      console.warn('Content hash calculation failed:', error);
      ProgressIndicator.showStatus(
        `⚠️ Content hash calculation failed. Proceeding with publication.`, 
        "warn"
      );
      // Return empty string to trigger publication (fail-safe behavior)
      return '';
    }
  }
}