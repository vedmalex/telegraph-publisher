/**
 * Creative Enhancement: Multi-Layer Cache с Intelligent Invalidation
 * Smart configuration cache для hierarchical configuration loading
 */

import { existsSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { CachedConfig, ExtendedMetadataConfig } from '../types/metadata.js';

/**
 * Intelligent cache for hierarchical configuration with automatic invalidation
 */
export class HierarchicalConfigCache {
  private static cache = new Map<string, CachedConfig>();
  private static watchers = new Map<string, FSWatcher>();
  private static readonly CACHE_TTL_MS = 300000; // 5 minutes
  private static readonly CONFIG_FILE_NAME = '.telegraph-publisher-config.json';

  /**
   * Load configuration with intelligent caching and invalidation
   * @param startPath File or directory path to start loading from
   * @returns Cached or freshly loaded configuration
   */
  static async loadWithInvalidation(startPath: string): Promise<ExtendedMetadataConfig> {
    const cacheKey = this.normalizePath(startPath);
    const cached = this.cache.get(cacheKey);
    
    // Creative Intelligence: Check cache validity
    if (cached && await this.isCacheValid(cached, startPath)) {
      return cached.config;
    }
    
    // Load fresh config и setup file watching
    const config = await this.loadFreshConfig(startPath);
    this.setupFileWatching(startPath);
    
    return config;
  }

  /**
   * Load fresh configuration from filesystem
   * @param startPath Starting path for hierarchical search
   * @returns Loaded configuration
   */
  static async loadFreshConfig(startPath: string): Promise<ExtendedMetadataConfig> {
    const directories = this.buildDirectoryHierarchy(startPath);
    const configs: Array<{ path: string; config: ExtendedMetadataConfig }> = [];
    
    // Load configurations from root to target directory
    for (const dir of directories) {
      const configPath = join(dir, this.CONFIG_FILE_NAME);
      
      if (existsSync(configPath)) {
        try {
          const configContent = await import(`file://${configPath}`, {
            assert: { type: 'json' }
          });
          
          const config: ExtendedMetadataConfig = {
            ...configContent.default,
            lastModified: statSync(configPath).mtime.toISOString()
          };
          
          configs.push({ path: configPath, config });
          
          console.log(`📁 Loaded config: ${configPath}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load config from ${configPath}:`, error);
        }
      }
    }
    
    // Merge configurations (child overrides parent)
    let mergedConfig: ExtendedMetadataConfig = {
      autoPublishDependencies: true,
      replaceLinksinContent: true,
      maxDependencyDepth: 20,
      createBackups: false,
      manageBidirectionalLinks: true,
      autoSyncCache: true,
      rateLimiting: {
        baseDelayMs: 1500,
        adaptiveMultiplier: 2.0,
        maxDelayMs: 30000,
        backoffStrategy: 'linear',
        maxRetries: 3,
        cooldownPeriodMs: 60000,
        enableAdaptiveThrottling: true
      },
      customFields: {}
    };
    
    // Apply configurations in order (later configs override earlier ones)
    for (const { config } of configs) {
      mergedConfig = this.deepMerge(mergedConfig, config);
    }
    
    // Cache the result
    this.cacheConfig(startPath, mergedConfig, Math.max(...directories.map(dir => {
      const configPath = join(dir, this.CONFIG_FILE_NAME);
      return existsSync(configPath) ? statSync(configPath).mtimeMs : 0;
    })));
    
    return mergedConfig;
  }

  /**
   * Setup intelligent file watching for automatic cache invalidation
   * @param startPath Starting path to watch
   */
  private static setupFileWatching(startPath: string): void {
    const directories = this.buildDirectoryHierarchy(startPath);
    
    directories.forEach(dir => {
      const configPath = join(dir, this.CONFIG_FILE_NAME);
      
      if (!this.watchers.has(configPath)) {
        try {
          // Watch for file changes and directory changes
          const watcher = watch(dir, { persistent: false }, (eventType, filename) => {
            if (filename === this.CONFIG_FILE_NAME) {
              this.invalidateCache(startPath);
              console.log(`🔄 Config cache invalidated: ${configPath} ${eventType}`);
            }
          });
          
          this.watchers.set(configPath, watcher);
          
          // Also watch the specific config file if it exists
          if (existsSync(configPath)) {
            const fileWatcher = watch(configPath, { persistent: false }, () => {
              this.invalidateCache(startPath);
              console.log(`🔄 Config file changed: ${configPath}`);
            });
            
            this.watchers.set(`${configPath}:file`, fileWatcher);
          }
          
        } catch (error) {
          console.warn(`⚠️ Failed to setup file watching for ${configPath}:`, error);
        }
      }
    });
  }

  /**
   * Check if cached configuration is still valid
   * @param cached Cached configuration entry
   * @param startPath Original start path
   * @returns true if cache is valid
   */
  private static async isCacheValid(cached: CachedConfig, startPath: string): Promise<boolean> {
    // Check TTL
    if (Date.now() - cached.cachedAt > this.CACHE_TTL_MS) {
      return false;
    }
    
    // Check if any config files have been modified
    const directories = this.buildDirectoryHierarchy(startPath);
    
    for (const dir of directories) {
      const configPath = join(dir, this.CONFIG_FILE_NAME);
      
      if (existsSync(configPath)) {
        const stat = statSync(configPath);
        
        if (stat.mtimeMs > cached.modifiedTime) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Build directory hierarchy from target path to filesystem root
   * @param startPath Starting file or directory path
   * @returns Array of directories from root to target
   */
  private static buildDirectoryHierarchy(startPath: string): string[] {
    const resolvedPath = resolve(startPath);
    const targetDir = statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath);
    
    const directories: string[] = [];
    let currentDir = targetDir;
    
    // Build path from target up to root
    while (currentDir !== dirname(currentDir)) {
      directories.unshift(currentDir); // Add to beginning for root-to-target order
      currentDir = dirname(currentDir);
    }
    
    // Add root directory
    directories.unshift(currentDir);
    
    return directories;
  }

  /**
   * Cache configuration for future use
   * @param startPath Original start path
   * @param config Configuration to cache
   * @param modifiedTime Latest modification time of source files
   */
  private static cacheConfig(
    startPath: string, 
    config: ExtendedMetadataConfig, 
    modifiedTime: number
  ): void {
    const cacheKey = this.normalizePath(startPath);
    
    this.cache.set(cacheKey, {
      config,
      filePath: cacheKey,
      modifiedTime,
      cachedAt: Date.now()
    });
  }

  /**
   * Invalidate cache for given path and all dependent paths
   * @param startPath Path to invalidate
   */
  private static invalidateCache(startPath: string): void {
    const cacheKey = this.normalizePath(startPath);
    
    // Remove exact match
    this.cache.delete(cacheKey);
    
    // Remove all cache entries that could be affected by this path
    for (const [key] of this.cache) {
      if (key.startsWith(cacheKey) || cacheKey.startsWith(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Normalize path for consistent cache keys
   * @param path File or directory path
   * @returns Normalized path
   */
  private static normalizePath(path: string): string {
    return resolve(path);
  }

  /**
   * Deep merge configuration objects
   * @param target Target configuration
   * @param source Source configuration to merge
   * @returns Merged configuration
   */
  private static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const [key, sourceValue] of Object.entries(source)) {
      if (sourceValue === undefined) continue;
      
      const targetValue = result[key];
      
      if (this.isObject(targetValue) && this.isObject(sourceValue)) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
    
    return result;
  }

  /**
   * Check if value is a plain object
   * @param value Value to check
   * @returns true if value is a plain object
   */
  private static isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Clear all cached configurations and stop file watchers
   */
  static clearCache(): void {
    // Stop all file watchers
    for (const [path, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        console.warn(`Failed to close watcher for ${path}:`, error);
      }
    }
    
    this.watchers.clear();
    this.cache.clear();
    
    console.log('🧹 Configuration cache cleared');
  }

  /**
   * Get cache statistics for debugging
   * @returns Cache statistics
   */
  static getCacheStats(): {
    entries: number;
    watchers: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const entries = Array.from(this.cache.values());
    
    return {
      entries: entries.length,
      watchers: this.watchers.size,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.cachedAt)) : null,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.cachedAt)) : null
    };
  }
} 