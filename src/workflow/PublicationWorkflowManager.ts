import { lstatSync, readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { ProgressIndicator } from '../cli/ProgressIndicator';
import { ConfigManager } from '../config/ConfigManager';
import { ContentProcessor } from '../content/ContentProcessor';
import { MetadataManager } from '../metadata/MetadataManager';
import { AutoRepairer } from '../links/AutoRepairer';
import { LinkResolver } from '../links/LinkResolver';
import { LinkScanner } from '../links/LinkScanner';
import { LinkVerifier } from '../links/LinkVerifier';
import { EnhancedTelegraphPublisher } from '../publisher/EnhancedTelegraphPublisher';
import type { MetadataConfig } from '../types/metadata';
import type { BrokenLink, FileScanResult } from '../links/types';
import { PathResolver } from '../utils/PathResolver';

/**
 * Orchestrates the publication workflow, including link verification and auto-repair.
 */
export class PublicationWorkflowManager {
  private config: MetadataConfig;
  private accessToken: string;
  private pathResolver: PathResolver;
  private linkScanner: LinkScanner;
  private linkVerifier: LinkVerifier;
  private linkResolver: LinkResolver;
  private autoRepairer: AutoRepairer;
  private publisher: EnhancedTelegraphPublisher;

  constructor(config: MetadataConfig, accessToken: string) {
    this.config = config;
    this.accessToken = accessToken;
    this.pathResolver = PathResolver.getInstance();
    this.linkScanner = new LinkScanner();
    // LinkVerifier and AutoRepairer will be initialized in publish() with correct projectRoot
    this.linkVerifier = new LinkVerifier(this.pathResolver);
    this.linkResolver = new LinkResolver();
    this.autoRepairer = new AutoRepairer();
    this.publisher = new EnhancedTelegraphPublisher(this.config);
    this.publisher.setAccessToken(this.accessToken);
  }

  /**
   * Initialize and validate caches for all files to process (Pre-warming Cache Strategy pattern)
   * @param filesToProcess Array of file paths to process
   */
  private async initializeAndValidateCaches(filesToProcess: string[]): Promise<void> {
    try {
      ProgressIndicator.showStatus("🔎 Initializing and validating caches...", "info");

      // Note: LinkVerifier and AutoRepairer are already initialized in publish() method
      // We just use the existing instances for cache pre-warming
      
      // Initialize publisher cache manager for the base directory
      // Use the directory where files are located, not project root
      const fileDirectory = filesToProcess.length > 0 ? 
        require('path').dirname(filesToProcess[0]) : 
        process.cwd();
      this.publisher.setBaseCacheDirectory(fileDirectory);
      
      // Proactively initialize pages cache manager (Pre-warming Cache Strategy)
      // This ensures .telegraph-pages-cache.json is created even in dry-run mode
      if (filesToProcess.length > 0) {
        // Initialize cache by calling initializeCacheManager with first file
        // This mimics what publishWithMetadata does but without actual publication
                try {
          const firstFile = filesToProcess[0];
          if (!firstFile) return; // Safety check
          
          // Initialize pages cache manager if not already done
          const existingCache = this.publisher.getCacheManager();
          if (!existingCache) {
            this.publisher.ensureCacheInitialized(firstFile);
          }
          
          // Populate cache with existing page data (Proactive Cache Validation pattern)
          const cacheManager = this.publisher.getCacheManager();
          if (cacheManager) {
            // For now, just populate with the main files
            // TODO: Add dependency collection for comprehensive coverage
            this.populateCacheWithExistingData(filesToProcess, cacheManager);
          }
        } catch (error) {
          // Graceful degradation - continue even if cache initialization fails
          ProgressIndicator.showStatus(`⚠️ Could not initialize pages cache: ${error instanceof Error ? error.message : String(error)}`, "warning");
        }
      }

      for (const filePath of filesToProcess) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const contentWithoutMetadata = MetadataManager.removeMetadata(content);
          const currentHash = ContentProcessor.calculateContentHash(contentWithoutMetadata);

          // 1. Anchor cache validation (Non-Blocking Cache Operations pattern)
          // Use public API to trigger anchor cache warming through link verification
          const scanResult = await this.linkScanner.scanFile(filePath);
          await this.linkVerifier.verifyLinks(scanResult);

          // 2. Page cache validation for change detection  
          // Note: Page cache validation will be handled in the publisher during actual publication
          // This pre-warming step prepares the anchor cache for optimal performance

        } catch (error) {
          // Graceful Degradation pattern - continue processing other files
          ProgressIndicator.showStatus(`⚠️ Could not process cache for ${basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`, "warning");
        }
      }

      ProgressIndicator.showStatus("✅ Cache initialization completed.", "success");
      
    } catch (error) {
      // Non-Blocking Cache Operations pattern - don't fail the entire workflow
      ProgressIndicator.showStatus(`⚠️ Cache initialization failed, continuing: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  }

  

  /**
   * Populate cache with existing page data from file metadata (Proactive Cache Validation pattern)
   * @param filesToProcess List of files to process
   * @param cacheManager Cache manager instance
   */
  private populateCacheWithExistingData(filesToProcess: string[], cacheManager: any): void {
    try {
      ProgressIndicator.showStatus("🔄 Populating cache with existing page data...", "info");
      let pagesProcessed = 0;
      let pagesUpdated = 0;

      for (const filePath of filesToProcess) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const metadata = MetadataManager.parseMetadata(content);
          
          if (metadata && metadata.telegraphUrl && metadata.editPath) {
            const contentWithoutMetadata = MetadataManager.removeMetadata(content);
            const currentHash = ContentProcessor.calculateContentHash(contentWithoutMetadata);
            
            // Check if page exists in cache
            const existingPage = cacheManager.getPageByLocalPath(filePath);
            
            if (existingPage) {
              // Update existing page if content hash changed
              if (existingPage.contentHash !== currentHash) {
                cacheManager.updatePage(metadata.telegraphUrl, {
                  title: metadata.title || basename(filePath, '.md'),
                  authorName: metadata.username || 'Anonymous',
                  lastUpdated: new Date().toISOString(),
                  contentHash: currentHash,
                  localFilePath: filePath
                });
                pagesUpdated++;
                ProgressIndicator.showStatus(`📝 Updated cache for: ${basename(filePath)}`, "info");
              }
            } else {
              // Add new page to cache
              const pageInfo = {
                telegraphUrl: metadata.telegraphUrl,
                editPath: metadata.editPath,
                localFilePath: filePath,
                title: metadata.title || basename(filePath, '.md'),
                authorName: metadata.username || 'Anonymous',
                publishedAt: metadata.publishedAt || new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                contentHash: currentHash
              };
              cacheManager.addPage(pageInfo);
              pagesUpdated++;
              ProgressIndicator.showStatus(`📄 Added to cache: ${basename(filePath)}`, "info");
            }
            pagesProcessed++;
          }
        } catch (error) {
          // Skip files with errors but continue processing others
          ProgressIndicator.showStatus(`⚠️ Could not process ${basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`, "warning");
        }
      }
      
      ProgressIndicator.showStatus(`✅ Cache populated: ${pagesProcessed} files processed, ${pagesUpdated} entries updated`, "success");
    } catch (error) {
      ProgressIndicator.showStatus(`⚠️ Cache population failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  }

  /**
   * Handles the entire publication workflow, including link verification and auto-repair.
   * @param targetPath The file or directory path to process.
   * @param options Command options.
   */
  public async publish(targetPath: string, options: any): Promise<void> {
    // Auto-enable dry-run if debug is specified
    if (options.debug) {
      options.dryRun = true;
    }

    // Initialize LinkVerifier and AutoRepairer with correct project root for anchor caching
    const currentWorkingDir = process.cwd();
    this.linkVerifier = new LinkVerifier(this.pathResolver, currentWorkingDir);
    this.autoRepairer = new AutoRepairer(currentWorkingDir);

    // Шаг 1: Сбор файлов.
    let filesToProcess: string[];

    try {
      const stats = lstatSync(targetPath);
      if (stats.isDirectory()) {
        // If it's a directory, scan for markdown files
        filesToProcess = await this.linkScanner.findMarkdownFiles(targetPath);
      } else {
        // If it's a file, process it directly
        filesToProcess = [targetPath];
      }
    } catch (error) {
      // Check if it's a file system error (can't stat) vs scanner error
      if (error && typeof error === 'object' && 'code' in error) {
        // File system error - assume it's a file
        filesToProcess = [targetPath];
      } else {
        // Scanner error or other error - propagate it
        throw error;
      }
    }

    if (filesToProcess.length === 0) {
      ProgressIndicator.showStatus("No markdown files found to publish.", "info");
      return;
    }

    // PROACTIVE CACHE INITIALIZATION (Pre-warming Cache Strategy pattern)
    await this.initializeAndValidateCaches(filesToProcess);

    let allBrokenLinks: BrokenLink[] = [];

    if (!options.noVerify && !options.force) {
      ProgressIndicator.showStatus("🔎 Verifying local links...", "info");
      let needsReverification = true;

      while (needsReverification) {
        needsReverification = false;
        allBrokenLinks = [];

        for (const file of filesToProcess) {
          const scanResult = await this.linkScanner.scanFile(file);
          const verifiedResult = await this.linkVerifier.verifyLinks(scanResult);
          allBrokenLinks.push(...verifiedResult.brokenLinks);
        }

        if (allBrokenLinks.length > 0 && !options.noAutoRepair) {
          const fixableLinks = (await this.linkResolver.resolveBrokenLinks([{ ...allBrokenLinks[0], brokenLinks: allBrokenLinks } as FileScanResult]))[0]?.brokenLinks.filter(l => l.suggestions.length === 1) || [];

          if (fixableLinks.length > 0) {
            ProgressIndicator.showStatus(`🔧 Attempting to auto-repair ${fixableLinks.length} link(s)...`, "info");
            const repairResult = await this.autoRepairer.autoRepair(targetPath);
            if (repairResult.repairedLinksCount > 0) {
              ProgressIndicator.showStatus(`🔧 Automatically repaired ${repairResult.repairedLinksCount} link(s) in ${repairResult.repairedFilesIn.size} file(s).`, "success");
              needsReverification = true; // Re-verify after repair
            }
          }
        }
      }

      // Шаг 4: Финальная проверка и принятие решения.
      if (allBrokenLinks.length > 0) {
        ProgressIndicator.showStatus(`Publication aborted. Found ${allBrokenLinks.length} broken link(s):`, "error");
        const linksByFile = new Map<string, string[]>();
        for (const broken of allBrokenLinks) {
          if (!linksByFile.has(broken.filePath)) {
            linksByFile.set(broken.filePath, []);
          }
          linksByFile.get(broken.filePath)?.push(`  - "${broken.link.href}" (line ${broken.link.lineNumber})`);
        }
        for (const [file, links] of linksByFile.entries()) {
          console.log(`\n📄 In file: ${file}`);
          links.forEach(link => console.log(link));
        }
        console.log("\n💡 Tip: Run 'telegraph-publisher check-links --apply-fixes' to repair them interactively, or fix them manually.");
        process.exit(1);
      } else {
        ProgressIndicator.showStatus("✅ Link verification passed.", "success");
      }
    } else if (options.force) {
      ProgressIndicator.showStatus("⚠️ Bypassing link verification due to --force flag.", "warning");
      ProgressIndicator.showStatus("🔧 This mode is intended for debugging only.", "warning");
    }

    // Шаг 5: Публикация.
    for (const file of filesToProcess) {
      ProgressIndicator.showStatus(`⚙️ Publishing: ${file}`, "info");
      const result = await this.publisher.publishWithMetadata(file, this.config.defaultUsername || 'Anonymous', {
        withDependencies: options.withDependencies !== false,
        forceRepublish: options.forceRepublish || options.force || false,
        dryRun: options.dryRun || false,
        debug: options.debug || false,
        generateAside: options.aside !== false,
        tocTitle: options.tocTitle || '',
        tocSeparators: options.tocSeparators !== false
      });

      if (result.success) {
        ProgressIndicator.showStatus(`${result.isNewPublication ? "Published" : "Updated"} successfully!`, "success");
        if (result.url) {
          console.log(`🔗 URL: ${result.url}`);
        }
        if (result.path) {
          console.log(`📍 Path: ${result.path}`);
        }
      } else {
        ProgressIndicator.showStatus(`❌ Failed: ${file} - ${result.error}`, "error");
      }
    }
  }
}