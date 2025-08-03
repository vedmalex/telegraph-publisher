import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TelegraphPublisher } from "../telegraphPublisher";
import type { PublishedPageInfo, PublishedPagesCache } from "../types/metadata";

/**
 * Manages cache of published pages for bidirectional link management
 */
export class PagesCacheManager {
  private static readonly CACHE_FILE_NAME = ".telegraph-pages-cache.json";
  private static readonly CACHE_VERSION = "1.0.0";

  private cache: PublishedPagesCache;
  private cacheFilePath: string;
  private accessTokenHash: string;

  constructor(directory: string, accessToken: string) {
    this.cacheFilePath = join(directory, PagesCacheManager.CACHE_FILE_NAME);
    this.accessTokenHash = this.hashAccessToken(accessToken);
    this.cache = this.loadCache();
  }

  /**
   * Load cache from file or create new one
   * @returns Loaded or new cache
   */
  private loadCache(): PublishedPagesCache {
    if (existsSync(this.cacheFilePath)) {
      try {
        const cacheData = JSON.parse(readFileSync(this.cacheFilePath, "utf-8"));

        // Verify cache version and access token
        if (cacheData.version === PagesCacheManager.CACHE_VERSION &&
          cacheData.accessTokenHash === this.accessTokenHash) {
          return cacheData;
        } else {
          console.warn("⚠️ Cache version or access token mismatch, creating new cache");
        }
      } catch (error) {
        console.warn("⚠️ Error loading cache, creating new cache:", error);
      }
    }

    return this.createEmptyCache();
  }

  /**
   * Create empty cache structure
   * @returns Empty cache
   */
  private createEmptyCache(): PublishedPagesCache {
    return {
      version: PagesCacheManager.CACHE_VERSION,
      lastUpdated: new Date().toISOString(),
      accessTokenHash: this.accessTokenHash,
      pages: {},
      localToTelegraph: {},
      telegraphToLocal: {}
    };
  }

  /**
   * Save cache to file
   */
  private saveCache(): void {
    try {
      this.cache.lastUpdated = new Date().toISOString();
      writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (error) {
      console.error("❌ Error saving cache:", error);
    }
  }

  /**
   * Hash access token for verification
   * @param accessToken Access token to hash
   * @returns Hashed token
   */
  private hashAccessToken(accessToken: string): string {
    return createHash('sha256').update(accessToken).digest('hex').substring(0, 16);
  }

  /**
   * Sync cache with Telegraph API
   * @param publisher Telegraph publisher instance
   * @returns Success status
   */
  async syncWithTelegraph(publisher: TelegraphPublisher): Promise<boolean> {
    try {
      console.log("🔄 Syncing published pages cache...");

      let offset = 0;
      const limit = 50;
      let hasMore = true;
      let totalSynced = 0;

      while (hasMore) {
        const pageList = await publisher.listPages(offset, limit);

        for (const page of pageList.pages) {
          const pageInfo: PublishedPageInfo = {
            telegraphUrl: page.url,
            editPath: page.path,
            title: page.title,
            authorName: page.author_name || "Unknown",
            publishedAt: new Date().toISOString(), // Telegraph API doesn't provide creation date
            lastUpdated: new Date().toISOString(),
            views: page.views
          };

          this.addPage(pageInfo);
          totalSynced++;
        }

        hasMore = pageList.pages.length === limit;
        offset += limit;
      }

      this.saveCache();
      console.log(`✅ Synced ${totalSynced} published pages`);
      return true;
    } catch (error) {
      console.error("❌ Error syncing with Telegraph:", error);
      return false;
    }
  }

  /**
   * Add page to cache
   * @param pageInfo Page information to add
   */
  addPage(pageInfo: PublishedPageInfo): void {
    this.cache.pages[pageInfo.telegraphUrl] = pageInfo;

    if (pageInfo.localFilePath) {
      this.cache.localToTelegraph[pageInfo.localFilePath] = pageInfo.telegraphUrl;
      this.cache.telegraphToLocal[pageInfo.telegraphUrl] = pageInfo.localFilePath;
    }

    // Save cache after adding page
    this.saveCache();
  }

  /**
   * Update page in cache
   * @param telegraphUrl Telegraph URL
   * @param updates Updates to apply
   */
  updatePage(telegraphUrl: string, updates: Partial<PublishedPageInfo>): void {
    const existingPage = this.cache.pages[telegraphUrl];
    if (existingPage) {
      const updatedPage = { ...existingPage, ...updates, lastUpdated: new Date().toISOString() };
      this.cache.pages[telegraphUrl] = updatedPage;

      // Update mappings if local file path changed
      if (updates.localFilePath) {
        // Remove old mapping if exists
        if (existingPage.localFilePath) {
          delete this.cache.localToTelegraph[existingPage.localFilePath];
        }

        // Add new mapping
        this.cache.localToTelegraph[updates.localFilePath] = telegraphUrl;
        this.cache.telegraphToLocal[telegraphUrl] = updates.localFilePath;
      }

      this.saveCache();
    }
  }

  /**
   * Remove page from cache
   * @param telegraphUrl Telegraph URL to remove
   */
  removePage(telegraphUrl: string): void {
    const page = this.cache.pages[telegraphUrl];
    if (page) {
      delete this.cache.pages[telegraphUrl];

      if (page.localFilePath) {
        delete this.cache.localToTelegraph[page.localFilePath];
      }
      delete this.cache.telegraphToLocal[telegraphUrl];

      this.saveCache();
    }
  }

  /**
   * Get page by Telegraph URL
   * @param telegraphUrl Telegraph URL
   * @returns Page info if found
   */
  getPageByUrl(telegraphUrl: string): PublishedPageInfo | null {
    return this.cache.pages[telegraphUrl] || null;
  }

  /**
   * Get page by local file path
   * @param localFilePath Local file path
   * @returns Page info if found
   */
  getPageByLocalPath(localFilePath: string): PublishedPageInfo | null {
    const telegraphUrl = this.cache.localToTelegraph[localFilePath];
    return telegraphUrl ? (this.cache.pages[telegraphUrl] || null) : null;
  }

  /**
   * Get Telegraph URL by local file path
   * @param localFilePath Local file path
   * @returns Telegraph URL if found
   */
  getTelegraphUrl(localFilePath: string): string | null {
    return this.cache.localToTelegraph[localFilePath] || null;
  }

  /**
   * Get local file path by Telegraph URL
   * @param telegraphUrl Telegraph URL
   * @returns Local file path if found
   */
  getLocalPath(telegraphUrl: string): string | null {
    return this.cache.telegraphToLocal[telegraphUrl] || null;
  }

  /**
   * Check if Telegraph URL belongs to our published pages
   * @param telegraphUrl Telegraph URL to check
   * @returns True if this is our page
   */
  isOurPage(telegraphUrl: string): boolean {
    return telegraphUrl in this.cache.pages;
  }

  /**
   * Get all published pages
   * @returns Array of all published pages
   */
  getAllPages(): PublishedPageInfo[] {
    return Object.values(this.cache.pages);
  }

  /**
   * Get all local file paths that are published
   * @returns Array of local file paths
   */
  getPublishedLocalPaths(): string[] {
    return Object.keys(this.cache.localToTelegraph);
  }

  /**
   * Get all Telegraph URLs we have published
   * @returns Array of Telegraph URLs
   */
  getPublishedTelegraphUrls(): string[] {
    return Object.keys(this.cache.pages);
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getStats(): {
    totalPages: number;
    pagesWithLocalPaths: number;
    lastUpdated: string;
    cacheAge: string;
  } {
    const totalPages = Object.keys(this.cache.pages).length;
    const pagesWithLocalPaths = Object.keys(this.cache.localToTelegraph).length;
    const lastUpdated = this.cache.lastUpdated;
    const cacheAge = this.formatTimeDiff(new Date(lastUpdated), new Date());

    return {
      totalPages,
      pagesWithLocalPaths,
      lastUpdated,
      cacheAge
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache = this.createEmptyCache();
    this.saveCache();
  }

  /**
   * Export cache data
   * @returns Cache data
   */
  export(): PublishedPagesCache {
    return { ...this.cache };
  }

  /**
   * Import cache data
   * @param cacheData Cache data to import
   */
  import(cacheData: PublishedPagesCache): void {
    this.cache = cacheData;
    this.cache.accessTokenHash = this.accessTokenHash;
    this.saveCache();
  }

  /**
   * Format time difference
   * @param from From date
   * @param to To date
   * @returns Formatted time difference
   */
  private formatTimeDiff(from: Date, to: Date): string {
    const diffMs = to.getTime() - from.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }
}