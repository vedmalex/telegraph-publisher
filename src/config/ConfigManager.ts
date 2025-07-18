import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetadataConfig } from "../types/metadata";

/**
 * Extended configuration interface including legacy fields
 */
interface ExtendedConfig extends MetadataConfig {
  accessToken?: string;
  version?: string;
}

/**
 * Configuration manager for enhanced Telegraph publisher
 */
export class ConfigManager {
  private static readonly CONFIG_FILE_NAME = ".telegraph-publisher-config.json";
  private static readonly LEGACY_CONFIG_FILE_NAME = ".telegraph-publisher-config.json";

  /**
   * Default configuration values
   */
  private static readonly DEFAULT_CONFIG: MetadataConfig = {
    defaultUsername: undefined,
    autoPublishDependencies: true,
    replaceLinksinContent: true,
    maxDependencyDepth: 1,
    createBackups: false,
    manageBidirectionalLinks: true,
    autoSyncCache: true,
    customFields: {}
  };

  /**
   * Load configuration from file
   * @param directory Directory to look for config file
   * @returns Configuration object
   */
  static loadConfig(directory: string): ExtendedConfig {
    const configPath = join(directory, ConfigManager.CONFIG_FILE_NAME);

    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        return { ...ConfigManager.DEFAULT_CONFIG, ...config };
      } catch (error) {
        console.warn(`⚠️ Error loading config from ${configPath}:`, error);
        return { ...ConfigManager.DEFAULT_CONFIG };
      }
    }

    return { ...ConfigManager.DEFAULT_CONFIG };
  }

  /**
   * Save configuration to file
   * @param directory Directory to save config file
   * @param config Configuration to save
   */
  static saveConfig(directory: string, config: Partial<ExtendedConfig>): void {
    const configPath = join(directory, ConfigManager.CONFIG_FILE_NAME);

    try {
      const existingConfig = ConfigManager.loadConfig(directory);
      const mergedConfig = { ...existingConfig, ...config };

      writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), "utf-8");
      console.log(`✅ Configuration saved to ${configPath}`);
    } catch (error) {
      console.error(
        `❌ Error saving configuration to ${configPath}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Load access token (backward compatibility)
   * @param directory Directory to look for config file
   * @returns Access token if found
   */
  static loadAccessToken(directory: string): string | undefined {
    const config = ConfigManager.loadConfig(directory);
    return config.accessToken;
  }

  /**
   * Save access token (backward compatibility)
   * @param directory Directory to save config file
   * @param accessToken Access token to save
   */
  static saveAccessToken(directory: string, accessToken: string): void {
    ConfigManager.saveConfig(directory, { accessToken });
  }

  /**
   * Get metadata configuration
   * @param directory Directory to load config from
   * @returns Metadata configuration
   */
  static getMetadataConfig(directory: string): MetadataConfig {
    const config = ConfigManager.loadConfig(directory);

    return {
      defaultUsername: config.defaultUsername,
      autoPublishDependencies: config.autoPublishDependencies ?? ConfigManager.DEFAULT_CONFIG.autoPublishDependencies,
      replaceLinksinContent: config.replaceLinksinContent ?? ConfigManager.DEFAULT_CONFIG.replaceLinksinContent,
      maxDependencyDepth: config.maxDependencyDepth ?? ConfigManager.DEFAULT_CONFIG.maxDependencyDepth,
      createBackups: config.createBackups ?? ConfigManager.DEFAULT_CONFIG.createBackups,
      manageBidirectionalLinks: config.manageBidirectionalLinks ?? ConfigManager.DEFAULT_CONFIG.manageBidirectionalLinks,
      autoSyncCache: config.autoSyncCache ?? ConfigManager.DEFAULT_CONFIG.autoSyncCache,
      customFields: config.customFields ?? ConfigManager.DEFAULT_CONFIG.customFields
    };
  }

  /**
   * Update metadata configuration
   * @param directory Directory to save config to
   * @param metadataConfig Metadata configuration to update
   */
  static updateMetadataConfig(directory: string, metadataConfig: Partial<MetadataConfig>): void {
    ConfigManager.saveConfig(directory, metadataConfig);
  }

  /**
   * Display current configuration
   * @param directory Directory to load config from
   */
  static displayConfig(directory: string): void {
    const config = ConfigManager.loadConfig(directory);

    console.log("\n📋 Current Configuration:");
    console.log("========================");

    if (config.accessToken) {
      const maskedToken = config.accessToken.substring(0, 8) + "..." + config.accessToken.slice(-4);
      console.log(`🔑 Access Token: ${maskedToken}`);
    } else {
      console.log("🔑 Access Token: Not set");
    }

    console.log(`👤 Default Username: ${config.defaultUsername || "Not set"}`);
    console.log(`🔗 Auto-publish Dependencies: ${config.autoPublishDependencies ? "Yes" : "No"}`);
    console.log(`🔄 Replace Links in Content: ${config.replaceLinksinContent ? "Yes" : "No"}`);
    console.log(`📊 Max Dependency Depth: ${config.maxDependencyDepth}`);
    console.log(`💾 Create Backups: ${config.createBackups ? "Yes" : "No"}`);
    console.log(`🔗 Manage Bidirectional Links: ${config.manageBidirectionalLinks ? "Yes" : "No"}`);
    console.log(`🔄 Auto-sync Cache: ${config.autoSyncCache ? "Yes" : "No"}`);

    if (config.customFields && Object.keys(config.customFields).length > 0) {
      console.log("🎛️ Custom Fields:");
      for (const [key, value] of Object.entries(config.customFields)) {
        console.log(`   ${key}: ${value}`);
      }
    }

    console.log("========================\n");
  }

  /**
   * Reset configuration to defaults
   * @param directory Directory to save config to
   * @param keepAccessToken Whether to preserve access token
   */
  static resetConfig(directory: string, keepAccessToken: boolean = true): void {
    const config: Partial<ExtendedConfig> = { ...ConfigManager.DEFAULT_CONFIG };

    if (keepAccessToken) {
      const existingConfig = ConfigManager.loadConfig(directory);
      if (existingConfig.accessToken) {
        config.accessToken = existingConfig.accessToken;
      }
    }

    ConfigManager.saveConfig(directory, config);
    console.log("✅ Configuration reset to defaults");
  }

  /**
   * Validate configuration
   * @param config Configuration to validate
   * @returns Validation result
   */
  static validateConfig(config: MetadataConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.maxDependencyDepth < 1 || config.maxDependencyDepth > 20) {
      errors.push("Max dependency depth must be between 1 and 20");
    }

    if (config.defaultUsername && config.defaultUsername.trim().length === 0) {
      errors.push("Default username cannot be empty string");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}