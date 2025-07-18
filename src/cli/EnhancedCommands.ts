import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { PagesCacheManager } from "../cache/PagesCacheManager";
import { ConfigManager } from "../config/ConfigManager";
import { ContentProcessor } from "../content/ContentProcessor";
import { DependencyManager } from "../dependencies/DependencyManager";
import { BidirectionalLinkResolver } from "../links/BidirectionalLinkResolver";
import { LinkResolver } from "../links/LinkResolver";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { MetadataManager } from "../metadata/MetadataManager";
import { EnhancedTelegraphPublisher } from "../publisher/EnhancedTelegraphPublisher";
import { TelegraphPublisher } from "../telegraphPublisher";
import { type FileMetadata, PublicationStatus, type TelegraphLink } from "../types/metadata";
import { ProgressIndicator } from "./ProgressIndicator";

/**
 * Enhanced CLI commands with metadata management
 */
export class EnhancedCommands {

  /**
   * Add unified publish command (combines pub and edit functionality)
   * @param program Commander program instance
   */
  static addPublishCommand(program: Command): void {
    program
      .command("publish")
      .alias("pub")
      .description("Unified publish/edit command: creates, publishes, or updates Markdown files (if no file specified, publishes entire directory)")
      .option("-f, --file <path>", "Path to the Markdown file (optional - if not specified, publishes current directory)")
      .option("-a, --author <name>", "Author's name (overrides config default)")
      .option("--title <title>", "Title of the article (optional, will be extracted from file if not provided)")
      .option("--author-url <url>", "Author's URL (optional)")
      .option("--with-dependencies", "Automatically publish linked local files (default: true)")
      .option("--no-with-dependencies", "Skip automatic dependency publishing")
      .option("--force-republish", "Force republish even if file is already published")
      .option("--dry-run", "Preview operations without making changes")
      .option("--token <token>", "Access token (optional, will try to load from config)")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleUnifiedPublishCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Add dependency analysis command
   * @param program Commander program instance
   */
  static addAnalyzeCommand(program: Command): void {
    program
      .command("analyze")
      .description("Analyze file dependencies and publication status")
      .option("-f, --file <path>", "Path to the Markdown file to analyze")
      .option("--depth <number>", "Maximum dependency depth to analyze", "1")
      .option("--show-tree", "Show dependency tree visualization")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleAnalyzeCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Add configuration management command
   * @param program Commander program instance
   */
  static addConfigCommand(program: Command): void {
    program
      .command("config")
      .description("Manage configuration settings")
      .option("--show", "Show current configuration")
      .option("--set <key=value>", "Set configuration value", [])
      .option("--reset", "Reset configuration to defaults")
      .option("--username <name>", "Set default username")
      .option("--max-depth <number>", "Set maximum dependency depth")
      .option("--auto-deps <boolean>", "Enable/disable automatic dependency publishing")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleConfigCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Configuration failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Add status command
   * @param program Commander program instance
   */
  static addStatusCommand(program: Command): void {
    program
      .command("status")
      .description("Show publication status of files")
      .option("-f, --file <path>", "Check specific file")
      .option("-d, --directory <path>", "Check all markdown files in directory")
      .option("--recursive", "Check subdirectories recursively")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleStatusCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Handle unified publish command (combines pub and edit functionality)
   * @param options Command options
   */
  static async handleUnifiedPublishCommand(options: any): Promise<void> {
    // If no file specified, publish current directory
    if (!options.file) {
      await EnhancedCommands.handleDirectoryPublish(options);
      return;
    }

    const filePath = resolve(options.file);
    const fileDirectory = dirname(filePath);

    // Check if file exists, if not create it (edit functionality)
    if (!existsSync(filePath)) {
      ProgressIndicator.showStatus("File not found. Creating new file...", "info");

      // Create basic file with title if provided
      const initialContent = options.title
        ? `# ${options.title}\n\nContent goes here...`
        : `# New Article\n\nContent goes here...`;
      writeFileSync(filePath, initialContent);
      ProgressIndicator.showStatus(`Created new file: ${filePath}`, "success");
    }

    // Load configuration
    const config = ConfigManager.getMetadataConfig(fileDirectory);
    const accessToken = options.token || ConfigManager.loadAccessToken(fileDirectory);

    if (!accessToken) {
      throw new Error("Access token is required. Set it using --token or configure it with 'config' command");
    }

    // Get username
    const username = options.author || config.defaultUsername;
    if (!username) {
      throw new Error("Author name is required. Provide it using --author or set default in config");
    }

    // Create enhanced publisher
    const publisher = new EnhancedTelegraphPublisher(config);
    publisher.setAccessToken(accessToken);

    // Show initial status
    const status = MetadataManager.getPublicationStatus(filePath);
    if (options.verbose) {
      ProgressIndicator.showStatus(`File status: ${status}`, "info");
    }

    // Publish/Edit with progress tracking
    const spinner = ProgressIndicator.createSpinner("Processing file with enhanced workflow");
    spinner.start();

    try {
      const result = await publisher.publishWithMetadata(filePath, username, {
        withDependencies: options.withDependencies !== false,
        forceRepublish: options.forceRepublish,
        dryRun: options.dryRun
      });

      spinner.stop();

      if (result.success) {
        ProgressIndicator.showStatus(
          `${result.isNewPublication ? "Published" : "Updated"} successfully!`,
          "success"
        );

        // Save access token if it was provided
        if (options.token) {
          ConfigManager.saveAccessToken(fileDirectory, options.token);
        }

        // Display results
        if (result.metadata?.title) {
          console.log(`📄 Title: ${result.metadata.title}`);
        }
        if (result.url) {
          console.log(`🔗 URL: ${result.url}`);
        }
        if (result.path) {
          console.log(`📍 Path: ${result.path}`);
        }
        if (result.metadata?.username) {
          console.log(`👤 Author: ${result.metadata.username}`);
        }
        if (result.metadata?.publishedAt) {
          console.log(`📅 Published: ${result.metadata.publishedAt}`);
        }
        console.log(`📝 File: ${filePath}`);

        // Handle title and authorUrl if provided in options
        if (options.title && result.metadata && result.metadata.title !== options.title) {
          ProgressIndicator.showStatus("Note: Title was extracted from content, not from --title parameter", "info");
        }
      } else {
        throw new Error(result.error || "Unknown operation error");
      }
    } catch (error) {
      spinner.stop("❌ Publication failed");
      throw error;
    }
  }

  /**
   * Handle dependency analysis command
   * @param options Command options
   */
  private static async handleAnalyzeCommand(options: any): Promise<void> {
    if (!options.file) {
      throw new Error("File path must be specified using --file");
    }

    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const config = ConfigManager.getMetadataConfig(dirname(filePath));
    config.maxDependencyDepth = parseInt(options.depth) || config.maxDependencyDepth;

    const dependencyManager = new DependencyManager(config);

    ProgressIndicator.showStatus("Analyzing dependencies...", "info");

    const dependencyTree = dependencyManager.buildDependencyTree(filePath);
    const analysis = dependencyManager.analyzeDependencyTree(dependencyTree);

    console.log("\n📊 Dependency Analysis Results:");
    console.log("================================");
    console.log(`📁 Total files: ${analysis.totalFiles}`);
    console.log(`✅ Published files: ${analysis.publishedFiles}`);
    console.log(`📝 Unpublished files: ${analysis.unpublishedFiles}`);
    console.log(`📏 Maximum depth: ${analysis.maxDepth}`);

    if (analysis.circularDependencies.length > 0) {
      ProgressIndicator.showStatus("Circular dependencies detected!", "warning");
      analysis.circularDependencies.forEach((cycle, index) => {
        console.log(`  ${index + 1}. ${cycle.join(" → ")}`);
      });
    }

    if (analysis.unpublishedFiles > 0) {
      const filesToPublish = dependencyManager.getFilesToPublish(dependencyTree);
      ProgressIndicator.showList("Files that need publishing", filesToPublish);

      if (analysis.publishOrder.length > 0) {
        ProgressIndicator.showList("Recommended publishing order", analysis.publishOrder, true);
      }
    }

    if (options.showTree) {
      console.log("\n🌳 Dependency Tree:");
      EnhancedCommands.printDependencyTree(dependencyTree, "", true);
    }
  }

  /**
   * Handle configuration command
   * @param options Command options
   */
  private static async handleConfigCommand(options: any): Promise<void> {
    const directory = process.cwd();

    if (options.show) {
      ConfigManager.displayConfig(directory);
      return;
    }

    if (options.reset) {
      ConfigManager.resetConfig(directory);
      return;
    }

    // Handle individual settings
    const updates: any = {};

    if (options.username) {
      updates.defaultUsername = options.username;
    }

    if (options.maxDepth) {
      const depth = parseInt(options.maxDepth);
      if (isNaN(depth) || depth < 1 || depth > 20) {
        throw new Error("Max depth must be a number between 1 and 20");
      }
      updates.maxDependencyDepth = depth;
    }

    if (options.autoDeps !== undefined) {
      updates.autoPublishDependencies = options.autoDeps === "true";
    }

    if (Object.keys(updates).length > 0) {
      ConfigManager.updateMetadataConfig(directory, updates);
      ProgressIndicator.showStatus("Configuration updated successfully", "success");
    } else {
      ConfigManager.displayConfig(directory);
    }
  }

  /**
   * Handle status command
   * @param options Command options
   */
  private static async handleStatusCommand(options: any): Promise<void> {
    if (options.file) {
      const filePath = resolve(options.file);
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const status = MetadataManager.getPublicationStatus(filePath);
      const metadata = MetadataManager.getPublicationInfo(filePath);

      console.log(`\n📄 File: ${filePath}`);
      console.log(`📊 Status: ${status}`);

      if (metadata) {
        console.log(`🔗 URL: ${metadata.telegraphUrl}`);
        console.log(`👤 Author: ${metadata.username}`);
        console.log(`📅 Published: ${metadata.publishedAt}`);
      }
    } else {
      ProgressIndicator.showStatus("Directory status checking not implemented yet", "warning");
    }
  }

  /**
   * Print dependency tree visualization
   * @param node Dependency node
   * @param prefix Tree prefix
   * @param isLast Whether this is the last node
   */
  private static printDependencyTree(node: any, prefix: string = "", isLast: boolean = true): void {
    const status = node.status === PublicationStatus.PUBLISHED ? "✅" : "📝";
    const connector = isLast ? "└── " : "├── ";
    console.log(`${prefix}${connector}${status} ${node.filePath}`);

    if (node.dependencies && node.dependencies.length > 0) {
      const newPrefix = prefix + (isLast ? "    " : "│   ");
      node.dependencies.forEach((dep: any, index: number) => {
        const isLastDep = index === node.dependencies.length - 1;
        EnhancedCommands.printDependencyTree(dep, newPrefix, isLastDep);
      });
    }
  }



  /**
   * Handle directory publishing - publish all markdown files in current directory and subdirectories
   * @param options Command line options
   */
  static async handleDirectoryPublish(options: any): Promise<void> {
    const currentDir = process.cwd();

    ProgressIndicator.showStatus("🔄 Publishing directory with enhanced workflow...", "info");
    ProgressIndicator.showStatus(`📁 Processing directory: ${currentDir}`, "info");

    // Load configuration
    const config = ConfigManager.getMetadataConfig(currentDir);
    const accessToken = options.token || ConfigManager.loadAccessToken(currentDir);

    if (!accessToken) {
      throw new Error("Access token is required. Set it using --token or configure it with 'config' command");
    }

    // Get username
    const username = options.author || config.defaultUsername;
    if (!username) {
      throw new Error("Author name is required. Provide it using --author or set default in config");
    }

    // Find all markdown files recursively
    const markdownFiles = await EnhancedCommands.findMarkdownFiles(currentDir);

    if (markdownFiles.length === 0) {
      ProgressIndicator.showStatus("📝 No markdown files found in current directory", "info");
      return;
    }

    ProgressIndicator.showStatus(`📋 Found ${markdownFiles.length} markdown files`, "info");

    // Create enhanced publisher
    const publisher = new EnhancedTelegraphPublisher(config);
    publisher.setAccessToken(accessToken);

    const results: Array<{ file: string, success: boolean, url?: string, error?: string }> = [];

    // Process each file
    for (const filePath of markdownFiles) {
      try {
        ProgressIndicator.showStatus(`⚙️ Processing: ${filePath}`, "info");

        const result = await publisher.publishWithMetadata(filePath, username, {
          withDependencies: options.withDependencies !== false,
          forceRepublish: options.forceRepublish || false,
          dryRun: options.dryRun || false
        });

        if (result.success) {
          results.push({
            file: filePath,
            success: true,
            url: result.url
          });

          const status = result.isNewPublication ? "📄 Published" : "✏️ Updated";
          ProgressIndicator.showStatus(`${status}: ${filePath}`, "success");
          if (result.url) {
            console.log(`🔗 URL: ${result.url}`);
          }
        } else {
          results.push({
            file: filePath,
            success: false,
            error: result.error
          });
          ProgressIndicator.showStatus(`❌ Failed: ${filePath} - ${result.error}`, "error");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          file: filePath,
          success: false,
          error: errorMessage
        });
        ProgressIndicator.showStatus(`❌ Error: ${filePath} - ${errorMessage}`, "error");
      }
    }

    // Show summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log("\n📊 Publication Summary:");
    console.log("========================");
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📁 Total files: ${markdownFiles.length}`);

    if (failed > 0) {
      console.log("\n❌ Failed files:");
      results.filter(r => !r.success).forEach(r => {
        console.log(`  • ${r.file}: ${r.error}`);
      });
    }
  }

  /**
   * Find all markdown files in directory and subdirectories
   * @param dir Directory to search
   * @returns Array of markdown file paths
   */
  static async findMarkdownFiles(dir: string): Promise<string[]> {
    const { readdirSync, statSync } = await import('fs');
    const { join } = await import('path');

    const files: string[] = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules, .git, and other common directories
            if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
              const subFiles = await EnhancedCommands.findMarkdownFiles(fullPath);
              files.push(...subFiles);
            }
          } else if (stat.isFile() && entry.toLowerCase().endsWith('.md')) {
            files.push(fullPath);
          }
        } catch (error) {
          // Skip files/directories that can't be accessed
          console.warn(`Warning: Could not access ${fullPath}`);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dir}`);
    }

    return files.sort();
  }
}