import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { ConfigManager } from "../config/ConfigManager";
import { DependencyManager } from "../dependencies/DependencyManager";
import { MetadataManager } from "../metadata/MetadataManager";
import { EnhancedTelegraphPublisher } from "../publisher/EnhancedTelegraphPublisher";
import { PublicationStatus } from "../types/metadata";
import { ProgressIndicator } from "./ProgressIndicator";

/**
 * Enhanced CLI commands with metadata management
 */
export class EnhancedCommands {

  /**
   * Add enhanced publish command
   * @param program Commander program instance
   */
  static addPublishCommand(program: Command): void {
    program
      .command("publish-enhanced")
      .alias("pub")
      .description("Publish Markdown file with metadata management and dependency resolution")
      .option("-f, --file <path>", "Path to the Markdown file to publish")
      .option("-a, --author <name>", "Author's name (overrides config default)")
      .option("--with-dependencies", "Automatically publish linked local files (default: true)")
      .option("--no-with-dependencies", "Skip automatic dependency publishing")
      .option("--force-republish", "Force republish even if file is already published")
      .option("--dry-run", "Preview operations without making changes")
      .option("--token <token>", "Access token (optional, will try to load from config)")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          await EnhancedCommands.handlePublishCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Publication failed: ${error instanceof Error ? error.message : String(error)}`,
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
      .option("--depth <number>", "Maximum dependency depth to analyze", "5")
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
   * Handle enhanced publish command
   * @param options Command options
   */
  private static async handlePublishCommand(options: any): Promise<void> {
    if (!options.file) {
      throw new Error("File path must be specified using --file");
    }

    const filePath = resolve(options.file);
    const fileDirectory = dirname(filePath);

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
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

    if (status === PublicationStatus.PUBLISHED && !options.forceRepublish && !options.dryRun) {
      ProgressIndicator.showStatus("File is already published. Use --force-republish to override", "warning");
      const metadata = MetadataManager.getPublicationInfo(filePath);
      if (metadata) {
        console.log(`📄 Published URL: ${metadata.telegraphUrl}`);
        console.log(`📅 Published at: ${metadata.publishedAt}`);
      }
      return;
    }

    // Publish with progress tracking
    const spinner = ProgressIndicator.createSpinner("Publishing file with metadata management");
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
        console.log(`📄 URL: ${result.url}`);
        console.log(`📍 Path: ${result.path}`);

        if (result.metadata) {
          console.log(`👤 Author: ${result.metadata.username}`);
          console.log(`📅 Published: ${result.metadata.publishedAt}`);
        }
      } else {
        throw new Error(result.error || "Unknown publication error");
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
}