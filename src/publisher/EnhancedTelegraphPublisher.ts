import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve, join } from "node:path";
import type { PagesCacheManager } from "../cache/PagesCacheManager";
import { PagesCacheManager as PagesCacheManagerClass } from "../cache/PagesCacheManager";
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
import type { PublishDependenciesOptions, PublishDependenciesResult, ValidatedPublishDependenciesOptions } from "../types/publisher";
import { PublishOptionsValidator } from "../types/publisher";
import { OptionsPropagationChain } from "../patterns/OptionsPropagation";
import { ConfigManager } from "../config/ConfigManager";
import { IntelligentRateLimitQueueManager, type QueueDecision } from "./IntelligentRateLimitQueueManager";
import { TokenContextManager } from "./TokenContextManager.js";
import { TokenBackfillManager } from "./TokenBackfillManager.js";

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
  
  // User switching for rate limit handling
  private accountSwitchCounter = 1;
  private switchHistory: Array<{
    timestamp: string;
    originalToken: string;
    newToken: string;
    triggerFile: string;
    reason: string;
  }> = [];

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
      this.cacheManager = new PagesCacheManagerClass(directory, this.currentAccessToken);
    }
  }

  /**
   * Convert absolute file path to relative path from base file
   * @param absolutePath Absolute path of dependency file
   * @param baseFilePath Base file path to calculate relative path from
   * @returns Relative path as it would appear in markdown links
   */
  private convertToRelativePath(absolutePath: string, baseFilePath: string): string {
    const { relative } = require("node:path");
    const baseDir = dirname(baseFilePath);
    return relative(baseDir, absolutePath);
  }

  /**
   * Record link mapping for dependency tracking
   * @param linkMappings Map to record the mapping in
   * @param dependencyPath Absolute path of the dependency file
   * @param baseFilePath Base file path for relative calculation
   * @param telegraphUrl Published Telegraph URL
   */
  private recordLinkMapping(
    linkMappings: Record<string, string>,
    dependencyPath: string,
    baseFilePath: string,
    telegraphUrl: string
  ): void {
    const relativePath = this.convertToRelativePath(dependencyPath, baseFilePath);
    linkMappings[relativePath] = telegraphUrl;
  }

  /**
   * Get effective access token with hierarchical fallback
   * Creative Enhancement: Integrates with TokenContextManager for comprehensive token resolution
   * @param filePath File path for context-aware resolution
   * @param sessionToken Optional session token override
   * @returns Resolved token with source information
   */
  private async getEffectiveAccessToken(
    filePath: string, 
    sessionToken?: string
  ): Promise<{ token: string; source: string; confidence: string }> {
    try {
      // Use TokenContextManager for comprehensive token resolution
      const resolvedToken = await TokenContextManager.getEffectiveAccessTokenWithTracking(
        filePath,
        sessionToken || this.currentAccessToken,
        true // Track operation for analytics
      );
      
      return resolvedToken;
      
    } catch (error) {
      // Fallback to legacy resolution for backward compatibility
      console.warn('⚠️ TokenContextManager failed, using legacy resolution:', error);
      
      // Legacy fallback logic
      if (sessionToken) {
        return { token: sessionToken, source: 'session', confidence: 'medium' };
      }
      
      if (this.currentAccessToken) {
        return { token: this.currentAccessToken, source: 'current', confidence: 'low' };
      }
      
      throw new Error(`No access token available for ${basename(filePath)}. Please configure an access token.`);
    }
  }

  /**
   * Synchronous version for backward compatibility where async is not supported
   * @param filePath File path for resolution
   * @param cacheToken Optional cache token
   * @returns Resolved token with source
   */
  private getEffectiveAccessTokenSync(filePath: string, cacheToken?: string): { token: string; source: 'cache' | 'directory' | 'global' | 'current' } {
    // Cache token wins (highest priority)
    if (cacheToken) {
      return { token: cacheToken, source: 'cache' };
    }

    // Directory-specific token (legacy compatibility)
    const directory = dirname(filePath);
    const directoryToken = ConfigManager.loadAccessToken(directory);
    if (directoryToken) {
      return { token: directoryToken, source: 'directory' };
    }

    // Global config token
    const globalToken = ConfigManager.loadAccessToken('.');
    if (globalToken) {
      return { token: globalToken, source: 'global' };
    }

    // Current session token (fallback)
    if (this.currentAccessToken) {
      return { token: this.currentAccessToken, source: 'current' };
    }

    throw new Error(`No access token available for ${basename(filePath)}. Please configure an access token.`);
  }

  /**
   * Add page to cache after successful publication (Method Signature Evolution pattern)
   * @param filePath Local file path
   * @param url Telegraph URL
   * @param path Telegraph path
   * @param title Page title
   * @param username Author username
   * @param contentHash Content hash for change detection (optional for backward compatibility)
   * @param accessToken Access token used for publication (optional for backward compatibility)
   */
  private addToCache(filePath: string, url: string, path: string, title: string, username: string, contentHash?: string, accessToken?: string): void {
    if (this.cacheManager) {
      const pageInfo: PublishedPageInfo = {
        telegraphUrl: url,
        editPath: path,
        localFilePath: filePath,
        title: title,
        authorName: username,
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        contentHash: contentHash, // Content Hash Integration pattern
        accessToken: accessToken || this.currentAccessToken // Include access token for cache restore
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

      // 🔗 Enhanced Addition: Initialize publishedDependencies collection with preservation logic
      const originalDependencies = existingMetadata?.publishedDependencies || {};
      let publishedDependencies: Record<string, string> = {};

      // Also check cache for existing publication info
      let cacheInfo: PublishedPageInfo | null = null;
      if (this.cacheManager) {
        cacheInfo = this.cacheManager.getPageByLocalPath(filePath);
      }

      // If file has metadata or exists in cache, treat as published (unless forced)
      const isPublished = publicationStatus === PublicationStatus.PUBLISHED || cacheInfo !== null;

      if (isPublished) {
        // File is already published, use edit instead (regardless of force flags)
        
        // 🔗 Enhanced Addition: Initialize publishedDependencies collection for edit mode
        let editPublishedDependencies: Record<string, string> = {};
        
        // If we have cache info but no file metadata, we need to restore metadata to file
        if (cacheInfo && !existingMetadata) {
          console.log(`📋 Found ${filePath} in cache but missing metadata in file, restoring...`);
          
          // Calculate content hash for restored metadata
          const processed = ContentProcessor.processFile(filePath);
          const contentHash = this.calculateContentHash(processed.contentWithoutMetadata);
          
          // Implement Token Context Manager pattern - resolve effective access token
          const tokenResolution = this.getEffectiveAccessTokenSync(filePath, cacheInfo.accessToken);
          
          // Progressive Disclosure Logging pattern
          if (cacheInfo.accessToken) {
            console.log(`🔑 Cache restore: using cached token for ${basename(filePath)}`);
          } else {
            console.log(`🔄 Legacy cache detected for ${basename(filePath)} - using ${tokenResolution.source} token`);
            console.log(`💾 Token backfill: ${tokenResolution.source} → file metadata for future operations`);
          }
          
          const restoredMetadata: FileMetadata = {
            telegraphUrl: cacheInfo.telegraphUrl,
            editPath: cacheInfo.editPath,
            username: cacheInfo.authorName,
            publishedAt: cacheInfo.publishedAt,
            originalFilename: cacheInfo.localFilePath ? basename(cacheInfo.localFilePath) : basename(filePath),
            title: cacheInfo.title,
            contentHash,
            accessToken: tokenResolution.token // Token Backfill Orchestrator pattern
          };

          // Restore metadata to file
          const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, restoredMetadata);
          writeFileSync(filePath, contentWithMetadata, 'utf-8');

          // Enhanced completion logging
          if (cacheInfo.accessToken) {
            console.log(`✅ Metadata restored to ${filePath} from cache`);
          } else {
            console.log(`✅ Metadata restored to ${filePath} from cache`);
            console.log(`✅ Token backfill complete: future edits will use ${tokenResolution.source} token`);
          }
        }

        return await this.editWithMetadata(filePath, username, { withDependencies, dryRun, debug, generateAside, forceRepublish, tocTitle, tocSeparators });
      }

      // Process dependencies if requested
      if (withDependencies) {
        // Use OptionsPropagationChain for clean recursive options
        const recursiveOptions = OptionsPropagationChain.forRecursiveCall(
          PublishOptionsValidator.validate({ 
            dryRun, 
            debug, 
            force: forceRepublish, 
            generateAside, 
            tocTitle, 
            tocSeparators 
          })
        );
        const dependencyResult = await this.publishDependencies(filePath, username, recursiveOptions);
        if (!dependencyResult.success) {
          return {
            success: false,
            error: `Failed to publish dependencies: ${dependencyResult.error}`,
            isNewPublication: true
          };
        }

        // 🔗 Enhanced Addition: Collect linkMappings from dependency publication
        publishedDependencies = dependencyResult.linkMappings || {};
      } else {
        // 🔗 Metadata Preservation: When withDependencies=false, preserve existing dependencies
        publishedDependencies = originalDependencies;
      }

      // Process the main file
      const processed = ContentProcessor.processFile(filePath);

      // Replace local links with Telegraph URLs if configured and if there are links to replace
      // Unified Pipeline: This is no longer dependent on the `withDependencies` recursion flag
      let processedWithLinks = processed;
      if (this.config.replaceLinksinContent && processed.localLinks.length > 0) {
        processedWithLinks = await this.replaceLinksWithTelegraphUrls(processed, undefined, this.cacheManager);
      }

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

      // Create new page with user switching support
      let page: any;
      try {
        page = await this.publishNodes(title, telegraphNodes);
      } catch (error) {
        // Check if this is a FLOOD_WAIT error that can trigger user switching
        if (error instanceof Error && error.message.includes('FLOOD_WAIT_')) {
          console.log(`🔄 FLOOD_WAIT detected for new publication: ${basename(filePath)}`);
          
          // Create new user and switch
          await this.createNewUserAndSwitch(filePath);
          
          // Retry publication with new user
          console.log(`🔄 Retrying publication with new user...`);
          page = await this.publishNodes(title, telegraphNodes);
        } else {
          // Re-throw non-FLOOD_WAIT errors
          throw error;
        }
      }

      // Create metadata - preserve original title from metadata if it exists
      const originalTitle = processed.metadata?.title;
      const metadataTitle = originalTitle || title;
      
      // Calculate content hash for new publication
      const contentHash = this.calculateContentHash(processedWithLinks.contentWithoutMetadata);
      
      // Get the actual token used for publication (may have been switched)
      const actualTokenUsed = this.currentAccessToken;
      
      const metadata = MetadataManager.createMetadata(
        page.url,
        page.path,
        username,
        filePath,
        contentHash,
        metadataTitle,
        undefined, // description
        actualTokenUsed,
        publishedDependencies
      );

      // Inject metadata into file
      const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processed, metadata);
      writeFileSync(filePath, contentWithMetadata, 'utf-8');

      // Add to cache after successful publication (Content Hash Integration pattern)
      this.addToCache(filePath, page.url, page.path, metadataTitle, username, contentHash, actualTokenUsed);

      return {
        success: true,
        url: page.url,
        path: page.path,
        isNewPublication: true,
        metadata
      };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('FLOOD_WAIT_')) {
        // Suppress log for rate limit and let upper layers/queue handle it
        throw error;
      }
      console.error(`Error publishing file ${filePath}:`, error);
      return {
        success: false,
        error: msg,
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

      // Token context management for existing files
      const originalToken = this.currentAccessToken;
      const fileToken = existingMetadata.accessToken;
      
      // If file has its own token, temporarily switch to it
      if (fileToken && fileToken !== this.currentAccessToken) {
        console.log(`🔑 Using file-specific token for editing: ${basename(filePath)}`);
        this.setAccessToken(fileToken);
        this.currentAccessToken = fileToken;
      }

      // 🔗 ENHANCED WORKFLOW: Process dependencies BEFORE change detection
      // 🔗 Metadata Preservation: Initialize with existing dependencies
      let currentLinkMappings: Record<string, string> = existingMetadata.publishedDependencies || {};
      
      if (withDependencies) {
        // Use OptionsPropagationChain for clean recursive options
        const recursiveOptions = OptionsPropagationChain.forRecursiveCall(
          PublishOptionsValidator.validate({ 
            dryRun, 
            debug, 
            force: forceRepublish, 
            generateAside, 
            tocTitle, 
            tocSeparators 
          })
        );
        const dependencyResult = await this.publishDependencies(filePath, username, recursiveOptions);
        if (!dependencyResult.success) {
          return {
            success: false,
            error: `Failed to publish dependencies: ${dependencyResult.error}`,
            isNewPublication: false
          };
        }

        // Capture current link mappings from dependency processing
        currentLinkMappings = dependencyResult.linkMappings || {};
      }

      // Process the main file
      const processed = ContentProcessor.processFile(filePath);

      // Enhanced Change Detection: Dependencies-first, then timestamp and hash
      if (!forceRepublish && !debug) {
        try {
          // 🔗 STAGE 0: Dependency Change Detection (highest priority)
          const dependenciesChanged = !this._areDependencyMapsEqual(
            currentLinkMappings, 
            existingMetadata.publishedDependencies
          );
          
          if (dependenciesChanged) {
            ProgressIndicator.showStatus(
              `🔄 Dependencies changed for ${basename(filePath)}. Forcing republication.`, 
              "info"
            );
            // Dependencies changed - skip timestamp/hash checks and proceed with republication
            // Continue to publication logic below (no return here)
          } else {
            // STAGE 1: Fast timestamp check (primary validation)
            const { statSync } = require("node:fs");
            const currentMtime = statSync(filePath).mtime.toISOString();
            const lastPublishedTime = existingMetadata.publishedAt; // Use publishedAt as reference timestamp
            
            if (currentMtime <= lastPublishedTime) {
              // Timestamps are the same or older, no need to check hash
              ProgressIndicator.showStatus(
                `⚡ Content unchanged (timestamp check). Skipping publication of ${basename(filePath)}.`, 
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
          
          // STAGE 2: Hash check (only if timestamp is newer)
          const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);
          if (existingMetadata.contentHash && existingMetadata.contentHash === currentHash) {
            ProgressIndicator.showStatus(
              `📝 Content timestamp changed, but hash is identical. Skipping publication of ${basename(filePath)}.`, 
              "info"
            );
            // Optional: Update the timestamp in metadata to prevent re-checking next time
            // For now, we will skip this to keep it simple
            return {
              success: true,
              url: existingMetadata.telegraphUrl,
              path: existingMetadata.editPath,
              isNewPublication: false,
              metadata: existingMetadata
            };
          }
          
          // Content has actually changed, proceed with publication
          ProgressIndicator.showStatus(
            `🔄 Content changed (hash verification). Proceeding with publication of ${basename(filePath)}.`, 
            "info"
          );
          
        } catch (timestampError) {
          // Fallback to hash-only validation if timestamp read fails
          ProgressIndicator.showStatus(
            `⚠️ Cannot read file timestamp, falling back to hash validation for ${basename(filePath)}.`, 
            "warning"
          );
          
          const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);
          if (existingMetadata.contentHash && existingMetadata.contentHash === currentHash) {
            ProgressIndicator.showStatus(
              `📄 Content unchanged (hash fallback). Skipping publication of ${basename(filePath)}.`, 
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
      } else if (forceRepublish) {
        // This branch is taken when forceRepublish is true
        ProgressIndicator.showStatus(
          `⚙️ --force flag detected. Forcing republication of ${basename(filePath)}.`, 
          "info"
        );
      }

      // Replace local links with Telegraph URLs if configured and if there are links to replace
      // Unified Pipeline: Apply the same logic as in publishWithMetadata for consistency
      let processedWithLinks = processed;
      if (this.config.replaceLinksinContent && processed.localLinks.length > 0) {
        processedWithLinks = await this.replaceLinksWithTelegraphUrls(processed, currentLinkMappings, this.cacheManager);
      }

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

      // Edit existing page with token context restoration
      let page: any;
      try {
        page = await this.editPage(existingMetadata.editPath, title, telegraphNodes, username);
      } finally {
        // Always restore original token after edit operation
        if (fileToken && originalToken && fileToken !== originalToken) {
          console.log(`🔄 Restoring original session token after edit`);
          this.setAccessToken(originalToken);
          this.currentAccessToken = originalToken;
        }
      }

      // Update metadata with new timestamp and content hash - preserve original title from metadata if it exists
      const originalTitle = processed.metadata?.title;
      const metadataTitle = originalTitle || title;
      
      // Calculate updated content hash after successful publication
      const updatedContentHash = this.calculateContentHash(processed.contentWithoutMetadata);
      
      const updatedMetadata: FileMetadata = {
        ...existingMetadata,
        publishedAt: new Date().toISOString(),
        title: metadataTitle,
        contentHash: updatedContentHash,
        //  Enhanced Addition: Use current link mappings for metadata
        publishedDependencies: currentLinkMappings
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
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('FLOOD_WAIT_')) {
        // Suppress error log for rate-limit and rethrow to be handled by queue manager/final retries
        throw error;
      }
      console.error(`Error editing file ${filePath}:`, error);
      return {
        success: false,
        error: msg,
        isNewPublication: false
      };
    }
  }

  /**
   * Publish file dependencies recursively
   * @param filePath Root file path
   * @param username Author username
   * @param options Publishing options
   * @returns Success status and any errors
   */
  async publishDependencies(
    filePath: string,
    username: string,
    options: PublishDependenciesOptions = {}
  ): Promise<PublishDependenciesResult> {
    try {
      // Validate and normalize options with defaults
      const validatedOptions = PublishOptionsValidator.validate(options);
      const { dryRun, debug, force, generateAside, tocTitle, tocSeparators } = validatedOptions;
      
      // Build dependency tree
      const dependencyTree = this.dependencyManager.buildDependencyTree(filePath);

      // Analyze dependencies
      const analysis = this.dependencyManager.analyzeDependencyTree(dependencyTree);

      // Check for circular dependencies
      if (analysis.circularDependencies.length > 0) {
        // console.warn('Circular dependencies detected:', analysis.circularDependencies);
        // Continue with publishing, but log the warning
      }

      // Initialize processing state
      const publishedFiles: string[] = [];
      const linkMappings: Record<string, string> = {};
      const stats = this.initializeStatsTracking(analysis, filePath);
      // Debug: token-to-files statistics
      const tokenStats: Map<string, string[]> = new Map();
      
      // Clear metadata cache at start of operation
      this.clearMetadataCache();

      // Show initial progress
      if (stats.totalFiles > 0) {
        ProgressIndicator.showStatus(
          `🔄 Processing ${stats.totalFiles} dependencies...`, 
          "info"
        );
      } else {
        return { success: true, publishedFiles: [], linkMappings: {} };
      }

      // 🎯 Enhanced processing with Intelligent Rate Limit Queue Management
      const queueManager = new IntelligentRateLimitQueueManager();
      const processingQueue: string[] = analysis.publishOrder.filter((file: string) => file !== filePath); // Exclude root file
      queueManager.initialize(processingQueue.length);

      let currentIndex = 0;

      while (currentIndex < processingQueue.length) {
        const currentFile = processingQueue[currentIndex];
        if (!currentFile) continue; // Type guard for safety
        
        try {
          // 🔄 Check if this is a retry of postponed file
          if (queueManager.isPostponed(currentFile)) {
            const shouldRetry = queueManager.shouldRetryNow(currentFile);
            if (!shouldRetry) {
              // Still too early - move to next file
              currentIndex++;
              continue;
            }
          }

          // 📄 Process current file with force flag handling
          let result;
          if (validatedOptions.force) {
            // FORCE FLAG PROPAGATION: Handle force explicitly for each dependency
            ProgressIndicator.showStatus(
              `🔄 FORCE: Processing dependency '${basename(currentFile)}' (force propagated)`, 
              "info"
            );
            
            if (debug) {
              const tokenKey = this.currentAccessToken || 'unknown-token';
              const arr = tokenStats.get(tokenKey) || [];
              arr.push(currentFile);
              tokenStats.set(tokenKey, arr);
            }
            
            result = await this.publishWithMetadata(currentFile, username, { 
              ...validatedOptions, 
              forceRepublish: true, 
              withDependencies: false 
            });
          } else {
            // Standard mode: let publishWithMetadata/editWithMetadata handle change detection
            if (debug) {
              const tokenKey = this.currentAccessToken || 'unknown-token';
              const arr = tokenStats.get(tokenKey) || [];
              arr.push(currentFile);
              tokenStats.set(tokenKey, arr);
            }
            const statusResult = await this.processFileByStatus(currentFile, username, publishedFiles, stats, validatedOptions);
            result = { success: true }; // processFileByStatus doesn't return a result, so assume success if no exception
          }
          
          if (result.success) {
            if (validatedOptions.force) {
              // For force mode, add to published files and update stats
              publishedFiles.push(currentFile);
              stats.processedFiles++;
            } else {
              // For standard mode, files are already added in processFileByStatus
              stats.processedFiles++;
            }
            
            // 🔗 Enhanced Addition: Collect link mapping for dependency tracking
            if (this.cacheManager) {
              const telegraphUrl = this.cacheManager.getTelegraphUrl(currentFile);
              if (telegraphUrl) {
                this.recordLinkMapping(linkMappings, currentFile, filePath, telegraphUrl);
              }
            }
            
            // ✅ Success - remove from postponed if it was there
            queueManager.markSuccessful(currentFile);
            currentIndex++;
          } else {
            throw new Error(result.error || 'Unknown error');
          }
          
        } catch (error) {
          // 🚦 Enhanced error handling with intelligent queue management
          if (error instanceof Error && error.message.includes('FLOOD_WAIT_')) {
            const waitMatch = error.message.match(/FLOOD_WAIT_(\d+)/);
            if (waitMatch?.[1]) {
              const waitSeconds = parseInt(waitMatch[1], 10);
              
              // 🎯 Intelligent queue decision
              const decision = await queueManager.handleRateLimit(currentFile, waitSeconds, processingQueue, this.currentAccessToken || '');
              
              if (decision.action === 'postpone') {
                // Continue with next file immediately
                console.log(`⚡ Continuing with next file immediately instead of waiting ${waitSeconds}s`);
                // We re-queued the postponed file to the FRONT; advance index to process the next file
                currentIndex++;
                continue;
              } else {
                // Short wait - handle normally
                console.warn(`🚦 Rate limited: waiting ${waitSeconds}s before retry...`);
                await this.rateLimiter.handleFloodWait(waitSeconds);
                // Retry same file
                continue;
              }
            }
          }
          
          // ❌ Other errors - handle based on original behavior
          const processErrorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Error processing ${basename(currentFile)}:`, processErrorMessage);
          queueManager.markFailed(currentFile, processErrorMessage);
          
          // Clear cache on error and return (original behavior for non-rate-limit errors)
          this.clearMetadataCache();
          return {
            success: false,
            error: `Failed to process dependency ${basename(currentFile)}: ${processErrorMessage}`,
            publishedFiles
          };
        }
      }

      // 📊 Process final retries for any remaining postponed files
      const finalRetryFunction = async (retryFilePath: string): Promise<PublicationResult> => {
        if (validatedOptions.force) {
          if (debug) {
            const tokenKey = this.currentAccessToken || 'unknown-token';
            const arr = tokenStats.get(tokenKey) || [];
            arr.push(retryFilePath);
            tokenStats.set(tokenKey, arr);
          }
          const result = await this.publishWithMetadata(retryFilePath, username, { 
            ...validatedOptions, 
            forceRepublish: true, 
            withDependencies: false 
          });
          
          // Track successful final retry for force mode
          if (result.success) {
            publishedFiles.push(retryFilePath);
            stats.processedFiles++;
          }
          // If rate-limited surfaced as error string, rethrow to let queue reschedule
          if (!result.success && result.error && result.error.includes('FLOOD_WAIT_')) {
            throw new Error(result.error);
          }
          
          return result;
        } else {
          // For standard mode, wrap processFileByStatus to return a PublicationResult
          try {
            if (debug) {
              const tokenKey = this.currentAccessToken || 'unknown-token';
              const arr = tokenStats.get(tokenKey) || [];
              arr.push(retryFilePath);
              tokenStats.set(tokenKey, arr);
            }
            await this.processFileByStatus(retryFilePath, username, publishedFiles, stats, validatedOptions);
            return { 
              success: true, 
              isNewPublication: false, // Assume it's a retry of existing publication
              url: ''
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes('FLOOD_WAIT_')) {
              // Propagate FLOOD_WAIT to queue manager final retries
              throw new Error(msg);
            }
            return {
              success: false,
              isNewPublication: false,
              error: msg
            };
          }
        }
      };

      const finalResults = await queueManager.processFinalRetries(finalRetryFunction, () => this.currentAccessToken || '');
      // Debug: write token stats if enabled
      if (debug && tokenStats.size > 0) {
        try {
          const obj: Record<string, string[]> = {};
          for (const [token, files] of tokenStats.entries()) {
            obj[token] = files;
          }
          const outPath = join(process.cwd(), 'telegraph-token-stats.json');
          writeFileSync(outPath, JSON.stringify(obj, null, 2), 'utf-8');
          ProgressIndicator.showStatus(`🧾 Token stats saved: ${outPath}`, 'info');
        } catch {
          // ignore
        }
      }
      
      // Final retries are already tracked in the finalRetryFunction above
      console.log(`📊 Final retries completed: ${finalResults.filter(r => r.success).length}/${finalResults.length} successful`);

      // Clear metadata cache after operation
      this.clearMetadataCache();

      // Report final results with queue statistics
      this.reportProcessingResults(stats, dryRun);
      
      const queueStats = queueManager.getStats();
      if (queueStats.postponed > 0 || finalResults.length > 0) {
        console.log(`📊 Queue Summary: ${queueStats.processed}/${queueStats.total} processed, ${queueStats.postponed} files had rate limits`);
        const postponedSummary = queueManager.getPostponedSummary();
        if (postponedSummary.length > 0) {
          console.log(`🔄 Postponed files handled: ${postponedSummary.join(', ')}`);
        }
      }
      
      return { success: true, publishedFiles, linkMappings };

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
   * Replace local links with Telegraph URLs using provided mappings or cache
   * @param processed Processed content with local links
   * @param linkMappings Optional pre-built link mappings to use
   * @param cacheManager Optional cache manager for fallback lookup
   * @returns Processed content with replaced links
   */
  private async replaceLinksWithTelegraphUrls(
    processed: ProcessedContent,
    linkMappings?: Record<string, string>,
    cacheManager?: PagesCacheManager,
  ): Promise<ProcessedContent> {
    // Early return if no cache manager and no pre-built mappings
    if (!cacheManager && !linkMappings) {
      return processed;
    }

    let finalLinkMappings: Map<string, string>;

    // Use provided linkMappings if available, otherwise build from cache
    if (linkMappings && Object.keys(linkMappings).length > 0) {
      finalLinkMappings = new Map(Object.entries(linkMappings));
    } else if (cacheManager) {
      // Fallback to cache-based lookup (existing behavior)
      const cacheLinkMappings = new Map<string, string>();
      
      for (const link of processed.localLinks) {
        // Use the resolved absolute path as the key for cache lookup
        const telegraphUrl = cacheManager.getTelegraphUrl(link.resolvedPath);
        
        if (telegraphUrl) {
          // Use the original relative path as the key for replacement
          cacheLinkMappings.set(link.originalPath, telegraphUrl);
        }
      }
      
      finalLinkMappings = cacheLinkMappings;
    } else {
      // No mappings and no cache, return unchanged
      return processed;
    }

    // Replace links in content
    return ContentProcessor.replaceLinksInContent(processed, finalLinkMappings);
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
          
          // Smart FLOOD_WAIT Decision: Re-throw long waits for user switching layer
          const SWITCH_THRESHOLD = 30; // seconds - matches CREATIVE design
          if (waitSeconds > SWITCH_THRESHOLD) {
            console.log(`🔄 FLOOD_WAIT ${waitSeconds}s > ${SWITCH_THRESHOLD}s threshold - delegating to user switching layer`);
            throw error; // Let publishWithMetadata handle this with user switching
          }
          
          console.warn(`🚦 Rate limited: waiting ${waitSeconds}s before retry...`);

          // Handle FLOOD_WAIT with our rate limiter for short waits
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

    // Build payload mirroring base implementation
    const payload: Record<string, unknown> = {
      access_token: this.currentAccessToken,
      path,
      title,
      content: JSON.stringify(nodes),
      return_content: false,
    };
    if (authorName) payload.author_name = authorName;
    if (authorUrl) payload.author_url = authorUrl;

    // Perform request directly to avoid base-class internal waiting
    const response = await fetch(`https://api.telegra.ph/editPage/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as { ok: boolean; result?: TelegraphPage; error?: string };

    if (!data.ok) {
      if (data.error && data.error.startsWith('FLOOD_WAIT_')) {
        const waitSeconds = parseInt(data.error.split('_')[2] || '5', 10);
        const SWITCH_THRESHOLD = 30; // seconds
        if (waitSeconds > SWITCH_THRESHOLD) {
          // Delegate long waits to upper layers (queue manager / user switching)
          throw new Error(`FLOOD_WAIT_${waitSeconds}`);
        }
        // Short wait: handle locally via rate limiter and retry
        await this.rateLimiter.handleFloodWait(waitSeconds);
        return this.editPage(path, title, nodes, authorName, authorUrl);
      }
      throw new Error(`Telegraph API error: ${data.error}`);
    }

    // Mark successful call
    this.rateLimiter.markSuccessfulCall();

    if (!data.result) {
      throw new Error('Telegraph API returned empty result');
    }

    return data.result;
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
    publishedFiles: string[],
    stats: any,
    options: ValidatedPublishDependenciesOptions
  ): Promise<void> {
    const { status, metadata } = this.getCachedMetadata(fileToProcess);
    
    switch (status) {
      case PublicationStatus.NOT_PUBLISHED:
        await this.handleUnpublishedFile(fileToProcess, username, publishedFiles, stats, options);
        break;
        
      case PublicationStatus.PUBLISHED:
        await this.handlePublishedFile(fileToProcess, username, publishedFiles, stats, metadata, options);
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
    publishedFiles: string[],
    stats: any,
    options: ValidatedPublishDependenciesOptions
  ): Promise<void> {
    const { dryRun, debug, force, generateAside, tocTitle, tocSeparators } = options;
    
    if (dryRun) {
      ProgressIndicator.showStatus(`🔍 DRY-RUN: Would publish '${basename(filePath)}'`, "info");
    } else {
      ProgressIndicator.showStatus(`📄 Publishing '${basename(filePath)}'...`, "info");
    }

    // Use OptionsPropagationChain for clean recursive options
    const recursiveOptions = OptionsPropagationChain.forRecursiveCall(options, {
      // Override for recursion: disable dependencies to avoid infinite recursion
    });
    
    const result = await this.publishWithMetadata(filePath, username, {
      withDependencies: false, // Avoid infinite recursion
      dryRun: recursiveOptions.dryRun,
      debug: recursiveOptions.debug,
      forceRepublish: recursiveOptions.force,
      generateAside: recursiveOptions.generateAside,
      tocTitle: recursiveOptions.tocTitle,
      tocSeparators: recursiveOptions.tocSeparators
    });

    if (result.success) {
      publishedFiles.push(filePath);
      stats.unpublishedFiles++;
      // markAsProcessed removed - deprecated with memoization approach
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
    publishedFiles: string[],
    stats: any,
    metadata: FileMetadata | null,
    options: ValidatedPublishDependenciesOptions
  ): Promise<void> {
    const { dryRun, debug, force, generateAside, tocTitle, tocSeparators } = options;
    
    if (metadata && !metadata.contentHash) {
      // File is published but missing contentHash - backfill it
      if (dryRun) {
        ProgressIndicator.showStatus(`🔍 DRY-RUN: Would backfill content hash for '${basename(filePath)}'`, "info");
      } else {
        ProgressIndicator.showStatus(`📝 Updating '${basename(filePath)}' to add content hash...`, "info");
      }
      
      // Use OptionsPropagationChain for clean recursive options
      const recursiveOptions = OptionsPropagationChain.forRecursiveCall(options, {
        // Override for backfill operation: empty title and force enable
        tocTitle: '', // Use no title for dependency updates
        tocSeparators: true
      });
      
      // Force an edit operation to backfill the content hash
      const result = await this.editWithMetadata(filePath, username, {
        withDependencies: false,
        dryRun: recursiveOptions.dryRun,
        debug: recursiveOptions.debug,
        forceRepublish: recursiveOptions.force, // Use actual force flag from user options
        generateAside: recursiveOptions.generateAside,
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

  /**
   * Create new Telegraph user and switch to it for rate limit recovery
   * @param triggerFile File that triggered the user switch
   * @returns New Telegraph account information
   */
  private async createNewUserAndSwitch(triggerFile: string): Promise<void> {
    try {
      // Ensure we have a current access token
      if (!this.currentAccessToken) {
        throw new Error('No access token available for user switching');
      }
      
      // Get current account info for preserving author details
      const currentAccount = await this.getAccountInfo(this.currentAccessToken);
      
      // Increment counter for unique name generation
      this.accountSwitchCounter++;
      
      // Generate unique short name
      const newShortName = `${currentAccount.short_name}-${this.accountSwitchCounter}`;
      
      console.log(`🔄 Rate limit encountered. Creating new Telegraph user: ${newShortName}`);
      console.log(`   Trigger file: ${basename(triggerFile)}`);
      console.log(`   Original user: ${currentAccount.short_name}`);
      
      // Store original token for history
      const originalToken = this.currentAccessToken;
      
      // Create new account (automatically sets this.accessToken in base class)
      const newAccount = await this.createAccount(
        newShortName,
        currentAccount.author_name,
        currentAccount.author_url
      );
      
      // Update our tracking token
      this.currentAccessToken = newAccount.access_token;
      
      // Record the switch in history
      this.switchHistory.push({
        timestamp: new Date().toISOString(),
        originalToken,
        newToken: newAccount.access_token,
        triggerFile,
        reason: 'FLOOD_WAIT'
      });
      
      console.log(`✅ Successfully switched to new Telegraph user: ${newShortName}`);
      console.log(`   New token: ${newAccount.access_token.substring(0, 10)}...`);
      
    } catch (error) {
      console.error(`❌ Failed to create new Telegraph user:`, error);
      throw new Error(`User switching failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }



  /**
   * Compare two dependency maps for equality
   * @param mapA First dependency map
   * @param mapB Second dependency map
   * @returns True if maps are equal, false otherwise
   */
  private _areDependencyMapsEqual(
    mapA?: Record<string, string>, 
    mapB?: Record<string, string>
  ): boolean {
    // Handle null/undefined cases
    const isMapAEmpty = !mapA || Object.keys(mapA).length === 0;
    const isMapBEmpty = !mapB || Object.keys(mapB).length === 0;
    
    // Both empty/undefined - consider equal
    if (isMapAEmpty && isMapBEmpty) {
      return true;
    }
    
    // One empty, one not - not equal
    if (isMapAEmpty !== isMapBEmpty) {
      return false;
    }
    
    // Both maps exist and are non-empty - compare contents
    const keysA = Object.keys(mapA!);
    const keysB = Object.keys(mapB!);
    
    // Different number of keys - not equal
    if (keysA.length !== keysB.length) {
      return false;
    }
    
    // Check each key-value pair
    for (const key of keysA) {
      if (!(key in mapB!) || mapA![key] !== mapB![key]) {
        return false;
      }
    }
    
    return true;
  }
}