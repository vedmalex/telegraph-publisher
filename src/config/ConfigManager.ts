import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetadataConfig, RateLimitConfig, ExtendedMetadataConfig } from "../types/metadata";
import { HierarchicalConfigCache } from "./HierarchicalConfigCache.js";
import { IntelligentConfigMerger } from "./IntelligentConfigMerger.js";

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
   * Default rate limiting configuration
   */
  private static readonly DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
    baseDelayMs: 1500,
    adaptiveMultiplier: 2.0,
    maxDelayMs: 30000,
    backoffStrategy: 'linear',
    maxRetries: 3,
    cooldownPeriodMs: 60000,
    enableAdaptiveThrottling: true
  };

  /**
   * Default configuration values
   */
  public static readonly DEFAULT_CONFIG: MetadataConfig = {
    defaultUsername: undefined,
    autoPublishDependencies: true,
    replaceLinksinContent: true,
    maxDependencyDepth: 20,
    createBackups: false,
    manageBidirectionalLinks: true,
    autoSyncCache: true,
    rateLimiting: ConfigManager.DEFAULT_RATE_LIMIT_CONFIG,
    customFields: {}
  };

  // ============================================================================
  // Creative Enhancement: Hierarchical Configuration Loading
  // ============================================================================

  /**
   * Load hierarchical configuration with intelligent caching and merging
   * @param startPath File or directory path to start hierarchical search
   * @returns Merged configuration from all hierarchy levels
   */
  public static async loadHierarchicalConfig(startPath: string): Promise<ExtendedMetadataConfig> {
    try {
      // Use intelligent cache for fast repeated access
      const config = await HierarchicalConfigCache.loadWithInvalidation(startPath);
      
      // Validate merged configuration
      const validation = IntelligentConfigMerger.validateMergedConfig(config);
      
      if (!validation.valid) {
        console.error('❌ Configuration validation failed:');
        validation.errors.forEach(error => console.error(`   • ${error}`));
        throw new Error('Invalid configuration detected');
      }
      
      if (validation.warnings.length > 0) {
        console.warn('⚠️ Configuration warnings:');
        validation.warnings.forEach(warning => console.warn(`   • ${warning}`));
      }
      
      return config;
      
    } catch (error) {
      console.warn(`⚠️ Failed to load hierarchical config for ${startPath}:`, error);
      
      // Fallback to default config
      return {
        ...ConfigManager.DEFAULT_CONFIG,
        lastModified: new Date().toISOString()
      };
    }
  }

  /**
   * Legacy method - maintained for backward compatibility
   * Delegates to hierarchical loading for consistency
   * @param directory Directory to look for config file
   * @returns Configuration object or null if not found
   */
  static getMetadataConfig(directory: string): MetadataConfig | null {
    try {
      // Use the new hierarchical loader but return legacy format
      const hierarchicalConfig = this.loadHierarchicalConfigSync(directory);
      
      // Strip extended fields for legacy compatibility
      const { accessToken, version, lastModified, ...legacyConfig } = hierarchicalConfig;
      
      return legacyConfig;
      
    } catch (error) {
      console.warn(`Failed to load config from ${directory}:`, error);
      return null;
    }
  }

  /**
   * Synchronous version of hierarchical config loading (for legacy compatibility)
   * @param startPath Starting path for hierarchical search
   * @returns Extended configuration
   */
  private static loadHierarchicalConfigSync(startPath: string): ExtendedMetadataConfig {
    // This is a simplified sync version that doesn't use caching
    // For full functionality, use the async loadHierarchicalConfig method
    
    const configPath = join(startPath, ConfigManager.CONFIG_FILE_NAME);
    
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as ExtendedMetadataConfig;
        
        // Merge with defaults
        return IntelligentConfigMerger.deepMerge(
          { ...ConfigManager.DEFAULT_CONFIG },
          config
        );
        
      } catch (error) {
        console.warn(`Failed to parse config file ${configPath}:`, error);
      }
    }
    
    return { ...ConfigManager.DEFAULT_CONFIG };
  }

  /**
   * Save configuration to directory
   * @param directory Directory to save config file
   * @param config Configuration to save
   */
  static saveConfig(directory: string, config: Partial<ExtendedConfig>): void {
    const configPath = join(directory, ConfigManager.CONFIG_FILE_NAME);

    try {
      const existingConfig = ConfigManager.loadConfig(directory);
      const mergedConfig = { ...(existingConfig || {}), ...config };

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
    return config?.accessToken;
  }

  /**
   * Load configuration from directory (backward compatibility method)
   * @param directory Directory to look for config file
   * @returns Extended configuration or null if not found
   */
  static loadConfig(directory: string): ExtendedMetadataConfig | null {
    try {
      return this.loadHierarchicalConfigSync(directory);
    } catch (error) {
      console.warn(`Failed to load config from ${directory}:`, error);
      return null;
    }
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

    if (!config) {
      console.log("❌ No configuration found");
      return;
    }

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
   * @param directory Directory to reset config for
   * @param keepAccessToken Whether to preserve access token
   */
  static resetConfig(directory: string, keepAccessToken: boolean = true): void {
    const config: Partial<ExtendedConfig> = { ...ConfigManager.DEFAULT_CONFIG };

    if (keepAccessToken) {
      const existingConfig = ConfigManager.loadConfig(directory);
      if (existingConfig && existingConfig.accessToken) {
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