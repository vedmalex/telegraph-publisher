import { lstatSync } from 'node:fs';
import { ProgressIndicator } from '../cli/ProgressIndicator';
import { ConfigManager } from '../config/ConfigManager';
import { AutoRepairer } from '../links/AutoRepairer';
import { LinkResolver } from '../links/LinkResolver';
import { LinkScanner } from '../links/LinkScanner';
import { LinkVerifier } from '../links/LinkVerifier';
import { EnhancedTelegraphPublisher } from '../publisher/EnhancedTelegraphPublisher';
import type { BrokenLink, FileScanResult, MetadataConfig } from '../types/metadata';
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
      const result = await this.publisher.publishWithMetadata(file, this.config.defaultUsername, {
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