import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Represents a single cache entry for a file's anchors
 */
interface AnchorCacheEntry {
  contentHash: string;
  anchors: string[];
  mtime: string; // File modification time for timestamp-based validation
}

/**
 * Structure of the anchor cache data file
 */
interface AnchorCacheData {
  version: string;
  createdAt: string;
  anchors: Record<string, AnchorCacheEntry>;
}

/**
 * Result of cache validation check
 */
interface CacheValidationResult {
  valid: boolean;
  anchors?: Set<string>;
  reason?: 'not-found' | 'content-changed' | 'timestamp-changed';
}

/**
 * Manages persistent cache of file anchors for improved link verification performance.
 * Uses timestamp + content hash-based invalidation to ensure cache accuracy.
 */
export class AnchorCacheManager {
  private static readonly CACHE_FILE_NAME = ".telegraph-anchors-cache.json";
  private static readonly CACHE_VERSION = "1.2.0"; // Updated for mtime support
  
  private cache: AnchorCacheData;
  private cacheFilePath: string;

  constructor(directory: string) {
    this.cacheFilePath = join(directory, AnchorCacheManager.CACHE_FILE_NAME);
    this.cache = this.loadCache();
  }

  /**
   * Load cache from file or create new empty cache
   * @returns Loaded cache data or new empty cache
   */
  private loadCache(): AnchorCacheData {
    if (existsSync(this.cacheFilePath)) {
      try {
        const data = JSON.parse(readFileSync(this.cacheFilePath, "utf-8"));
        
        // Handle current version
        if (data.version === AnchorCacheManager.CACHE_VERSION) {
          return data;
        } 
        
        // Handle backward compatibility with v1.1.0 (missing mtime)
        if (data.version === "1.1.0") {
          console.log("🔄 Migrating anchor cache from v1.1.0 to v1.2.0...");
          return this.migrateFromV11(data);
        }
        
        // Handle other versions
        console.warn(`⚠️ Anchor cache version ${data.version || 'unknown'} not supported, creating new cache`);
        
      } catch (error) {
        console.warn("⚠️ Could not load anchor cache, creating a new one:", error);
      }
    }

    return this.createEmptyCache();
  }

  /**
   * Migrate cache from v1.1.0 to v1.2.0 by adding mtime fields
   * @param oldData Old cache data from v1.1.0
   * @returns Migrated cache data for v1.2.0
   */
  private migrateFromV11(oldData: any): AnchorCacheData {
    const migratedCache: AnchorCacheData = {
      version: AnchorCacheManager.CACHE_VERSION,
      createdAt: oldData.createdAt || new Date().toISOString(),
      anchors: {}
    };

    // Migrate each anchor entry by adding mtime field
    for (const [filePath, entry] of Object.entries(oldData.anchors || {})) {
      const oldEntry = entry as { contentHash: string; anchors: string[] };
      
      // Try to get current mtime, fallback to current time if file doesn't exist
      let mtime: string;
      try {
        const { statSync } = require("node:fs");
        mtime = statSync(filePath).mtime.toISOString();
      } catch {
        // File doesn't exist or can't be accessed, use current time
        mtime = new Date().toISOString();
      }

      migratedCache.anchors[filePath] = {
        contentHash: oldEntry.contentHash,
        anchors: oldEntry.anchors,
        mtime: mtime
      };
    }

    console.log(`✅ Successfully migrated ${Object.keys(migratedCache.anchors).length} cache entries`);
    return migratedCache;
  }

  /**
   * Create empty cache structure
   * @returns Empty cache data
   */
  private createEmptyCache(): AnchorCacheData {
    return {
      version: AnchorCacheManager.CACHE_VERSION,
      createdAt: new Date().toISOString(),
      anchors: {}
    };
  }

  /**
   * Save cache to file system
   */
  public saveCache(): void {
    try {
      writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (error) {
      console.error("❌ Error saving anchor cache:", error);
    }
  }

  /**
   * Retrieves anchors from cache if content hash matches current content.
   * Uses timestamp-first validation for optimal performance.
   * @param filePath The absolute path to the file
   * @param currentContentHash The current hash of the file's content
   * @returns Validation result with anchors if cache is valid
   */
  public getAnchorsIfValid(filePath: string, currentContentHash: string): CacheValidationResult {
    const entry = this.cache.anchors[filePath];
    
    if (!entry) {
      return { valid: false, reason: 'not-found' };
    }
    
    // STAGE 1: Fast timestamp check (primary validation)
    try {
      const { statSync } = require("node:fs");
      const currentMtime = statSync(filePath).mtime.toISOString();
      
      // If mtime field exists and timestamps differ, cache is invalid
      if (entry.mtime && entry.mtime !== currentMtime) {
        return { valid: false, reason: 'timestamp-changed' };
      }
      
      // STAGE 2: Hash check (secondary validation) 
      if (entry.contentHash === currentContentHash) {
        return { 
          valid: true, 
          anchors: new Set(entry.anchors)
        };
      }
      
      return { valid: false, reason: 'content-changed' };
      
    } catch (error) {
      // Fallback to hash-only validation if timestamp read fails
      if (entry.contentHash === currentContentHash) {
        return { 
          valid: true, 
          anchors: new Set(entry.anchors)
        };
      }
      
      return { valid: false, reason: 'content-changed' };
    }
  }

  /**
   * Updates the cache with new anchors and content hash for a file.
   * @param filePath The absolute path to the file
   * @param newContentHash The new hash of the file's content
   * @param newAnchors A Set of the new anchors
   */
  public updateAnchors(filePath: string, newContentHash: string, newAnchors: Set<string>): void {
    try {
      const { statSync } = require("node:fs");
      const currentMtime = statSync(filePath).mtime.toISOString();
      
      this.cache.anchors[filePath] = {
        contentHash: newContentHash,
        anchors: Array.from(newAnchors),
        mtime: currentMtime
      };
    } catch (error) {
      // Fallback: create entry without mtime if file stat fails
      this.cache.anchors[filePath] = {
        contentHash: newContentHash,
        anchors: Array.from(newAnchors),
        mtime: new Date().toISOString() // Use current time as fallback
      };
    }
  }

  /**
   * Get cache statistics for monitoring and debugging
   * @returns Object with cache statistics
   */
  public getCacheStats(): { totalFiles: number; cacheSize: string } {
    const totalFiles = Object.keys(this.cache.anchors).length;
    const cacheSize = JSON.stringify(this.cache).length;
    
    return {
      totalFiles,
      cacheSize: `${Math.round(cacheSize / 1024)}KB`
    };
  }

  /**
   * Clear cache entries for files that no longer exist
   * @param existingFiles Array of file paths that still exist
   */
  public cleanupStaleEntries(existingFiles: string[]): void {
    const existingSet = new Set(existingFiles);
    const staleEntries: string[] = [];
    
    for (const filePath of Object.keys(this.cache.anchors)) {
      if (!existingSet.has(filePath)) {
        staleEntries.push(filePath);
      }
    }
    
    staleEntries.forEach(filePath => {
      delete this.cache.anchors[filePath];
    });
    
    if (staleEntries.length > 0) {
      console.log(`🧹 Cleaned up ${staleEntries.length} stale anchor cache entries`);
    }
  }
}