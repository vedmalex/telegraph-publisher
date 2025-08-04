import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Represents a single cache entry for a file's anchors
 */
interface AnchorCacheEntry {
  contentHash: string;
  anchors: string[];
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
  reason?: 'not-found' | 'content-changed';
}

/**
 * Manages persistent cache of file anchors for improved link verification performance.
 * Uses content hash-based invalidation to ensure cache accuracy.
 */
export class AnchorCacheManager {
  private static readonly CACHE_FILE_NAME = ".telegraph-anchors-cache.json";
  private static readonly CACHE_VERSION = "1.1.0";
  
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
        
        // Verify cache version compatibility
        if (data.version === AnchorCacheManager.CACHE_VERSION) {
          return data;
        } else {
          console.warn("⚠️ Anchor cache version mismatch, creating new cache");
        }
      } catch (error) {
        console.warn("⚠️ Could not load anchor cache, creating a new one:", error);
      }
    }

    return this.createEmptyCache();
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
   * @param filePath The absolute path to the file
   * @param currentContentHash The current hash of the file's content
   * @returns Validation result with anchors if cache is valid
   */
  public getAnchorsIfValid(filePath: string, currentContentHash: string): CacheValidationResult {
    const entry = this.cache.anchors[filePath];
    
    if (!entry) {
      return { valid: false, reason: 'not-found' };
    }
    
    if (entry.contentHash === currentContentHash) {
      return { 
        valid: true, 
        anchors: new Set(entry.anchors)
      };
    }
    
    return { valid: false, reason: 'content-changed' };
  }

  /**
   * Updates the cache with new anchors and content hash for a file.
   * @param filePath The absolute path to the file
   * @param newContentHash The new hash of the file's content
   * @param newAnchors A Set of the new anchors
   */
  public updateAnchors(filePath: string, newContentHash: string, newAnchors: Set<string>): void {
    this.cache.anchors[filePath] = {
      contentHash: newContentHash,
      anchors: Array.from(newAnchors)
    };
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