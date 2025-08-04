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
  
  // Metadata cache for dependency processing
  private metadataCache = new Map<string, {
    status: PublicationStatus;
    metadata: FileMetadata | null;
    timestamp: number;
  }>();
  
  // Hash cache for content hash calculation
  private hashCache = new Map<string, { hash: string; timestamp: number }>();
  private readonly CACHE_TTL = 5000; // 5 seconds

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
   * Get cache manager instance (for cache validation)
   * @returns Cache manager instance or undefined
   */
  getCacheManager(): PagesCacheManager | undefined {
    return this.cacheManager;
  }

  /**
   * Ensure cache manager is initialized (for proactive cache warming)
   * @param filePath File path to use for initialization
   */
  ensureCacheInitialized(filePath: string): void {
    this.initializeCacheManager(filePath);
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
   * Add page to cache after successful publication (Method Signature Evolution pattern)
   * @param filePath Local file path
   * @param url Telegraph URL
   * @param path Telegraph path
   * @param title Page title
   * @param username Author username
   * @param contentHash Content hash for change detection (optional for backward compatibility)
   */
  private addToCache(filePath: string, url: string, path: string, title: string, username: string, contentHash?: string): void {
    if (this.cacheManager) {
      const pageInfo: PublishedPageInfo = {
        telegraphUrl: url,
        editPath: path,
        localFilePath: filePath,
        title: title,
        authorName: username,
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        contentHash: contentHash // Content Hash Integration pattern
      };

      this.cacheManager.addPage(pageInfo);
    }
  }

  /**
   * Calculate content hash with caching
   * @param content Content to hash
   * @returns SHA-256 hash of the content
   */
  private calculateContentHash(content: string): string {
    const cacheKey = content.substring(0, 100); // First 100 chars as key
    const cached = this.hashCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.hash;
    }
    
    const hash = ContentProcessor.calculateContentHash(content);
    this.hashCache.set(cacheKey, { hash, timestamp: Date.now() });
    return hash;
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
      generateAside?: boolean;
      tocTitle?: string;
      tocSeparators?: boolean;
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, forceRepublish = false, dryRun = false, debug = false, generateAside = true, tocTitle = '', tocSeparators = true } = options;

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

      if (isPublished) {
        // File is already published, use edit instead (regardless of force flags)
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

        return await this.editWithMetadata(filePath, username, { withDependencies, dryRun, debug, generateAside, forceRepublish, tocTitle, tocSeparators });
      }

      // Process dependencies if requested
      if (withDependencies) {
        const dependencyResult = await this.publishDependencies(filePath, username, dryRun, generateAside, tocTitle, tocSeparators);
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

      // Validate content with relaxed rules for depth 1 or when dependencies are disabled
      const isDepthOne = this.config.maxDependencyDepth === 1;
      const validation = ContentProcessor.validateContent(processedWithLinks, {
        allowBrokenLinks: isDepthOne,
        allowUnpublishedDependencies: isDepthOne || !withDependencies
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
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication, { generateToc: generateAside, tocTitle, tocSeparators });

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

      // Add to cache after successful publication (Content Hash Integration pattern)
      this.addToCache(filePath, page.url, page.path, metadataTitle, username, contentHash);

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
      generateAside?: boolean;
      tocTitle?: string;
      tocSeparators?: boolean;
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, dryRun = false, debug = false, generateAside = true, forceRepublish = false, tocTitle = '', tocSeparators = true } = options;

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
        const dependencyResult = await this.publishDependencies(filePath, username, dryRun, generateAside, tocTitle, tocSeparators);
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

      // NEW: Content change detection (skip when debug mode is enabled)
      if (!forceRepublish && !debug) {
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

      // Validate content with relaxed rules for depth 1 or when dependencies are disabled
      const isDepthOne = this.config.maxDependencyDepth === 1;
      const validation = ContentProcessor.validateContent(processedWithLinks, {
        allowBrokenLinks: isDepthOne,
        allowUnpublishedDependencies: isDepthOne || !withDependencies
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
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication, { generateToc: generateAside, tocTitle, tocSeparators });

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

      // Update cache after successful edit (Content Hash Integration pattern)
      if (this.cacheManager) {
        this.cacheManager.updatePage(page.url, {
          title: metadataTitle,
          authorName: username,
          lastUpdated: new Date().toISOString(),
          contentHash: updatedContentHash
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
    dryRun: boolean = false,
    generateAside: boolean = true,
    tocTitle: string = '',
    tocSeparators: boolean = true
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

      // Initialize processing state
      const publishedFiles: string[] = [];
      const stats = this.initializeStatsTracking(analysis, filePath);
      
      // Clear metadata cache at start of operation
      this.clearMetadataCache();

      // Show initial progress
      if (stats.totalFiles > 0) {
        ProgressIndicator.showStatus(
          `🔄 Processing ${stats.totalFiles} dependencies...`, 
          "info"
        );
      } else {
        return { success: true, publishedFiles: [] };
      }

      // Process all files with status-based handling
      for (const fileToProcess of analysis.publishOrder) {
        if (fileToProcess === filePath) continue; // Skip root file
        
        try {
          await this.processFileByStatus(fileToProcess, username, dryRun, publishedFiles, stats, generateAside, tocTitle, tocSeparators);
          stats.processedFiles++;
        } catch (error) {
          // Clear cache on error
          this.clearMetadataCache();
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: `Failed to process dependency ${basename(fileToProcess)}: ${errorMessage}`,
            publishedFiles
          };
        }
      }

      // Clear metadata cache after operation
      this.clearMetadataCache();

      // Report final results
      this.reportProcessingResults(stats, dryRun);
      
      return { success: true, publishedFiles };

    } catch (error) {
      // Clear cache on error
      this.clearMetadataCache();
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
   * Initialize statistics tracking for dependency processing
   * @param analysis Dependency analysis results
   * @param rootFilePath Root file path to exclude from count
   * @returns Statistics tracking object
   */
  private initializeStatsTracking(analysis: any, rootFilePath: string) {
    const totalFiles = analysis.publishOrder.filter((file: string) => file !== rootFilePath).length;
    return {
      totalFiles,
      processedFiles: 0,
      backfilledFiles: 0,
      skippedFiles: 0,
      warningFiles: 0,
      unpublishedFiles: 0
    };
  }

  /**
   * Clear metadata cache
   */
  private clearMetadataCache(): void {
    this.metadataCache.clear();
  }

  /**
   * Get cached metadata for a file with smart caching
   * @param filePath File path to get metadata for
   * @returns Cached metadata result
   */
  private getCachedMetadata(filePath: string) {
    const cached = this.metadataCache.get(filePath);
    if (cached && (Date.now() - cached.timestamp) < 5000) { // 5 second TTL
      return cached;
    }
    
    const status = MetadataManager.getPublicationStatus(filePath);
    const metadata = status === PublicationStatus.PUBLISHED 
      ? MetadataManager.getPublicationInfo(filePath) 
      : null;
      
    const result = { status, metadata, timestamp: Date.now() };
    this.metadataCache.set(filePath, result);
    return result;
  }

  /**
   * Process a file based on its publication status
   * @param fileToProcess File path to process
   * @param username Username for publishing
   * @param dryRun Whether to perform dry run
   * @param publishedFiles Array to track published files
   * @param stats Statistics tracking object
   */
  private async processFileByStatus(
    fileToProcess: string,
    username: string,
    dryRun: boolean,
    publishedFiles: string[],
    stats: any,
    generateAside: boolean = true,
    tocTitle: string = '',
    tocSeparators: boolean = true
  ): Promise<void> {
    const { status, metadata } = this.getCachedMetadata(fileToProcess);
    
    switch (status) {
      case PublicationStatus.NOT_PUBLISHED:
        await this.handleUnpublishedFile(fileToProcess, username, dryRun, publishedFiles, stats, generateAside, tocTitle, tocSeparators);
        break;
        
      case PublicationStatus.PUBLISHED:
        await this.handlePublishedFile(fileToProcess, username, dryRun, publishedFiles, stats, metadata, generateAside, tocTitle, tocSeparators);
        break;
        
      case PublicationStatus.METADATA_CORRUPTED:
      case PublicationStatus.METADATA_MISSING:
        await this.handleCorruptedMetadata(fileToProcess, status, stats);
        break;
        
      default:
        this.logUnknownStatus(fileToProcess, status);
        stats.warningFiles++;
    }
  }

  /**
   * Handle unpublished file (existing logic)
   * @param filePath File path to publish
   * @param username Username for publishing
   * @param dryRun Whether to perform dry run
   * @param publishedFiles Array to track published files
   * @param stats Statistics tracking object
   */
  private async handleUnpublishedFile(
    filePath: string,
    username: string,
    dryRun: boolean,
    publishedFiles: string[],
    stats: any,
    generateAside: boolean = true,
    tocTitle: string = '',
    tocSeparators: boolean = true
  ): Promise<void> {
    if (dryRun) {
      ProgressIndicator.showStatus(`🔍 DRY-RUN: Would publish '${basename(filePath)}'`, "info");
    } else {
      ProgressIndicator.showStatus(`📄 Publishing '${basename(filePath)}'...`, "info");
    }

    const result = await this.publishWithMetadata(filePath, username, {
      withDependencies: false, // Avoid infinite recursion
      dryRun,
      generateAside,
      tocTitle,
      tocSeparators
    });

    if (result.success) {
      publishedFiles.push(filePath);
      stats.unpublishedFiles++;
      this.dependencyManager.markAsProcessed(filePath);
    } else {
      throw new Error(`Failed to publish dependency ${filePath}: ${result.error}`);
    }
  }

  /**
   * Handle published file with potential content hash backfilling
   * @param filePath File path to check/update
   * @param username Username for publishing
   * @param dryRun Whether to perform dry run
   * @param publishedFiles Array to track published files
   * @param stats Statistics tracking object
   * @param metadata File metadata
   */
  private async handlePublishedFile(
    filePath: string,
    username: string,
    dryRun: boolean,
    publishedFiles: string[],
    stats: any,
    metadata: FileMetadata | null,
    generateAside: boolean = true,
    tocTitle: string = '',
    tocSeparators: boolean = true
  ): Promise<void> {
    if (metadata && !metadata.contentHash) {
      // File is published but missing contentHash - backfill it
      if (dryRun) {
        ProgressIndicator.showStatus(`🔍 DRY-RUN: Would backfill content hash for '${basename(filePath)}'`, "info");
      } else {
        ProgressIndicator.showStatus(`📝 Updating '${basename(filePath)}' to add content hash...`, "info");
      }
      
      // Force an edit operation to backfill the content hash
      const result = await this.editWithMetadata(filePath, username, {
        withDependencies: false,
        dryRun,
        forceRepublish: true, // Use force to bypass the normal hash check
        generateAside,
        tocTitle: '', // Use no title for dependency updates
        tocSeparators: true
      });

      if (result.success) {
        publishedFiles.push(filePath); // Consider it "published" in this run
        stats.backfilledFiles++;
      } else {
        throw new Error(`Failed to update dependency ${filePath} with hash: ${result.error}`);
      }
    } else {
      // File already has contentHash or metadata is corrupted - skip
      ProgressIndicator.showStatus(`⏭️ Skipping '${basename(filePath)}' (content hash already present)`, "info");
      stats.skippedFiles++;
    }
  }

  /**
   * Handle files with corrupted or missing metadata
   * @param filePath File path with metadata issues
   * @param status Publication status
   * @param stats Statistics tracking object
   */
  private async handleCorruptedMetadata(
    filePath: string,
    status: PublicationStatus,
    stats: any
  ): Promise<void> {
    const statusText = status === PublicationStatus.METADATA_CORRUPTED ? 'corrupted' : 'missing';
    ProgressIndicator.showStatus(
      `⚠️ Skipping '${basename(filePath)}' due to ${statusText} metadata`, 
      "warning"
    );
    stats.warningFiles++;
  }

  /**
   * Log warning for unknown publication status
   * @param filePath File path with unknown status
   * @param status Unknown status
   */
  private logUnknownStatus(filePath: string, status: PublicationStatus): void {
    console.warn(`Unknown publication status '${status}' for file: ${filePath}`);
    ProgressIndicator.showStatus(
      `⚠️ Unknown status for '${basename(filePath)}': ${status}`, 
      "warning"
    );
  }

  /**
   * Report final processing results
   * @param stats Statistics tracking object
   * @param dryRun Whether this was a dry run
   */
  private reportProcessingResults(stats: any, dryRun: boolean): void {
    const { totalFiles, backfilledFiles, skippedFiles, warningFiles, unpublishedFiles } = stats;
    
    if (dryRun) {
      ProgressIndicator.showStatus(
        `🔍 DRY-RUN COMPLETE: ${totalFiles} dependencies analyzed`, 
        "info"
      );
      if (backfilledFiles > 0) {
        ProgressIndicator.showStatus(
          `📝 Would backfill content hash for ${backfilledFiles} dependencies`, 
          "info"
        );
      }
      if (unpublishedFiles > 0) {
        ProgressIndicator.showStatus(
          `📄 Would publish ${unpublishedFiles} new dependencies`, 
          "info"
        );
      }
    } else {
      if (backfilledFiles > 0) {
        ProgressIndicator.showStatus(
          `✅ Successfully backfilled content hash for ${backfilledFiles} dependencies`, 
          "success"
        );
      }
      if (unpublishedFiles > 0) {
        ProgressIndicator.showStatus(
          `✅ Successfully published ${unpublishedFiles} new dependencies`, 
          "success"
        );
      }
      if (skippedFiles > 0) {
        ProgressIndicator.showStatus(
          `⏭️ Skipped ${skippedFiles} dependencies (already have content hash)`, 
          "info"
        );
      }
    }
    
    if (warningFiles > 0) {
      ProgressIndicator.showStatus(
        `⚠️ Completed with ${warningFiles} warnings - check logs for details`, 
        "warning"
      );
    }
  }
}