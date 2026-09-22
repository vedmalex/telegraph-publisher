import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import type { Command } from "commander";
import { PagesCacheManager } from "../cache/PagesCacheManager";
import { ConfigManager } from "../config/ConfigManager";
import { ContentProcessor } from "../content/ContentProcessor";
import { DependencyManager } from "../dependencies/DependencyManager";
import { EpubGenerator } from "../epub/EpubGenerator";
import { DeprecatedFlagError, UserFriendlyErrorReporter } from "../errors/DeprecatedFlagError";
import { BidirectionalLinkResolver } from "../links/BidirectionalLinkResolver";
import { LinkResolver } from "../links/LinkResolver";
import type { BrokenLink, FileScanResult } from "../links/types";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { MetadataManager } from "../metadata/MetadataManager";
import { AutoRegistrationManager } from "../publisher/AutoRegistrationManager";
import { EnhancedTelegraphPublisher } from "../publisher/EnhancedTelegraphPublisher";
import { GitHubGistPublisher } from "../publisher/GitHubGistPublisher";
import { PAPER_PRESETS as PDF_PAPER_PRESETS, PdfGenerator } from "../svg/PdfGenerator";
import { PAPER_PRESETS, SvgGenerator } from "../svg/SvgGenerator";
import { TelegraphPublisher } from "../telegraphPublisher";
import { type DependencyNode, type ExtendedMetadataConfig, type FileMetadata, PublicationStatus, type TelegraphLink } from "../types/metadata";
import { PathResolver } from "../utils/PathResolver";
import { PublicationWorkflowManager } from "../workflow";
import {
  applyConfigSet,
  computeFileStatus as computeFileStatusOp,
  type ConfigSetAssignment,
  scanMarkdownFiles,
} from "./CliStatusConfigOps";
import { ProgressIndicator } from "./ProgressIndicator";

/**
 * Enhanced CLI commands with metadata management
 */
export class EnhancedCommands {

  /**
   * CLI to configuration parameter mapping (Selective Parameter Mapping pattern)
   */
  private static readonly CLI_TO_CONFIG_MAPPING: Record<string, string> = {
    'author': 'defaultUsername',
    'tocTitle': 'customFields.tocTitle',
    'withDependencies': 'autoPublishDependencies'
  };

  /**
   * Extract configuration updates from CLI options
   * @param options CLI options
   * @returns Configuration updates to apply
   */
  private static extractConfigUpdatesFromCli(options: any): Partial<ExtendedMetadataConfig> {
    const updates: any = {};

    for (const [cliKey, configPath] of Object.entries(EnhancedCommands.CLI_TO_CONFIG_MAPPING)) {
      if (options[cliKey] !== undefined) {
        if (configPath.includes('.')) {
          // Handle nested properties like customFields.tocTitle
          const pathParts = configPath.split('.');
          const parent = pathParts[0];
          const child = pathParts[1];
          if (parent && child) {
            if (!updates[parent]) updates[parent] = {};
            updates[parent][child] = options[cliKey];
          }
        } else {
          updates[configPath] = options[cliKey];
        }
      }
    }

    return updates;
  }

  /**
   * Notify user about configuration changes (Configuration Change Detection pattern)
   * @param changedFields Fields that were changed
   * @param configDirectory Directory where config was saved
   */
  private static notifyConfigurationUpdate(changedFields: Record<string, any>, configDirectory: string): void {
    const changes = Object.entries(changedFields)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // Handle nested objects like customFields
          return Object.entries(value).map(([nestedKey, nestedValue]) => `  ${key}.${nestedKey}: ${nestedValue}`).join('\n');
        }
        return `  ${key}: ${value}`;
      })
      .join('\n');

    ProgressIndicator.showStatus(
      `💾 Configuration auto-saved to .telegraph-publisher-config.json:\n${changes}`,
      'success'
    );
  }

  /**
   * Creative Enhancement: Load hierarchical configuration with CLI priority preservation
   * @param filePath File path to start hierarchical config search from
   * @param cliOptions CLI options that should take priority
   * @returns Merged configuration with CLI overrides
   */
  private static async loadConfigWithCliPriority(
    filePath: string,
    cliOptions: any
  ): Promise<ExtendedMetadataConfig> {
    try {
      // Load hierarchical configuration
      const hierarchicalConfig = await ConfigManager.loadHierarchicalConfig(filePath);

      // Extract CLI overrides
      const cliOverrides = EnhancedCommands.extractConfigUpdatesFromCli(cliOptions);

      // CLI options override hierarchical config (highest priority)
      const finalConfig: ExtendedMetadataConfig = {
        ...hierarchicalConfig,
        ...cliOverrides
      };

      // Add CLI token if provided (highest priority for accessToken)
      if (cliOptions.token) {
        finalConfig.accessToken = cliOptions.token;
      }

      // Log configuration sources for debugging
      if (Object.keys(cliOverrides).length > 0) {
        console.log('🔧 CLI overrides applied:', Object.keys(cliOverrides).join(', '));
      }

      return finalConfig;

    } catch (error) {
      console.warn('⚠️ Failed to load hierarchical config, falling back to legacy:', error);

      // Fallback to legacy config loading
      const legacyConfig = ConfigManager.getMetadataConfig(dirname(filePath));
      if (!legacyConfig) {
        throw new Error('Failed to load any configuration');
      }

      const cliOverrides = EnhancedCommands.extractConfigUpdatesFromCli(cliOptions);

      return {
        ...legacyConfig,
        ...cliOverrides,
        accessToken: cliOptions.token || undefined
      };
    }
  }

  /**
   * Synchronous version for backward compatibility (where async is not supported)
   * @param filePath File path to start config search from
   * @param cliOptions CLI options for overrides
   * @returns Configuration with CLI priority
   */
  private static loadConfigWithCliPrioritySync(
    filePath: string,
    cliOptions: any
  ): ExtendedMetadataConfig {
    // Use legacy synchronous loading for immediate compatibility
    const legacyConfig = ConfigManager.getMetadataConfig(dirname(filePath));
    const cliOverrides = EnhancedCommands.extractConfigUpdatesFromCli(cliOptions);

    // Ensure all required fields are present with proper defaults
    const baseConfig: ExtendedMetadataConfig = {
      ...ConfigManager.DEFAULT_CONFIG,
      ...(legacyConfig || {}),
      ...cliOverrides
    };

    // Handle accessToken with proper type checking
    if (cliOptions.token) {
      baseConfig.accessToken = cliOptions.token;
    }

    return baseConfig;
  }

  /**
   * Add unified publish command (combines pub and edit functionality)
   * @param program Commander program instance
   */
  static addPublishCommand(program: Command): void {
    program
      .command("publish")
      .alias("pub")
      .description("Unified publish/edit command: creates, publishes, or updates Markdown files (if no file specified, publishes entire directory)")
      .option("-f, --file <path...>", "Path(s) to the Markdown file(s) (optional - if not specified, publishes current directory)")
      .option("-a, --author <name>", "Author's name (overrides config default)")
      .option("--title <title>", "Title of the article (optional, will be extracted from file if not provided)")
      .option("--author-url <url>", "Author's URL (optional)")
      .option("--with-dependencies", "Automatically publish linked local files (default: true)")
      .option("--no-with-dependencies", "Skip automatic dependency publishing")
      .option("--dry-run", "Preview operations without making changes")
      .option("--debug", "Save the generated Telegraph JSON to a file (implies --dry-run)")
      .option("--no-verify", "Skip mandatory local link verification before publishing")
      .option("--no-auto-repair", "Disable automatic link repair (publication will fail if broken links are found)")
      .option("--aside", "Automatically generate a Table of Contents (aside block) at the start of the article (default: true)")
      .option("--no-aside", "Disable automatic generation of the Table of Contents")
      .option("--inline-toc", "Render Table of Contents inline in the article text (default: true)")
      .option("--no-inline-toc", "Generate ToC but don't render it inline (useful for EPUB and other formats)")
      .option("--toc-title <title>", "Title for the Table of Contents section (default: 'Содержание')")
      .option("--toc-separators", "Add horizontal separators (HR) before and after Table of Contents (default: true)")
      .option("--no-toc-separators", "Disable horizontal separators around Table of Contents")
      .option("--force", "Bypass link verification and force republish of unchanged files (for debugging)")
      .option("--token <token>", "Access token (optional, will try to load from config)")
      .option("--no-auto-register", "Disable automatic Telegraph account creation if no token is found")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          // Check for deprecated flags before processing
          EnhancedCommands.validateDeprecatedFlags(process.argv);
          await EnhancedCommands.handleUnifiedPublishCommand(options);
        } catch (error) {
          if (error instanceof DeprecatedFlagError) {
            console.error(error.getHelpMessage());
            process.exit(1);
          }
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
      .option(
        "--set <key=value>",
        "Set a configuration value (repeatable). Keys: defaultUsername, autoPublishDependencies, replaceLinksinContent, createBackups, manageBidirectionalLinks, autoSyncCache, maxDependencyDepth, rateLimiting.<field>, customFields.<name>",
        (value: string, previous: string[]) => previous.concat([value]),
        [] as string[]
      )
      .option("--reset", "Reset configuration to defaults")
      .option("--username <name>", "Set default username")
      .option("--github-token <token>", "Set GitHub token for gist publication")
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
   * Add reset command
   * @param program Commander program instance
   */
  static addResetCommand(program: Command): void {
    program
      .command("reset")
      .alias("r")
      .description("Reset publication metadata, preserving only title")
      .option("-f, --file <path>", "Path to specific file (optional - processes directory if not specified)")
      .option("--dry-run", "Preview changes without modification")
      .option("-v, --verbose", "Detailed progress information")
      .option("--force", "Reset files even without publication metadata")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleResetCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Reset failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Add check-links command
   * @param program Commander program instance
   */
  static addCheckLinksCommand(program: Command): void {
    program
      .command("check-links")
      .alias("cl")
      .description("Verify and repair local Markdown links")
      .argument("[path]", "Path to file or directory (default: current directory)")
      .option("--apply-fixes", "Enable interactive repair mode")
      .option("--dry-run", "Report only, no changes (default)")
      .option("-v, --verbose", "Show detailed progress information")
      .option("-o, --output <file>", "Save report to file")
      .action(async (path, options) => {
        try {
          await EnhancedCommands.handleCheckLinksCommand(path, options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Link check failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Add cache validation command
   * @param program Commander program instance
   */
  static addCacheValidateCommand(program: Command): void {
    program
      .command("cache:validate")
      .alias("cv")
      .description("Validate the integrity of the pages cache")
      .option("--fix", "Attempt to automatically remove invalid entries from the cache")
      .option("-v, --verbose", "Show detailed validation progress")
      .option("--dry-run", "Show what would be validated without making API calls")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleCacheValidateCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Cache validation failed: ${error instanceof Error ? error.message : String(error)}`,
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
    // Support multiple files: if array provided, process sequentially
    if (Array.isArray(options.file)) {
      const files: string[] = options.file;

      // Handle debug mode: debug implies dry-run
      if (options.debug) {
        options.dryRun = true;
      }

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        if (!filePath) continue;
        try {
          await EnhancedCommands.processSinglePublish(filePath, options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Publication workflow failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      }
      return;
    }

    const targetPath = options.file || process.cwd();
    const fileDirectory = options.file ? dirname(resolve(options.file)) : process.cwd();

    // If a specific file is targeted and it doesn't exist, create it (edit functionality)
    if (options.file && !existsSync(resolve(options.file))) {
      ProgressIndicator.showStatus("File not found. Creating new file...", "info");
      const initialContent = options.title
        ? `# ${options.title}\n\nContent goes here...`
        : `# New Article\n\nContent goes here...`;
      writeFileSync(resolve(options.file), initialContent);
      ProgressIndicator.showStatus(`Created new file: ${resolve(options.file)}`, "success");
    }

    // STEP 1: Load existing configuration with hierarchical support
    const existingConfig = EnhancedCommands.loadConfigWithCliPrioritySync(options.file, options);

    // STEP 2: Extract configuration updates from CLI options
    const configUpdatesFromCli = EnhancedCommands.extractConfigUpdatesFromCli(options);

    // STEP 3: Merge configurations with CLI priority (Configuration Cascade pattern)
    const finalConfig = {
      ...existingConfig,
      ...configUpdatesFromCli
    };

    // STEP 4: Persist merged configuration immediately (Immediate Persistence pattern)
    if (Object.keys(configUpdatesFromCli).length > 0) {
      ConfigManager.updateMetadataConfig(fileDirectory, finalConfig);
      EnhancedCommands.notifyConfigurationUpdate(configUpdatesFromCli, fileDirectory);
    }

    // STEP 5: Handle access token with auto-registration fallback
    let accessToken = options.token || ConfigManager.loadAccessToken(fileDirectory);

    if (options.token) {
      ConfigManager.saveAccessToken(fileDirectory, options.token);
    }

    // Auto-registration if no token exists and auto-registration is enabled
    if (!accessToken && !options.noAutoRegister) {
      try {
        const autoRegistrationManager = new AutoRegistrationManager();
        accessToken = await autoRegistrationManager.getOrCreateAccessToken(
          fileDirectory,
          {
            username: finalConfig.defaultUsername,
            authorName: options.author,
            authorUrl: options.authorUrl,
            baseShortName: 'TelegraphPublisher'
          }
        );
      } catch (error) {
        ProgressIndicator.showStatus(
          `❌ Автоматическая регистрация не удалась: ${error instanceof Error ? error.message : String(error)}`,
          "error"
        );
        throw new Error("Access token is required. Set it using --token or configure it with 'config' command");
      }
    }

    if (!accessToken) {
      throw new Error("Access token is required. Set it using --token or configure it with 'config' command");
    }

    const workflowManager = new PublicationWorkflowManager(finalConfig, accessToken);

    // Handle debug mode: debug implies dry-run
    if (options.debug) {
      options.dryRun = true;
    }

    try {
      await workflowManager.publish(targetPath, options);
    } catch (error) {
      ProgressIndicator.showStatus(
        `Publication workflow failed: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      process.exit(1);
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

    const config = EnhancedCommands.loadConfigWithCliPrioritySync(filePath, options);
    config.maxDependencyDepth = parseInt(options.depth) || config.maxDependencyDepth;

    const pathResolver = PathResolver.getInstance();
    const dependencyManager = new DependencyManager(config, pathResolver);

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
   * Whitelist of allowed `config --set` keys, grouped by validation rule.
   * Kept as a static structure so it can be surfaced verbatim in error messages
   * and reused by tests without spawning the CLI.
   */
  private static readonly CONFIG_SET_SCHEMA = {
    /** Free-form string values (must be non-empty after trimming) */
    stringKeys: ["defaultUsername"],
    /** Boolean values accepting only the literals "true" / "false" */
    booleanKeys: [
      "autoPublishDependencies",
      "replaceLinksinContent",
      "createBackups",
      "manageBidirectionalLinks",
      "autoSyncCache"
    ],
    /** Integer key with an inclusive range constraint */
    intRange: { maxDependencyDepth: { min: 1, max: 20 } } as Record<string, { min: number; max: number }>,
    /** Nested rateLimiting.* numeric fields (must be finite and > 0) */
    rateNumericKeys: [
      "baseDelayMs",
      "adaptiveMultiplier",
      "maxDelayMs",
      "maxRetries",
      "cooldownPeriodMs"
    ],
    /** Nested rateLimiting.* enum fields */
    rateEnumKeys: { backoffStrategy: ["linear", "exponential"] } as Record<string, string[]>,
    /** Nested rateLimiting.* boolean fields */
    rateBooleanKeys: ["enableAdaptiveThrottling"],
    /** Keys explicitly rejected to avoid encouraging secrets in argv */
    rejectedKeys: {
      accessToken: "--token",
      githubToken: "--github-token"
    } as Record<string, string>
  };

  /**
   * Build a human-readable list of all valid `config --set` keys for error messages.
   */
  private static describeConfigSetKeys(): string {
    const s = EnhancedCommands.CONFIG_SET_SCHEMA;
    const parts = [
      ...s.stringKeys,
      ...s.booleanKeys,
      ...Object.keys(s.intRange),
      ...s.rateNumericKeys.map(k => `rateLimiting.${k}`),
      ...Object.keys(s.rateEnumKeys).map(k => `rateLimiting.${k}`),
      ...s.rateBooleanKeys.map(k => `rateLimiting.${k}`),
      "customFields.<name>"
    ];
    return parts.join(", ");
  }

  /**
   * Parse and validate `--set key=value` pairs against the config whitelist.
   *
   * This is a pure function (no filesystem access) so it can be unit-tested
   * directly. It throws a descriptive Error on any unknown key, wrong type,
   * out-of-range value, or rejected (secret) key.
   *
   * @param pairs Raw `key=value` strings collected from the CLI
   * @returns Structured assignments describing the target config path + typed value
   */
  static parseConfigSet(pairs: string[]): {
    assignments: Array<{ path: string; value: string | number | boolean; display: string; sensitive: boolean }>;
  } {
    const s = EnhancedCommands.CONFIG_SET_SCHEMA;
    const assignments: Array<{ path: string; value: string | number | boolean; display: string; sensitive: boolean }> = [];

    for (const raw of pairs) {
      const eq = raw.indexOf("=");
      if (eq === -1) {
        throw new Error(`Invalid --set format: "${raw}". Expected key=value.`);
      }
      const key = raw.slice(0, eq).trim();
      const value = raw.slice(eq + 1);

      if (!key) {
        throw new Error(`Invalid --set format: "${raw}". Empty key.`);
      }

      // Reject secret keys outright
      if (s.rejectedKeys[key]) {
        throw new Error(
          `Refusing to set "${key}" via --set (avoid secrets in shell history). Use ${s.rejectedKeys[key]} instead.`
        );
      }

      // Nested rateLimiting.*
      if (key.startsWith("rateLimiting.")) {
        const sub = key.slice("rateLimiting.".length);
        if (s.rateNumericKeys.includes(sub)) {
          const num = Number(value);
          if (!Number.isFinite(num) || num <= 0) {
            throw new Error(`Invalid value for ${key}: "${value}". Expected a number greater than 0.`);
          }
          assignments.push({ path: `rateLimiting.${sub}`, value: num, display: String(num), sensitive: false });
          continue;
        }
        if (s.rateEnumKeys[sub]) {
          const allowed = s.rateEnumKeys[sub];
          if (!allowed.includes(value)) {
            throw new Error(`Invalid value for ${key}: "${value}". Allowed: ${allowed.join(" | ")}.`);
          }
          assignments.push({ path: `rateLimiting.${sub}`, value, display: value, sensitive: false });
          continue;
        }
        if (s.rateBooleanKeys.includes(sub)) {
          const bool = EnhancedCommands.parseBooleanValue(key, value);
          assignments.push({ path: `rateLimiting.${sub}`, value: bool, display: String(bool), sensitive: false });
          continue;
        }
        throw new Error(
          `Unknown rateLimiting field: "${sub}". Valid keys: ${EnhancedCommands.describeConfigSetKeys()}.`
        );
      }

      // Nested customFields.*
      if (key.startsWith("customFields.")) {
        const sub = key.slice("customFields.".length);
        if (!sub) {
          throw new Error(`Invalid custom field key: "${key}". Expected customFields.<name>.`);
        }
        assignments.push({ path: `customFields.${sub}`, value, display: value, sensitive: false });
        continue;
      }

      // String keys
      if (s.stringKeys.includes(key)) {
        if (value.trim().length === 0) {
          throw new Error(`Invalid value for ${key}: value cannot be empty.`);
        }
        assignments.push({ path: key, value, display: value, sensitive: false });
        continue;
      }

      // Boolean keys
      if (s.booleanKeys.includes(key)) {
        const bool = EnhancedCommands.parseBooleanValue(key, value);
        assignments.push({ path: key, value: bool, display: String(bool), sensitive: false });
        continue;
      }

      // Int-range keys
      if (s.intRange[key]) {
        const { min, max } = s.intRange[key];
        const num = Number(value);
        if (!Number.isInteger(num) || num < min || num > max) {
          throw new Error(`Invalid value for ${key}: "${value}". Expected an integer between ${min} and ${max}.`);
        }
        assignments.push({ path: key, value: num, display: String(num), sensitive: false });
        continue;
      }

      // Unknown key
      throw new Error(
        `Unknown config key: "${key}". Valid keys: ${EnhancedCommands.describeConfigSetKeys()}.`
      );
    }

    return { assignments };
  }

  /**
   * Parse a strict boolean literal ("true" / "false") for a config key.
   */
  private static parseBooleanValue(key: string, value: string): boolean {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Invalid value for ${key}: "${value}". Expected "true" or "false".`);
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

    // Handle individual settings.
    //
    // The whole combined update (--set pairs PLUS the --username/--github-token/
    // --max-depth/--auto-deps flags) is routed through the SINGLE DstIO-seated
    // write in CliStatusConfigOps.applyConfigSet (TASK-035 / ISS-029). The
    // non---set flags are converted into the same per-path assignments and
    // appended AFTER the --set pairs, preserving the legacy handler's applied
    // order and its single-write semantics. Byte-for-byte identical file + console
    // output to the former ConfigManager.loadConfig/updateMetadataConfig path.
    const setPairs: string[] = Array.isArray(options.set) ? options.set : [];
    const extraAssignments: ConfigSetAssignment[] = [];

    if (options.username) {
      extraAssignments.push({ path: "defaultUsername", value: options.username, display: options.username, sensitive: false });
    }

    if (options.githubToken) {
      extraAssignments.push({ path: "githubToken", value: options.githubToken, display: options.githubToken, sensitive: true });
    }

    if (options.maxDepth) {
      const depth = parseInt(options.maxDepth);
      if (isNaN(depth) || depth < 1 || depth > 20) {
        throw new Error("Max depth must be a number between 1 and 20");
      }
      extraAssignments.push({ path: "maxDependencyDepth", value: depth, display: String(depth), sensitive: false });
    }

    if (options.autoDeps !== undefined) {
      extraAssignments.push({ path: "autoPublishDependencies", value: options.autoDeps === "true", display: String(options.autoDeps === "true"), sensitive: false });
    }

    if (setPairs.length > 0 || extraAssignments.length > 0) {
      const { applied, configPath } = applyConfigSet(directory, setPairs, undefined, extraAssignments);
      // Mirror ConfigManager.saveConfig's success line (applyConfigSet performs
      // the DstIO-seated write and stays pure of the handler's user-facing block).
      console.log(`✅ Configuration saved to ${configPath}`);
      ProgressIndicator.showStatus("Configuration updated successfully", "success");
      console.log("\n📝 Applied settings:");
      for (const item of applied) {
        const shown = EnhancedCommands.maskSensitive(item.key, item.display, item.sensitive);
        console.log(`   ${item.key} = ${shown}`);
      }
      console.log("");
    } else {
      ConfigManager.displayConfig(directory);
    }
  }

  /**
   * Mask sensitive values (tokens/secrets) for console output.
   */
  private static maskSensitive(key: string, value: string, sensitive: boolean): string {
    const looksSecret = sensitive || /token|secret|password/i.test(key);
    if (!looksSecret) return value;
    if (value.length <= 8) return "***";
    return `${value.substring(0, 4)}...${value.slice(-2)}`;
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
      return;
    }

    // Directory mode (default to CWD when neither -f nor -d is provided)
    const directory = resolve(options.directory || process.cwd());
    if (!existsSync(directory)) {
      throw new Error(`Directory not found: ${directory}`);
    }

    const recursive = options.recursive === true;
    const files = await EnhancedCommands.findMarkdownFiles(directory, recursive);

    console.log(`\n📂 Directory: ${directory}${recursive ? " (recursive)" : ""}`);

    if (files.length === 0) {
      ProgressIndicator.showStatus("No markdown files found", "info");
      return;
    }

    const counts: Record<string, number> = {
      [PublicationStatus.PUBLISHED]: 0,
      [PublicationStatus.NOT_PUBLISHED]: 0,
      [PublicationStatus.METADATA_CORRUPTED]: 0,
      [PublicationStatus.METADATA_MISSING]: 0
    };

    for (const file of files) {
      const { status, url } = EnhancedCommands.computeFileStatus(file);
      counts[status] = (counts[status] ?? 0) + 1;
      const rel = relative(directory, file) || basename(file);
      const icon = EnhancedCommands.statusIcon(status);
      console.log(`${icon} ${rel} — ${status}${url ? ` → ${url}` : ""}`);
    }

    console.log(`\n📊 Summary (${files.length} file${files.length === 1 ? "" : "s"}):`);
    console.log(`   ✅ published: ${counts[PublicationStatus.PUBLISHED]}`);
    console.log(`   📝 not_published: ${counts[PublicationStatus.NOT_PUBLISHED]}`);
    console.log(`   ⚠️ metadata_corrupted: ${counts[PublicationStatus.METADATA_CORRUPTED]}`);
    console.log(`   ❓ metadata_missing: ${counts[PublicationStatus.METADATA_MISSING]}`);
    console.log("");
  }

  /**
   * Compute the publication status (and URL, if any) for a single file.
   *
   * Thin wrapper over MetadataManager so directory-status uses the exact same
   * resolution path as the single-file branch.
   *
   * @param filePath Absolute path to a markdown file
   */
  static computeFileStatus(filePath: string): { status: PublicationStatus; url?: string } {
    // Thin, real-fs delegate (positional signature preserved for back-compat) to
    // the DstIO-seated implementation in CliStatusConfigOps.
    return computeFileStatusOp(filePath);
  }

  /**
   * Map a publication status to a display icon.
   */
  private static statusIcon(status: PublicationStatus): string {
    switch (status) {
      case PublicationStatus.PUBLISHED:
        return "✅";
      case PublicationStatus.NOT_PUBLISHED:
        return "📝";
      case PublicationStatus.METADATA_CORRUPTED:
        return "⚠️";
      default:
        return "❓";
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
    // This method is now largely replaced by PublicationWorkflowManager.publish
    // It will simply call the unified publish method with the current directory as target
    await EnhancedCommands.handleUnifiedPublishCommand(options);
  }

  /**
   * Find all markdown files in a directory.
   *
   * Skips dot-directories, `node_modules`, and `dist`. When `recursive` is
   * true (the default, preserving existing reset behavior) it descends into
   * subdirectories; when false it lists only the top-level `.md` files.
   *
   * @param dir Directory to search
   * @param recursive Whether to descend into subdirectories (default: true)
   * @returns Sorted array of markdown file paths
   */
  static async findMarkdownFiles(dir: string, recursive: boolean = true): Promise<string[]> {
    // Thin, real-fs delegate (positional signature preserved for back-compat) to
    // the DstIO-seated implementation in CliStatusConfigOps.
    return scanMarkdownFiles(dir, { recursive });
  }

  /**
   * Handle reset command
   * @param options Command options
   */
  static async handleResetCommand(options: any): Promise<void> {
    const { readFileSync, writeFileSync } = await import('fs');
    const { resolve } = await import('path');

    // If no file specified, process current directory
    if (!options.file) {
      await EnhancedCommands.handleDirectoryReset(options);
      return;
    }

    const filePath = resolve(options.file as string);

    if (options.verbose) {
      ProgressIndicator.showStatus(`Processing file: ${filePath}`, "info");
    }

    try {
      // Read file content
      const content = readFileSync(filePath, 'utf-8');

      // Check if file has metadata to reset
      const hasMetadata = content.trim().startsWith('---');
      if (!hasMetadata && !options.force) {
        ProgressIndicator.showStatus(`Skipped ${filePath}: No front-matter found`, "info");
        return;
      }

      // Perform reset
      const resetContent = MetadataManager.resetMetadata(content, filePath);

      if (options.dryRun) {
        ProgressIndicator.showStatus("🔍 Dry-run mode: Preview of changes", "info");
        console.log(`\n📄 File: ${filePath}`);
        console.log("📝 Before:");
        console.log(content.split('\n').slice(0, 10).join('\n') + (content.split('\n').length > 10 ? '\n...' : ''));
        console.log("\n✨ After:");
        console.log(resetContent.split('\n').slice(0, 10).join('\n') + (resetContent.split('\n').length > 10 ? '\n...' : ''));
        console.log("");
        return;
      }

      // Write the reset content back to file
      writeFileSync(filePath, resetContent, 'utf-8');

      ProgressIndicator.showStatus(`✅ Reset completed: ${filePath}`, "success");

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ProgressIndicator.showStatus(`❌ Error processing ${filePath}: ${errorMessage}`, "error");
      throw error;
    }
  }

  /**
   * Handle directory reset
   * @param options Command options
   */
  static async handleDirectoryReset(options: any): Promise<void> {
    const currentDir = process.cwd();

    if (options.verbose) {
      ProgressIndicator.showStatus(`Scanning directory: ${currentDir}`, "info");
    }

    // Find all markdown files
    const markdownFiles = await EnhancedCommands.findMarkdownFiles(currentDir);

    if (markdownFiles.length === 0) {
      ProgressIndicator.showStatus("No markdown files found in current directory", "info");
      return;
    }

    if (options.dryRun) {
      ProgressIndicator.showStatus("🔍 Dry-run mode: Found files that would be processed:", "info");
      markdownFiles.forEach(file => console.log(`  📄 ${file}`));
      console.log(`\nTotal files: ${markdownFiles.length}`);
      return;
    }

    ProgressIndicator.showStatus(`Found ${markdownFiles.length} markdown files. Processing...`, "info");

    const spinner = ProgressIndicator.createSpinner("Resetting metadata");
    spinner.start();

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors: Array<{ file: string, error: string }> = [];

    try {
      for (let i = 0; i < markdownFiles.length; i++) {
        const file = markdownFiles[i];
        if (!file) continue;

        try {
          const { readFileSync, writeFileSync } = await import('fs');
          const content = readFileSync(file, 'utf-8');

          // Check if file has metadata to reset
          const hasMetadata = content.trim().startsWith('---');
          if (!hasMetadata && !options.force) {
            skipCount++;
            if (options.verbose) {
              spinner.stop();
              ProgressIndicator.showStatus(`Skipped ${file}: No front-matter`, "info");
              spinner.start();
            }
            continue;
          }

          // Perform reset
          const resetContent = MetadataManager.resetMetadata(content, file);
          writeFileSync(file, resetContent, 'utf-8');

          successCount++;

          if (options.verbose) {
            spinner.stop();
            ProgressIndicator.showStatus(`✅ Reset: ${file}`, "success");
            spinner.start();
          }

        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({ file, error: errorMessage });

          if (options.verbose) {
            spinner.stop();
            ProgressIndicator.showStatus(`❌ Error: ${file} - ${errorMessage}`, "error");
            spinner.start();
          }
        }
      }
    } finally {
      spinner.stop();
    }

    // Display summary
    ProgressIndicator.showStatus(
      `\n✅ Reset Operation Complete\n` +
      `═══════════════════════════\n` +
      `📊 Files processed: ${markdownFiles.length}\n` +
      `✅ Successfully reset: ${successCount}\n` +
      `⚠️  Skipped: ${skipCount}\n` +
      `❌ Errors: ${errorCount}`,
      "success"
    );

    if (errors.length > 0) {
      console.log("\n❌ Failed files:");
      errors.forEach(({ file, error }) => {
        console.log(`  • ${file}: ${error}`);
      });
    }
  }

  /**
   * Handle check-links command
   * @param path Path to scan (optional)
   * @param options Command options
   */
  static async handleCheckLinksCommand(path: string | undefined, options: any): Promise<void> {
    const { LinkScanner, LinkVerifier, LinkResolver, ReportGenerator, InteractiveRepairer } = await import('../links');

    const targetPath = path || process.cwd();
    const verbose = options.verbose || false;
    const applyFixes = options.applyFixes || false;
    const outputFile = options.output;

    const reportGenerator = new ReportGenerator(verbose);
    const scanner = new LinkScanner();
    const verifier = new LinkVerifier(PathResolver.getInstance(), targetPath);
    const resolver = new LinkResolver();

    const startTime = Date.now();

    try {
      // Show initial progress
      if (verbose) {
        reportGenerator.showInfo(`🔎 Starting scan: ${targetPath}`);
      }

      // Find all markdown files
      const markdownFiles = await scanner.findMarkdownFiles(targetPath);

      if (markdownFiles.length === 0) {
        reportGenerator.showInfo('No markdown files found to scan.');
        return;
      }

      // Scan all files for links
      const fileResults: any[] = [];
      let totalLinks = 0;
      let totalLocalLinks = 0;

      for (let i = 0; i < markdownFiles.length; i++) {
        const filePath = markdownFiles[i];
        if (!filePath) continue;

        if (verbose) {
          reportGenerator.showVerboseProgress(filePath, i + 1, markdownFiles.length);
        }

        const scanResult = await scanner.scanFile(filePath);
        const verifiedResult = await verifier.verifyLinks(scanResult);

        fileResults.push(verifiedResult);
        totalLinks += verifiedResult.allLinks.length;
        totalLocalLinks += verifiedResult.localLinks.length;

        if (verbose) {
          reportGenerator.showVerboseFileDetails(verifiedResult);
        }
      }

      // Resolve suggestions for broken links
      const resolvedResults = await resolver.resolveBrokenLinks(fileResults);

      // Create complete scan result
      const allBrokenLinks: any[] = [];
      for (const result of resolvedResults) {
        allBrokenLinks.push(...result.brokenLinks);
      }

      const scanResult = {
        totalFiles: markdownFiles.length,
        totalLinks,
        totalLocalLinks,
        brokenLinks: allBrokenLinks,
        fileResults: resolvedResults,
        processingTime: Date.now() - startTime
      };

      // Generate report
      reportGenerator.generateReport(scanResult, outputFile);

      // Interactive repair mode
      if (applyFixes && allBrokenLinks.length > 0) {
        const repairer = new InteractiveRepairer(reportGenerator);
        await repairer.performInteractiveRepair(allBrokenLinks);
      }

    } catch (error) {
      reportGenerator.showError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Validate against deprecated flags in argv
   * @param argv Command line arguments
   */
  private static validateDeprecatedFlags(argv: string[]): void {
    const deprecatedFlags = ['--force-republish'];

    for (const flag of deprecatedFlags) {
      if (argv.includes(flag)) {
        throw new DeprecatedFlagError(flag, '--force');
      }
    }
  }

  /**
   * Find cache file by searching up the directory tree
   * @param startDir Starting directory
   * @returns Cache file path or null if not found
   */
  private static findCacheFile(startDir: string): string | null {
    const cacheFileName = ".telegraph-pages-cache.json";
    let currentDir = resolve(startDir);

    // Search up to 10 levels to avoid infinite loop
    for (let i = 0; i < 10; i++) {
      const cacheFilePath = resolve(currentDir, cacheFileName);
      if (existsSync(cacheFilePath)) {
        return cacheFilePath;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Add EPUB generation command
   * @param program Commander program instance
   */
  static addEpubCommand(program: Command): void {
    program
      .command("epub")
      .description("Generate EPUB file from Markdown file(s), reusing the same publication mechanism")
      .option("-f, --file <path...>", "Path(s) to the Markdown file(s) (required)")
      .option("-o, --output <path>", "Output EPUB file path (default: book.epub)")
      .option("-t, --title <title>", "Book title (optional, will be extracted from first file if not provided)")
      .option("-a, --author <name>", "Author's name (required)")
      .option("--cover <path>", "Path to cover image file (JPG or PNG)")
      .option("--debug", "Keep temporary files for debugging (don't delete temp directory)")
      .option("--with-dependencies", "Automatically include linked local files (default: true)")
      .option("--no-with-dependencies", "Skip automatic dependency inclusion")
      .option("--inline-toc", "Render Table of Contents inline in each chapter (default: false for EPUB)")
      .option("--no-inline-toc", "Don't render ToC inline - only use EPUB navigation (default for EPUB)")
      .option("--toc-title <title>", "Title for the Table of Contents section (default: 'Содержание')")
      .option("--toc-separators", "Add horizontal separators (HR) before and after Table of Contents (default: true)")
      .option("--no-toc-separators", "Disable horizontal separators around Table of Contents")
      .option(
        "--toc-depth <n>",
        "Deepest heading level shown in the reader's navigation (default: no limit). " +
        "Use 2 for books where every verse is a heading, so navigation lists chapters only"
      )
      .option(
        "--chapter-toc <pos>",
        "Navigation inside a chapter: none | blocks | full | auto. " +
        "blocks is a short row of jump points (1 · 20 · 40) for long chapters; " +
        "full lists every heading; auto (default) uses blocks when --toc-depth " +
        "hides those headings from the reader's navigation, and adds nothing otherwise"
      )
      .option("--chapter-toc-depth <n>", "Deepest heading level in the chapter's in-text list (full mode only)")
      .option("--chapter-toc-position <p>", "Where chapter navigation goes: start | end | both (default: both for blocks, start for full)")
      .option("--nav-threshold <n>", "Fewest sections in a chapter before a jump row appears (default: 30)")
      .option("--nav-max-items <n>", "Most jump points in a row; drives the step (default: 12)")
      .option("--nav-caption <s>", "Caption of the jump row (default: 'К тексту:')")
      .option(
        "--book-toc <pos>",
        "Add a contents page for the whole book: start | end. Off by default, " +
        "since it repeats the reader's own navigation"
      )
      .option("--book-toc-depth <n>", "Deepest heading level on the book contents page (default: --toc-depth, else 2)")
      .option(
        "--split-at <n>",
        "Split each file into separate xhtml documents at headings of this level " +
        "or shallower (e.g. 2). Keeps documents small enough for readers to load"
      )
      .option(
        "--epub-version <n>",
        "EPUB version the package declares: 3 (default) or 2. " +
        "Use 2 for older readers: it drops the navigation document and the EPUB 3 " +
        "metadata, leaving the toc.ncx that such readers expect"
      )
      .option("--language <lang>", "Book language code (default: 'ru')")
      .option(
        "--title-page",
        "Put a title page first, showing the book's name, its author and any " +
        "imprint details given below. Without one a reader that shows no cover " +
        "falls back to the file name, which is why such books are listed by author alone"
      )
      .option("--publisher <name>", "Publisher, for the title page and the package metadata")
      .option("--pub-date <date>", "Publication date (e.g. 2026), for the title page and metadata")
      .option("--translator <name>", "Translator, shown on the title page and recorded as a contributor")
      .option("--series <name>", "Series or collection the book belongs to")
      .option("--description <text>", "One-line description for the title page and metadata")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleEpubCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `EPUB generation failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Handle EPUB generation command
   * Reuses the same processing pipeline as Telegraph publication
   * @param options Command options
   */
  /**
   * Decides whether a chapter carries an in-text list of its own headings.
   *
   * The two tables of contents answer to each other: when --toc-depth keeps a
   * chapter's headings out of the reader's navigation, the in-text list becomes
   * the only way to reach them, so it is added by default. When navigation
   * already lists everything, the in-text list would only repeat it.
   */
  private static resolveChapterToc(options: any): Record<string, unknown> {
    const depthLimited = Boolean(options.tocDepth);
    const requested: string = options.chapterToc
      ?? (options.inlineToc === true ? "full" : options.inlineToc === false ? "none" : "auto");

    // auto ties the two together: while --toc-depth keeps a chapter's sections
    // out of the reader's navigation, something inside the chapter has to lead
    // to them, and a row of jump points does it without listing all of them.
    const mode = requested === "auto" ? (depthLimited ? "blocks" : "none") : requested;
    if (mode === "none") {
      return { inlineToC: false };
    }

    const position = options.chapterTocPosition
      ?? (mode === "blocks" ? "both" : "start");

    return {
      inlineToC: true,
      tocMode: mode === "blocks" ? "blocks" : "full",
      tocPosition: position,
      tocNested: true,
      tocDepth: options.chapterTocDepth ? Number.parseInt(options.chapterTocDepth, 10) : undefined,
      navCaption: options.navCaption,
      navThreshold: options.navThreshold ? Number.parseInt(options.navThreshold, 10) : undefined,
      navMaxItems: options.navMaxItems ? Number.parseInt(options.navMaxItems, 10) : undefined,
    };
  }

  private static async handleEpubCommand(options: any): Promise<void> {
    if (!options.file || options.file.length === 0) {
      throw new Error("At least one file is required. Use -f or --file to specify Markdown file(s).");
    }

    if (!options.author) {
      throw new Error("Author is required. Use -a or --author to specify author name.");
    }

    const filePaths = Array.isArray(options.file) ? options.file : [options.file];
    const firstFilePath = resolve(filePaths[0]);
    const fileDirectory = dirname(firstFilePath);

    // Load config (same as publish command)
    const existingConfig = EnhancedCommands.loadConfigWithCliPrioritySync(firstFilePath, options);
    const configUpdatesFromCli = EnhancedCommands.extractConfigUpdatesFromCli(options);
    const finalConfig = {
      ...existingConfig,
      ...configUpdatesFromCli,
    };

    if (Object.keys(configUpdatesFromCli).length > 0) {
      ConfigManager.updateMetadataConfig(fileDirectory, finalConfig);
      EnhancedCommands.notifyConfigurationUpdate(configUpdatesFromCli, fileDirectory);
    }

    // Extract title from first file if not provided
    let bookTitle = options.title;
    if (!bookTitle) {
      const firstFileContent = readFileSync(firstFilePath, "utf-8");
      // Prefer the first Markdown heading (#, ##, etc.) as book title
      const contentWithoutMetadata = MetadataManager.removeMetadata(firstFileContent);
      const headingLine = contentWithoutMetadata
        .split(/\r?\n/)
        .find((line) => /^#{1,6}\s+.+/.test(line));

      if (headingLine) {
        const extractedTitle = headingLine.replace(/^#{1,6}\s+/, "").trim();
        if (extractedTitle) {
          bookTitle = extractedTitle;
        }
      }

      if (!bookTitle) {
        const metadata = MetadataManager.parseMetadata(firstFileContent);
        bookTitle = metadata?.title || basename(firstFilePath, ".md");
      }
    }

    // Determine output path
    const outputPath = options.output || resolve(fileDirectory, "book.epub");

    ProgressIndicator.showStatus(`📚 Generating EPUB: ${bookTitle}`, "info");
    ProgressIndicator.showStatus(`   Author: ${options.author}`, "info");
    ProgressIndicator.showStatus(`   Output: ${outputPath}`, "info");

    // Create EPUB generator
    const epubGenerator = new EpubGenerator({
      outputPath,
      title: bookTitle,
      author: options.author,
      language: options.language || "ru",
      cover: options.cover,
      debug: options.debug,
      tocDepth: options.tocDepth ? Number.parseInt(options.tocDepth, 10) : undefined,
      splitAt: options.splitAt ? Number.parseInt(options.splitAt, 10) : undefined,
      bookToc: options.bookToc === "start" || options.bookToc === "end" ? options.bookToc : undefined,
      bookTocDepth: options.bookTocDepth ? Number.parseInt(options.bookTocDepth, 10) : undefined,
      bookTocTitle: options.tocTitle,
      epubVersion: options.epubVersion === "2" ? 2 : 3,
      titlePage: options.titlePage === true,
      publisher: options.publisher,
      pubDate: options.pubDate,
      translator: options.translator,
      series: options.series,
      description: options.description,
    });

    // Process files with dependencies.
    // Алгоритм EPUB-обхода не использует DependencyManager, а строит
    // слоистый порядок файлов по реальным ссылкам в Markdown:
    //   - слой 0: все файлы из CLI (в порядке передачи),
    //   - слой 1: их прямые зависимости,
    //   - слой 2: зависимости зависимостей и т.д.
    //
    // При этом каждый файл обрабатывается не более одного раза, что
    // автоматически предотвращает циклы и избыточный обход.
    const orderedFilesToProcess: string[] = [];
    const visitedFiles = new Map<string, { level: number; order: number }>();
    const bfsQueue: Array<{ filePath: string; level: number }> = [];

    const depsEnabled = options.withDependencies !== false;

    if (!depsEnabled) {
      // Без зависимостей: только явно переданные файлы
      filePaths.forEach((filePath: string, index: number) => {
        const resolvedPath = resolve(filePath);
        if (!existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }
        if (!visitedFiles.has(resolvedPath)) {
          visitedFiles.set(resolvedPath, { level: 0, order: index });
          orderedFilesToProcess.push(resolvedPath);
        }
      });
    } else {
      // С зависимостями: BFS по дереву ссылок
      // 1. Инициализируем очередь корневыми файлами (слой 0)
      filePaths.forEach((filePath: string, index: number) => {
        const resolvedPath = resolve(filePath);
        if (!existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }
        if (!visitedFiles.has(resolvedPath)) {
          visitedFiles.set(resolvedPath, { level: 0, order: index });
          bfsQueue.push({ filePath: resolvedPath, level: 0 });
          orderedFilesToProcess.push(resolvedPath);
        }
      });

      // 2. BFS: для каждого файла ищем локальные markdown-ссылки и добавляем новые файлы
      let queueIndex = 0;
      while (queueIndex < bfsQueue.length) {
        const current = bfsQueue[queueIndex];
        queueIndex++;

        if (!current) continue;

        const currentPath = current.filePath;
        let content: string;
        try {
          content = readFileSync(currentPath, "utf-8");
        } catch {
          continue;
        }

        const contentWithoutMetadata = MetadataManager.removeMetadata(content);

        // Найти все локальные ссылки
        const localLinks = LinkResolver.findLocalLinks(
          contentWithoutMetadata,
          currentPath,
        );

        for (const link of localLinks) {
          const resolvedWithAnchor = link.resolvedPath;
          const anchorIndex = resolvedWithAnchor.indexOf("#");
          const resolvedPath =
            anchorIndex !== -1
              ? resolvedWithAnchor.substring(0, anchorIndex)
              : resolvedWithAnchor;

          // Обрабатываем только markdown-файлы
          if (
            !resolvedPath.toLowerCase().endsWith(".md") &&
            !resolvedPath.toLowerCase().endsWith(".markdown")
          ) {
            continue;
          }

          if (!existsSync(resolvedPath)) {
            continue;
          }

          if (!visitedFiles.has(resolvedPath)) {
            const level = current.level + 1;
            visitedFiles.set(resolvedPath, {
              level,
              order: orderedFilesToProcess.length,
            });
            bfsQueue.push({ filePath: resolvedPath, level });
            orderedFilesToProcess.push(resolvedPath);
          }
        }
      }
    }

    // Precompute chapter path mapping for internal link rewriting in EPUB:
    // absolute sourcePath (.md) -> chapter-N.html
    const chapterPathMapping: Record<string, string> = {};
    orderedFilesToProcess.forEach((filePath, index) => {
      const abs = resolve(filePath);
      const htmlName = `chapter-${index + 1}.html`;
      chapterPathMapping[abs] = htmlName;
    });

    epubGenerator.setChapterPathMap(chapterPathMapping);

    // Add chapters to EPUB following the ordered list
    for (const filePath of orderedFilesToProcess) {
      ProgressIndicator.showStatus(`   Processing: ${basename(filePath)}`, "info");
      await epubGenerator.addChapterFromFile(filePath, {
        generateToc: true, // Generate TOC for each chapter (independent of dependency processing)
        ...EnhancedCommands.resolveChapterToc(options),
        tocTitle: options.tocTitle,
        tocSeparators: options.tocSeparators !== false,
      });
    }

    // Generate EPUB
    ProgressIndicator.showStatus("   Generating EPUB file...", "info");
    await epubGenerator.generate();

    ProgressIndicator.showStatus(`✅ EPUB generated successfully: ${outputPath}`, "success");
  }

  /**
   * Add SVG generation command for thermal printer output
   * @param program Commander program instance
   */
  static addSvgCommand(program: Command): void {
    program
      .command("svg")
      .description("Generate SVG file from Markdown for thermal printer (black & white, with cut marks)")
      .option("-f, --file <path>", "Path to the Markdown file (required)")
      .option("-o, --output <path>", "Output SVG file path (default: <input-basename>.svg next to the input file)")
      .option("-w, --width <mm>", "Paper width in mm (default: 57)")
      .option("--page-height <mm>", "Page height in mm (default: 105)")
      .option("--orientation <type>", "Orientation: portrait or landscape (default: portrait)")
      .option("--paper <size>", "Paper preset: a4, a5, a5-half, thermal-57, custom (default: custom)")
      .option("--margin <mm>", "Margin from edges in mm (default: 3)")
      .option("--font-size <pt>", "Font size in pt: 6 (min), 8 (normal), 10 (good) (default: 10)")
      .option("--line-height <multiplier>", "Line height multiplier (default: 1.5)")
      .option("--cut-marks", "Show cut marks at page boundaries (default: true)")
      .option("--no-cut-marks", "Hide cut marks")
      .option("--chrome-path <path>", "Path to Chrome/Chromium executable")
      .option("--debug", "Enable debug output")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleSvgCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `SVG generation failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Handle SVG generation command
   * @param options Command options
   */
  private static async handleSvgCommand(options: any): Promise<void> {
    if (!options.file) {
      throw new Error("File is required. Use -f or --file to specify a Markdown file.");
    }

    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileDirectory = dirname(filePath);
    const fileBaseName = basename(filePath, ".md");

    // Determine output path (default: same name as input with .svg extension)
    const outputPath = options.output || resolve(fileDirectory, `${fileBaseName}.svg`);

    // Parse numeric options
    const width = options.width ? parseFloat(options.width) : undefined;
    const pageHeight = options.pageHeight ? parseFloat(options.pageHeight) : undefined;
    const margin = options.margin ? parseFloat(options.margin) : undefined;
    const fontSize = options.fontSize ? parseFloat(options.fontSize) : undefined;
    const lineHeight = options.lineHeight ? parseFloat(options.lineHeight) : undefined;

    // Validate font size
    if (fontSize && fontSize < 6) {
      throw new Error(`Font size must be at least 6pt.`);
    }
    let orientation: "portrait" | "landscape" | undefined;
    if (options.orientation) {
      if (options.orientation === "portrait" || options.orientation === "landscape") {
        orientation = options.orientation;
      } else {
        throw new Error(`Invalid orientation: ${options.orientation}. Use 'portrait' or 'landscape'.`);
      }
    }

    // Validate paper preset
    if (options.paper && options.paper !== "custom" && !PAPER_PRESETS[options.paper]) {
      const validPresets = Object.keys(PAPER_PRESETS).join(", ");
      throw new Error(`Invalid paper preset: ${options.paper}. Valid options: ${validPresets}, custom`);
    }

    ProgressIndicator.showStatus(`🖨️ Generating SVG for thermal printer...`, "info");
    ProgressIndicator.showStatus(`   Input: ${filePath}`, "info");
    ProgressIndicator.showStatus(`   Output: ${outputPath}`, "info");

    if (options.paper && options.paper !== "custom") {
      ProgressIndicator.showStatus(`   Paper: ${options.paper}`, "info");
    } else {
      ProgressIndicator.showStatus(`   Width: ${width || 57}mm, Page height: ${pageHeight || 105}mm`, "info");
    }

    if (orientation) {
      ProgressIndicator.showStatus(`   Orientation: ${orientation}`, "info");
    }

    // Create SVG generator
    const svgGenerator = new SvgGenerator({
      outputPath,
      width,
      pageHeight,
      orientation,
      paper: options.paper,
      margin: margin ?? 3,
      fontSize,
      lineHeight,
      cutMarks: options.cutMarks !== false,
      debug: options.debug || options.verbose,
      chromePath: options.chromePath,
    });

    // Generate SVG
    await svgGenerator.generateFromFile(filePath);

    ProgressIndicator.showStatus(`✅ SVG generated successfully: ${outputPath}`, "success");
  }

  /**
   * Add PDF generation command for thermal printer output
   * @param program Commander program instance
   */
  static addPdfCommand(program: Command): void {
    program
      .command("pdf")
      .description("Generate PDF file from Markdown file(s), following links like EPUB/Publish modes")
      .option("-f, --file <path...>", "Path(s) to the Markdown file(s) (required)")
      .option("-o, --output <path>", "Output PDF file path (default: book.pdf)")
      .option("-t, --title <title>", "Document title (optional, extracted from first file if not provided)")
      .option("-w, --width <mm>", "Paper width in mm (default: 210 for A4)")
      .option("--page-height <mm>", "Page height in mm (default: 297 for A4)")
      .option("--orientation <type>", "Orientation: portrait or landscape (default: portrait)")
      .option("--paper <size>", "Paper preset: a4, a5, a5-half, thermal-57, thermal-80, custom (default: a4)")
      .option("--margin <mm>", "Margin from edges in mm (default: 15)")
      .option("--font-size <pt>", "Font size in pt: 6 (min), 8 (normal), 10 (good), 12 (default: 12)")
      .option("--line-height <multiplier>", "Line height multiplier (default: 1.6)")
      .option("--chrome-path <path>", "Path to Chrome/Chromium executable")
      .option("--with-dependencies", "Automatically include linked local files (default: true)")
      .option("--no-with-dependencies", "Skip automatic dependency inclusion")
      .option("--save-merged", "Save merged markdown as _pdf.md file before PDF generation")
      .option("--no-header", "Skip document title in PDF output (useful when header breaks layout)")
      .option("--debug", "Enable debug output (keep temp files)")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          await EnhancedCommands.handlePdfCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `PDF generation failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  /**
   * Add GitHub Gist publication command
   * @param program Commander program instance
   */
  static addGistCommand(program: Command): void {
    program
      .command("gist")
      .description("Publish merged Markdown to GitHub Gist (create or update existing gist)")
      .option("-f, --file <path...>", "Path(s) to the Markdown file(s) (required)")
      .option("--filename <name>", "Filename inside gist (default: *_pdf.md)")
      .option("--description <text>", "Gist description (optional)")
      .option("--gist-id <id>", "Update specific gist ID instead of metadata-discovered gist")
      .option("--token <token>", "GitHub token (optional: config, GITHUB_TOKEN, GH_TOKEN are used as fallback)")
      .option("--with-dependencies", "Automatically include linked local files (default: true)")
      .option("--no-with-dependencies", "Skip automatic dependency inclusion")
      .option("--public", "Create public gist (default: private)")
      .option("--save-merged", "Save merged markdown as _pdf.md file before gist publication")
      .option("--dry-run", "Preview gist payload without GitHub API request")
      .option("-v, --verbose", "Show detailed progress information")
      .action(async (options) => {
        try {
          await EnhancedCommands.handleGistCommand(options);
        } catch (error) {
          ProgressIndicator.showStatus(
            `Gist publication failed: ${error instanceof Error ? error.message : String(error)}`,
            "error"
          );
          process.exit(1);
        }
      });
  }

  private static async handleGistCommand(options: any): Promise<void> {
    if (!options.file || options.file.length === 0) {
      throw new Error("At least one file is required. Use -f or --file to specify Markdown file(s).");
    }

    const inputFilePaths = Array.isArray(options.file) ? options.file : [options.file];
    const firstFilePath = resolve(inputFilePaths[0]);
    const fileDirectory = dirname(firstFilePath);

    if (!existsSync(firstFilePath)) {
      throw new Error(`File not found: ${firstFilePath}`);
    }

    const sourceContent = readFileSync(firstFilePath, "utf-8");
    const sourceMetadata = MetadataManager.parseMetadata(sourceContent);
    const existingGistId =
      options.gistId ||
      sourceMetadata?.gistId ||
      EnhancedCommands.extractGistIdFromUrl(sourceMetadata?.gistUrl);

    const githubToken =
      options.token ||
      ConfigManager.loadGithubToken(fileDirectory) ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN;

    if (!githubToken) {
      throw new Error("GitHub token is required. Use --token, config --github-token, or GITHUB_TOKEN.");
    }

    if (options.token) {
      ConfigManager.saveGithubToken(fileDirectory, options.token);
    }

    const documentTitle = EnhancedCommands.resolveDocumentTitleFromMarkdown(firstFilePath, options.title);
    const mergedDocument = EnhancedCommands.buildMergedMarkdownForSingleDocument(inputFilePaths, {
      withDependencies: options.withDependencies,
      verbose: options.verbose,
    });

    const defaultFilename = mergedDocument.inputFiles.length > 1
      ? "book_pdf.md"
      : `${basename(firstFilePath, extname(firstFilePath))}_pdf.md`;
    const gistFilename = EnhancedCommands.ensureMarkdownFilename(options.filename || defaultFilename);

    ProgressIndicator.showStatus(`📝 Publishing markdown to Gist: ${documentTitle}`, "info");
    ProgressIndicator.showStatus(`   File in gist: ${gistFilename}`, "info");
    ProgressIndicator.showStatus(`   Visibility: ${options.public ? "public" : "private"}`, "info");

    if (options.saveMerged) {
      const mergedFilePath = resolve(fileDirectory, defaultFilename);
      writeFileSync(mergedFilePath, mergedDocument.mergedMarkdown, "utf-8");
      ProgressIndicator.showStatus(`   Saved merged markdown: ${mergedFilePath}`, "info");
    }

    if (options.dryRun) {
      ProgressIndicator.showStatus(
        `🔍 DRY-RUN: Would ${existingGistId ? "update" : "create"} gist with ${mergedDocument.orderedFilesToProcess.length} merged file(s)`,
        "info"
      );
      return;
    }

    const gistPublisher = new GitHubGistPublisher(githubToken);
    const gistDescription = options.description || documentTitle;

    const gistResult = existingGistId
      ? await gistPublisher.updateGist({
          gistId: existingGistId,
          filename: gistFilename,
          content: mergedDocument.mergedMarkdown,
          description: gistDescription,
        })
      : await gistPublisher.createGist({
          filename: gistFilename,
          content: mergedDocument.mergedMarkdown,
          description: gistDescription,
          isPublic: options.public === true,
        });

    const updatedContent = MetadataManager.upsertGistMetadata(sourceContent, {
      gistId: gistResult.id,
      gistUrl: gistResult.html_url,
      gistFilename,
      gistPublic: gistResult.public,
      gistUpdatedAt: new Date().toISOString(),
    });
    writeFileSync(firstFilePath, updatedContent, "utf-8");

    ProgressIndicator.showStatus(
      `✅ Gist ${existingGistId ? "updated" : "created"} successfully`,
      "success"
    );
    console.log(`🔗 URL: ${gistResult.html_url}`);
  }

  /**
   * Handle PDF generation command
   * Follows the same link-following pattern as EPUB for multi-file support
   * @param options Command options
   */
  private static async handlePdfCommand(options: any): Promise<void> {
    if (!options.file || options.file.length === 0) {
      throw new Error("At least one file is required. Use -f or --file to specify Markdown file(s).");
    }

    const filePaths = Array.isArray(options.file) ? options.file : [options.file];
    const firstFilePath = resolve(filePaths[0]);
    const fileDirectory = dirname(firstFilePath);

    // Validate first file exists
    if (!existsSync(firstFilePath)) {
      throw new Error(`File not found: ${firstFilePath}`);
    }

    const documentTitle = EnhancedCommands.resolveDocumentTitleFromMarkdown(firstFilePath, options.title);

    // Determine output path
    const defaultOutputName = filePaths.length > 1 ? "book.pdf" : `${basename(firstFilePath, ".md")}.pdf`;
    const outputPath = options.output || resolve(fileDirectory, defaultOutputName);

    ProgressIndicator.showStatus(`📄 Generating PDF: ${documentTitle}`, "info");
    ProgressIndicator.showStatus(`   Output: ${outputPath}`, "info");
    const mergedDocument = EnhancedCommands.buildMergedMarkdownForSingleDocument(filePaths, {
      withDependencies: options.withDependencies,
      verbose: options.verbose,
    });
    const mergedMarkdown = mergedDocument.mergedMarkdown;

    // ============================================
    // Optionally save merged markdown file
    // ============================================
    if (options.saveMerged || options.debug) {
      const mergedFilePath = outputPath.replace(/\.pdf$/i, "_pdf.md");
      writeFileSync(mergedFilePath, mergedMarkdown, "utf-8");
      ProgressIndicator.showStatus(`   Saved merged markdown: ${mergedFilePath}`, "info");
    }

    // ============================================
    // Parse numeric options and generate PDF
    // ============================================
    const width = options.width ? parseFloat(options.width) : undefined;
    const pageHeight = options.pageHeight ? parseFloat(options.pageHeight) : undefined;
    const margin = options.margin ? parseFloat(options.margin) : undefined;
    const fontSize = options.fontSize ? parseFloat(options.fontSize) : undefined;
    const lineHeight = options.lineHeight ? parseFloat(options.lineHeight) : undefined;

    // Validate font size
    if (fontSize && fontSize < 6) {
      throw new Error(`Font size must be at least 6pt.`);
    }

    let orientation: "portrait" | "landscape" | undefined;
    if (options.orientation) {
      if (options.orientation === "portrait" || options.orientation === "landscape") {
        orientation = options.orientation;
      } else {
        throw new Error(`Invalid orientation: ${options.orientation}. Use 'portrait' or 'landscape'.`);
      }
    }

    // Validate paper preset
    if (options.paper && options.paper !== "custom" && !PDF_PAPER_PRESETS[options.paper]) {
      const validPresets = Object.keys(PDF_PAPER_PRESETS).join(", ");
      throw new Error(`Invalid paper preset: ${options.paper}. Valid options: ${validPresets}, custom`);
    }

    // Show paper info
    const paperPreset = options.paper || "a4";
    if (paperPreset !== "custom") {
      ProgressIndicator.showStatus(`   Paper: ${paperPreset}`, "info");
    } else {
      ProgressIndicator.showStatus(`   Width: ${width || 210}mm, Page height: ${pageHeight || 297}mm`, "info");
    }

    if (orientation) {
      ProgressIndicator.showStatus(`   Orientation: ${orientation}`, "info");
    }

    // Create PDF generator
    const pdfGenerator = new PdfGenerator({
      outputPath,
      basePath: firstFilePath,
      width,
      pageHeight,
      orientation,
      paper: paperPreset,
      margin: margin ?? 15,
      fontSize: fontSize ?? 12,
      lineHeight: lineHeight ?? 1.6,
      debug: options.debug || options.verbose,
      chromePath: options.chromePath,
      noHeader: options.header === false,
    });

    // Generate PDF from merged content
    await pdfGenerator.generateFromMarkdown(mergedMarkdown, documentTitle);

    ProgressIndicator.showStatus(`✅ PDF generated successfully: ${outputPath}`, "success");
  }

  /**
   * Handle cache validation command
   * @param options Command options
   */
  static async handleCacheValidateCommand(options: any): Promise<void> {
    ProgressIndicator.showStatus("🔎 Starting cache validation...", "info");

    try {
      // Find cache file by looking in current directory and up the tree
      const cacheFilePath = EnhancedCommands.findCacheFile(process.cwd());

      if (!cacheFilePath || !existsSync(cacheFilePath)) {
        ProgressIndicator.showStatus("❌ No cache file found. Run a publish command first to create cache.", "error");
        return;
      }

      ProgressIndicator.showStatus(`📁 Found cache file: ${cacheFilePath}`, "info");

      // Read cache file directly for validation purposes
      const cacheContent = readFileSync(cacheFilePath, 'utf-8');
      const cacheData = JSON.parse(cacheContent);
      const entries = Object.entries(cacheData.pages || {});

      if (entries.length === 0) {
        ProgressIndicator.showStatus("✅ Cache is empty - nothing to validate.", "success");
        return;
      }

      ProgressIndicator.showStatus(`📊 Found ${entries.length} cache entries to validate...`, "info");

      if (options.dryRun) {
        ProgressIndicator.showStatus("🏃 Dry run mode - would validate cache without API calls", "info");
        console.log(`\nWould validate ${entries.length} entries:`);
        for (const [url, info] of entries) {
          console.log(`  📄 ${(info as any).localFilePath || 'Unknown'} → ${url}`);
        }
        return;
      }

      // Initialize validation counters
      let validEntries = 0;
      let invalidEntries = 0;
      const invalidList: Array<{ url: string, localPath: string, reason: string }> = [];

      ProgressIndicator.showStatus("🔍 Phase 1: Local file validation...", "info");

      // Phase 1: Local file validation
      for (const [url, info] of entries) {
        const pageInfo = info as any;
        const localPath = pageInfo.localFilePath;

        if (localPath) {
          if (!existsSync(localPath)) {
            invalidEntries++;
            invalidList.push({
              url,
              localPath,
              reason: 'LOCAL_FILE_NOT_FOUND'
            });
          } else {
            validEntries++;
          }
        } else {
          validEntries++; // Consider entries without local path as valid for now
        }

        if (options.verbose) {
          const status = localPath && existsSync(localPath) ? '✅' : '❌';
          console.log(`  ${status} ${localPath || 'No local path'} → ${url}`);
        }
      }

      ProgressIndicator.showStatus(`📝 Phase 1 complete: ${validEntries} valid files, ${invalidEntries} missing files`, "info");

      // Phase 2: Telegraph API validation (optional)
      if (!options.dryRun && entries.length > 0) {
        ProgressIndicator.showStatus("🌐 Phase 2: Telegraph API validation...", "info");

        const publisher = new TelegraphPublisher();
        let apiValidEntries = 0;
        let apiInvalidEntries = 0;

        // Simple rate limiting: delay between requests
        const API_DELAY_MS = 200; // 5 requests per second max

        // Initialize progress bar for API validation
        const apiProgress = new ProgressIndicator(entries.length, "🌐 API Validation");

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry) {
            apiProgress.increment(`⏭️ Skip #${i + 1} (empty)`);
            continue;
          }
          const [url, info] = entry;
          const pageInfo = info as any;

          // Extract path from Telegraph URL
          const urlMatch = url.match(/https:\/\/telegra\.ph\/(.+)/);
          if (!urlMatch) {
            if (options.verbose) {
              console.log(`  ⚠️  Invalid Telegraph URL format: ${url}`);
            }
            apiProgress.increment(`⏭️ Skip #${i + 1} (bad URL)`);
            continue;
          }

          const pagePath = urlMatch[1];
          if (!pagePath) {
            if (options.verbose) {
              console.log(`  ⚠️  Empty page path in URL: ${url}`);
            }
            apiProgress.increment(`⏭️ Skip #${i + 1} (no path)`);
            continue;
          }

          try {
            // Add delay for rate limiting
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
            }

            await publisher.getPage(pagePath, false);
            apiValidEntries++;

            if (options.verbose) {
              console.log(`  ✅ API: ${url} → exists`);
            }

            apiProgress.increment(`✅ ${basename(url)} (${apiValidEntries}✓/${apiInvalidEntries}✗)`);
          } catch (error) {
            apiInvalidEntries++;

            // Check if page was already marked as invalid due to missing local file
            const existingInvalid = invalidList.find(item => item.url === url);
            if (!existingInvalid) {
              invalidList.push({
                url,
                localPath: pageInfo.localFilePath || 'Unknown',
                reason: 'REMOTE_PAGE_NOT_FOUND'
              });
              invalidEntries++;
              validEntries = Math.max(0, validEntries - 1);
            } else {
              // Update reason to include both issues
              existingInvalid.reason = 'LOCAL_FILE_NOT_FOUND + REMOTE_PAGE_NOT_FOUND';
            }

            if (options.verbose) {
              console.log(`  ❌ API: ${url} → ${error instanceof Error ? error.message : 'not found'}`);
            }

            apiProgress.increment(`❌ ${basename(url)} (${apiValidEntries}✓/${apiInvalidEntries}✗)`);
          }
        }

        apiProgress.complete(`Phase 2 complete: ${apiValidEntries} accessible, ${apiInvalidEntries} missing`);
      }

      // Report results
      console.log('\n📊 Validation Summary:');
      console.log(`  ✅ Valid entries: ${validEntries}`);
      console.log(`  ❌ Invalid entries: ${invalidEntries}`);

      if (invalidList.length > 0) {
        console.log('\n❌ Invalid entries found:');
        console.table(invalidList);

        if (options.fix) {
          ProgressIndicator.showStatus("🔧 --fix mode: Removing invalid entries...", "warning");

          // Create a cleaned cache by removing invalid entries
          const cleanedPages: Record<string, any> = {};
          let removedCount = 0;

          for (const [url, info] of entries) {
            const isInvalid = invalidList.some(invalid => invalid.url === url);
            if (!isInvalid) {
              cleanedPages[url] = info;
            } else {
              removedCount++;
            }
          }

          // Update cache data and write back to file
          cacheData.pages = cleanedPages;
          cacheData.lastUpdated = new Date().toISOString();

          try {
            const updatedCacheContent = JSON.stringify(cacheData, null, 2);
            require('fs').writeFileSync(cacheFilePath, updatedCacheContent, 'utf-8');

            ProgressIndicator.showStatus(`✅ Cache cleaned: removed ${removedCount} invalid entries`, "success");
            console.log(`💾 Updated cache file: ${cacheFilePath}`);
          } catch (error) {
            ProgressIndicator.showStatus(`❌ Failed to update cache file: ${error instanceof Error ? error.message : String(error)}`, "error");
          }
        } else {
          ProgressIndicator.showStatus("💡 To automatically remove invalid entries, run with the --fix flag.", "info");
        }
      } else {
        ProgressIndicator.showStatus("🎉 All cache entries are valid!", "success");
      }

    } catch (error) {
      throw new Error(`Cache validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static resolveDocumentTitleFromMarkdown(filePath: string, explicitTitle?: string): string {
    if (explicitTitle?.trim()) {
      return explicitTitle.trim();
    }

    const content = readFileSync(filePath, "utf-8");
    const contentWithoutMetadata = MetadataManager.removeMetadata(content);
    const headingLine = contentWithoutMetadata
      .split(/\r?\n/)
      .find((line: string) => /^#{1,6}\s+.+/.test(line));

    if (headingLine) {
      const extractedTitle = headingLine.replace(/^#{1,6}\s+/, "").trim();
      if (extractedTitle) {
        return extractedTitle;
      }
    }

    const metadata = MetadataManager.parseMetadata(content);
    return metadata?.title || basename(filePath, extname(filePath));
  }

  private static ensureMarkdownFilename(filename: string): string {
    const trimmed = filename.trim();
    if (!trimmed) {
      return "book_pdf.md";
    }

    const lowered = trimmed.toLowerCase();
    if (lowered.endsWith(".md") || lowered.endsWith(".markdown")) {
      return trimmed;
    }

    return `${trimmed}.md`;
  }

  private static extractGistIdFromUrl(gistUrl?: string): string | undefined {
    if (!gistUrl) {
      return undefined;
    }

    try {
      const parsed = new URL(gistUrl);
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1];

      if (!lastPart) {
        return undefined;
      }

      return lastPart;
    } catch {
      return undefined;
    }
  }

  private static buildMergedMarkdownForSingleDocument(
    inputFiles: string[],
    options: {
      withDependencies?: boolean;
      verbose?: boolean;
    } = {}
  ): {
    mergedMarkdown: string;
    orderedFilesToProcess: string[];
    firstFilePath: string;
    fileDirectory: string;
    inputFiles: string[];
  } {
    if (inputFiles.length === 0) {
      throw new Error("At least one input file is required.");
    }

    const firstInputFile = inputFiles[0];
    if (!firstInputFile) {
      throw new Error("First input file is missing.");
    }

    const firstFilePath = resolve(firstInputFile);
    const fileDirectory = dirname(firstFilePath);

    if (!existsSync(firstFilePath)) {
      throw new Error(`File not found: ${firstFilePath}`);
    }

    const orderedFilesToProcess: string[] = [];
    const visitedFiles = new Map<string, { level: number; order: number }>();
    const bfsQueue: Array<{ filePath: string; level: number }> = [];
    const depsEnabled = options.withDependencies !== false;

    if (!depsEnabled) {
      inputFiles.forEach((filePath: string, index: number) => {
        const resolvedPath = resolve(filePath);
        if (!existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }
        if (!visitedFiles.has(resolvedPath)) {
          visitedFiles.set(resolvedPath, { level: 0, order: index });
          orderedFilesToProcess.push(resolvedPath);
        }
      });
    } else {
      inputFiles.forEach((filePath: string, index: number) => {
        const resolvedPath = resolve(filePath);
        if (!existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }
        if (!visitedFiles.has(resolvedPath)) {
          visitedFiles.set(resolvedPath, { level: 0, order: index });
          bfsQueue.push({ filePath: resolvedPath, level: 0 });
          orderedFilesToProcess.push(resolvedPath);
        }
      });

      let queueIndex = 0;
      while (queueIndex < bfsQueue.length) {
        const current = bfsQueue[queueIndex];
        queueIndex++;

        if (!current) {
          continue;
        }

        const currentPath = current.filePath;
        let content: string;
        try {
          content = readFileSync(currentPath, "utf-8");
        } catch {
          continue;
        }

        const contentWithoutMetadata = MetadataManager.removeMetadata(content);
        const localLinks = LinkResolver.findLocalLinks(contentWithoutMetadata, currentPath);

        for (const link of localLinks) {
          const resolvedWithAnchor = link.resolvedPath;
          const anchorIndex = resolvedWithAnchor.indexOf("#");
          const resolvedPath =
            anchorIndex !== -1
              ? resolvedWithAnchor.substring(0, anchorIndex)
              : resolvedWithAnchor;

          if (
            !resolvedPath.toLowerCase().endsWith(".md") &&
            !resolvedPath.toLowerCase().endsWith(".markdown")
          ) {
            continue;
          }

          if (!existsSync(resolvedPath)) {
            continue;
          }

          if (!visitedFiles.has(resolvedPath)) {
            const level = current.level + 1;
            visitedFiles.set(resolvedPath, {
              level,
              order: orderedFilesToProcess.length,
            });
            bfsQueue.push({ filePath: resolvedPath, level });
            orderedFilesToProcess.push(resolvedPath);
          }
        }
      }
    }

    ProgressIndicator.showStatus(`   Found ${orderedFilesToProcess.length} file(s) to process`, "info");

    const fileToAnchorMap: Record<string, string> = {};
    orderedFilesToProcess.forEach((filePath) => {
      const absolutePath = resolve(filePath);
      const relativePath = absolutePath.startsWith(fileDirectory)
        ? absolutePath.substring(fileDirectory.length + 1)
        : basename(absolutePath);
      const pathWithoutExt = relativePath.replace(/\.(md|markdown)$/i, "");
      const anchorId = `section-${pathWithoutExt
        .toLowerCase()
        .replace(/[/\\]/g, "-")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")}`;
      fileToAnchorMap[absolutePath] = anchorId;
    });

    const mergedContentParts: string[] = [];
    for (let i = 0; i < orderedFilesToProcess.length; i++) {
      const filePathItem = orderedFilesToProcess[i];
      if (!filePathItem) {
        continue;
      }

      if (options.verbose) {
        ProgressIndicator.showStatus(`   Processing: ${basename(filePathItem)}`, "info");
      }

      let content: string;
      try {
        content = readFileSync(filePathItem, "utf-8");
      } catch {
        ProgressIndicator.showStatus(`   Warning: Could not read ${basename(filePathItem)}`, "warning");
        continue;
      }

      let processedContent = MetadataManager.removeMetadata(content);
      const localLinks = LinkResolver.findLocalLinks(processedContent, filePathItem);
      const sortedLinks = [...localLinks].sort((a, b) => b.startIndex - a.startIndex);

      for (const link of sortedLinks) {
        const resolvedWithAnchor = link.resolvedPath;
        const anchorIndex = resolvedWithAnchor.indexOf("#");
        const resolvedPath =
          anchorIndex !== -1
            ? resolvedWithAnchor.substring(0, anchorIndex)
            : resolvedWithAnchor;
        const originalAnchor = anchorIndex !== -1
          ? resolvedWithAnchor.substring(anchorIndex)
          : "";
        const targetAnchor = fileToAnchorMap[resolvedPath];

        if (targetAnchor) {
          const newHref = originalAnchor
            ? `#${targetAnchor}${originalAnchor.replace("#", "-")}`
            : `#${targetAnchor}`;
          const newLink = `[${link.text}](${newHref})`;

          processedContent =
            processedContent.substring(0, link.startIndex) +
            newLink +
            processedContent.substring(link.endIndex);
        }
      }

      const absolutePath = resolve(filePathItem);
      const anchorId = fileToAnchorMap[absolutePath] || `section-${i + 1}`;
      const sectionHeader = `<a id="${anchorId}"></a>\n\n`;

      if (i > 0) {
        mergedContentParts.push("\n\n---\n\n");
      }

      mergedContentParts.push(sectionHeader + processedContent);
    }

    return {
      mergedMarkdown: mergedContentParts.join(""),
      orderedFilesToProcess,
      firstFilePath,
      fileDirectory,
      inputFiles: [...inputFiles],
    };
  }

  private static async processSinglePublish(filePath: string, options: any): Promise<void> {
    const resolvedPath = resolve(filePath);
    const fileDirectory = dirname(resolvedPath);

    // Create missing file (edit behavior)
    if (!existsSync(resolvedPath)) {
      ProgressIndicator.showStatus("File not found. Creating new file...", "info");
      const initialContent = options.title
        ? `# ${options.title}\n\nContent goes here...`
        : `# New Article\n\nContent goes here...`;
      writeFileSync(resolvedPath, initialContent);
      ProgressIndicator.showStatus(`Created new file: ${resolvedPath}`, "success");
    }

    // Load config with CLI priority for this file
    const existingConfig = EnhancedCommands.loadConfigWithCliPrioritySync(resolvedPath, options);
    const configUpdatesFromCli = EnhancedCommands.extractConfigUpdatesFromCli(options);
    const finalConfig = {
      ...existingConfig,
      ...configUpdatesFromCli
    };

    if (Object.keys(configUpdatesFromCli).length > 0) {
      ConfigManager.updateMetadataConfig(fileDirectory, finalConfig);
      EnhancedCommands.notifyConfigurationUpdate(configUpdatesFromCli, fileDirectory);
    }

    let accessToken = options.token || ConfigManager.loadAccessToken(fileDirectory);
    if (options.token) {
      ConfigManager.saveAccessToken(fileDirectory, options.token);
    }

    // Auto-registration if no token exists and auto-registration is enabled
    if (!accessToken && !options.noAutoRegister) {
      try {
        const autoRegistrationManager = new AutoRegistrationManager();
        accessToken = await autoRegistrationManager.getOrCreateAccessToken(
          fileDirectory,
          {
            username: finalConfig.defaultUsername,
            authorName: options.author,
            authorUrl: options.authorUrl,
            baseShortName: 'TelegraphPublisher'
          }
        );
      } catch (error) {
        ProgressIndicator.showStatus(
          `❌ Автоматическая регистрация не удалась: ${error instanceof Error ? error.message : String(error)}`,
          "error"
        );
        throw new Error("Access token is required. Set it using --token or configure it with 'config' command");
      }
    }

    if (!accessToken) {
      throw new Error("Access token is required. Set it using --token or configure it with 'config' command");
    }

    const workflowManager = new PublicationWorkflowManager(finalConfig, accessToken);

    // Apply debug->dry-run per file as well
    if (options.debug) {
      options.dryRun = true;
    }

    const perFileOptions = { ...options, file: resolvedPath };
    await workflowManager.publish(resolvedPath, perFileOptions);
  }
}
