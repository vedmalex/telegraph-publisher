import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { TelegraphPublisher } from "../telegraphPublisher";
import { TestHelpers } from "../test-utils/TestHelpers";
import { PagesCacheManager } from "./PagesCacheManager";

describe("PagesCacheManager", () => {
  let tempDir: string;
  let cacheManager: PagesCacheManager;
  let mockPublisher: TelegraphPublisher;

  beforeEach(() => {
    tempDir = TestHelpers.createTempDir("cache-manager-test");
    cacheManager = new PagesCacheManager(tempDir, "test-access-token-123");
    mockPublisher = new TelegraphPublisher();
  });

  afterEach(() => {
    TestHelpers.cleanup();
  });

  describe("constructor and initialization", () => {
    it("should create cache manager with empty cache", () => {
      const stats = cacheManager.getStats();
      expect(stats.totalPages).toBe(0);
      expect(stats.pagesWithLocalPaths).toBe(0);
    });

    it("should create cache file when data is saved", () => {
      const pageInfo = TestHelpers.createSamplePageInfo();
      cacheManager.addPage(pageInfo);
      cacheManager.updatePage(pageInfo.telegraphUrl, { views: 100 }); // This triggers save

      const cacheFilePath = join(tempDir, ".telegraph-pages-cache.json");
      expect(TestHelpers.fileExists(cacheFilePath)).toBe(true);
    });
  });

  describe("addPage", () => {
    it("should add page to cache", () => {
      const pageInfo = TestHelpers.createSamplePageInfo();

      cacheManager.addPage(pageInfo);

      const retrieved = cacheManager.getPageByUrl(pageInfo.telegraphUrl);
      expect(retrieved).toEqual(pageInfo);
    });

    it("should create bidirectional mapping when local path provided", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: join(tempDir, "test.md")
      });

      cacheManager.addPage(pageInfo);

      expect(cacheManager.getTelegraphUrl(pageInfo.localFilePath!)).toBe(pageInfo.telegraphUrl);
      expect(cacheManager.getLocalPath(pageInfo.telegraphUrl)).toBe(pageInfo.localFilePath!);
    });

    it("should handle page without local path", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: undefined
      });

      cacheManager.addPage(pageInfo);

      const retrieved = cacheManager.getPageByUrl(pageInfo.telegraphUrl);
      expect(retrieved).toEqual(pageInfo);
      expect(cacheManager.getLocalPath(pageInfo.telegraphUrl)).toBeNull();
    });
  });

  describe("updatePage", () => {
    it("should update existing page", () => {
      const pageInfo = TestHelpers.createSamplePageInfo();
      cacheManager.addPage(pageInfo);

      const updates = {
        title: "Updated Title",
        views: 100
      };

      cacheManager.updatePage(pageInfo.telegraphUrl, updates);

      const updated = cacheManager.getPageByUrl(pageInfo.telegraphUrl);
      expect(updated?.title).toBe("Updated Title");
      expect(updated?.views).toBe(100);
      expect(updated?.authorName).toBe(pageInfo.authorName); // Unchanged
    });

    it("should update local file path mapping", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: join(tempDir, "old.md")
      });
      cacheManager.addPage(pageInfo);

      const newLocalPath = join(tempDir, "new.md");
      cacheManager.updatePage(pageInfo.telegraphUrl, {
        localFilePath: newLocalPath
      });

      expect(cacheManager.getLocalPath(pageInfo.telegraphUrl)).toBe(newLocalPath);
      expect(cacheManager.getTelegraphUrl(newLocalPath)).toBe(pageInfo.telegraphUrl);
      expect(cacheManager.getTelegraphUrl(pageInfo.localFilePath!)).toBeNull();
    });

    it("should not update non-existent page", () => {
      cacheManager.updatePage("https://telegra.ph/Non-Existent", { title: "New Title" });

      const page = cacheManager.getPageByUrl("https://telegra.ph/Non-Existent");
      expect(page).toBeNull();
    });
  });

  describe("removePage", () => {
    it("should remove page from cache", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: join(tempDir, "test.md")
      });
      cacheManager.addPage(pageInfo);

      cacheManager.removePage(pageInfo.telegraphUrl);

      expect(cacheManager.getPageByUrl(pageInfo.telegraphUrl)).toBeNull();
      expect(cacheManager.getLocalPath(pageInfo.telegraphUrl)).toBeNull();
      expect(cacheManager.getTelegraphUrl(pageInfo.localFilePath!)).toBeNull();
    });

    it("should handle removal of non-existent page", () => {
      cacheManager.removePage("https://telegra.ph/Non-Existent");
      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe("getPageByLocalPath", () => {
    it("should retrieve page by local file path", () => {
      const localPath = join(tempDir, "test.md");
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: localPath
      });
      cacheManager.addPage(pageInfo);

      const retrieved = cacheManager.getPageByLocalPath(localPath);
      expect(retrieved).toEqual(pageInfo);
    });

    it("should return null for unmapped local path", () => {
      const result = cacheManager.getPageByLocalPath(join(tempDir, "unmapped.md"));
      expect(result).toBeNull();
    });
  });

  describe("isOurPage", () => {
    it("should return true for cached pages", () => {
      const pageInfo = TestHelpers.createSamplePageInfo();
      cacheManager.addPage(pageInfo);

      expect(cacheManager.isOurPage(pageInfo.telegraphUrl)).toBe(true);
    });

    it("should return false for unknown pages", () => {
      expect(cacheManager.isOurPage("https://telegra.ph/Unknown")).toBe(false);
    });
  });

  describe("getAllPages", () => {
    it("should return all cached pages", () => {
      const page1 = TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-1"
      });
      const page2 = TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-2"
      });

      cacheManager.addPage(page1);
      cacheManager.addPage(page2);

      const allPages = cacheManager.getAllPages();
      expect(allPages).toHaveLength(2);
      expect(allPages).toContainEqual(page1);
      expect(allPages).toContainEqual(page2);
    });

    it("should return empty array for empty cache", () => {
      const allPages = cacheManager.getAllPages();
      expect(allPages).toHaveLength(0);
    });
  });

  describe("getPublishedLocalPaths", () => {
    it("should return local paths that are published", () => {
      const path1 = join(tempDir, "file1.md");
      const path2 = join(tempDir, "file2.md");

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-1",
        localFilePath: path1
      }));

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-2",
        localFilePath: path2
      }));

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-3",
        localFilePath: undefined // No local path
      }));

      const localPaths = cacheManager.getPublishedLocalPaths();
      expect(localPaths).toHaveLength(2);
      expect(localPaths).toContain(path1);
      expect(localPaths).toContain(path2);
    });
  });

  describe("getPublishedTelegraphUrls", () => {
    it("should return all Telegraph URLs", () => {
      const url1 = "https://telegra.ph/Page-1";
      const url2 = "https://telegra.ph/Page-2";

      cacheManager.addPage(TestHelpers.createSamplePageInfo({ telegraphUrl: url1 }));
      cacheManager.addPage(TestHelpers.createSamplePageInfo({ telegraphUrl: url2 }));

      const urls = cacheManager.getPublishedTelegraphUrls();
      expect(urls).toHaveLength(2);
      expect(urls).toContain(url1);
      expect(urls).toContain(url2);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-1",
        localFilePath: join(tempDir, "file1.md")
      }));

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-2",
        localFilePath: undefined
      }));

      const stats = cacheManager.getStats();
      expect(stats.totalPages).toBe(2);
      expect(stats.pagesWithLocalPaths).toBe(1);
      expect(stats.lastUpdated).toBeDefined();
      expect(stats.cacheAge).toBeDefined();
    });
  });

  describe("clear", () => {
    it("should clear all cache data", () => {
      cacheManager.addPage(TestHelpers.createSamplePageInfo());
      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Page-2"
      }));

      cacheManager.clear();

      const stats = cacheManager.getStats();
      expect(stats.totalPages).toBe(0);
      expect(stats.pagesWithLocalPaths).toBe(0);
    });
  });

  describe("export and import", () => {
    it("should export and import cache data", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: join(tempDir, "test.md")
      });
      cacheManager.addPage(pageInfo);

      const exported = cacheManager.export();

      const newTempDir = TestHelpers.createTempDir("cache-import-test");
      const newCacheManager = new PagesCacheManager(newTempDir, "test-access-token-123");
      newCacheManager.import(exported);

      const imported = newCacheManager.getPageByUrl(pageInfo.telegraphUrl);
      expect(imported).toEqual(pageInfo);
      expect(newCacheManager.getTelegraphUrl(pageInfo.localFilePath!)).toBe(pageInfo.telegraphUrl);
    });
  });

  describe("persistence", () => {
    it("should persist cache across instances", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: join(tempDir, "test.md")
      });
      cacheManager.addPage(pageInfo);

      // Force save by updating the page
      cacheManager.updatePage(pageInfo.telegraphUrl, { views: 100 });

      // Create new instance with same directory
      const newCacheManager = new PagesCacheManager(tempDir, "test-access-token-123");

      const retrieved = newCacheManager.getPageByUrl(pageInfo.telegraphUrl);
      expect(retrieved?.telegraphUrl).toBe(pageInfo.telegraphUrl);
      expect(retrieved?.localFilePath).toBe(pageInfo.localFilePath!);
      expect(retrieved?.title).toBe(pageInfo.title);
    });

    it("should create new cache for different access token", () => {
      const pageInfo = TestHelpers.createSamplePageInfo();
      cacheManager.addPage(pageInfo);

      // Create new instance with different token
      const newCacheManager = new PagesCacheManager(tempDir, "different-token");

      const stats = newCacheManager.getStats();
      expect(stats.totalPages).toBe(0);
    });
  });

  describe("syncWithTelegraph", () => {
    it("should sync pages from Telegraph API", async () => {
      // Mock the publisher.listPages method
      const mockPages = [
        {
          path: "test-page-01-01",
          url: "https://telegra.ph/test-page-01-01",
          title: "Test Page 1",
          author_name: "Test Author",
          views: 100
        },
        {
          path: "test-page-01-02",
          url: "https://telegra.ph/test-page-01-02",
          title: "Test Page 2",
          author_name: "Test Author",
          views: 50
        }
      ];

      mockPublisher.listPages = async (offset: number, limit: number) => {
        if (offset === 0) {
          return { pages: mockPages, total_count: mockPages.length };
        }
        return { pages: [], total_count: 0 };
      };

      const success = await cacheManager.syncWithTelegraph(mockPublisher);

      expect(success).toBe(true);
      expect(cacheManager.getAllPages()).toHaveLength(2);
      expect(cacheManager.getPageByUrl("https://telegra.ph/test-page-01-01")).toBeTruthy();
      expect(cacheManager.getPageByUrl("https://telegra.ph/test-page-01-02")).toBeTruthy();
    });

    it("should handle sync errors gracefully", async () => {
      // Mock the publisher to throw an error
      mockPublisher.listPages = async () => {
        throw new Error("API Error");
      };

      const success = await cacheManager.syncWithTelegraph(mockPublisher);

      expect(success).toBe(false);
      expect(cacheManager.getAllPages()).toHaveLength(0);
    });

    it("should handle pagination correctly", async () => {
      // Mock paginated response
      const firstBatch = Array.from({ length: 50 }, (_, i) => ({
        path: `page-${i}-01-01`,
        url: `https://telegra.ph/page-${i}-01-01`,
        title: `Page ${i}`,
        author_name: "Test Author",
        views: i * 10
      }));

      const secondBatch = Array.from({ length: 25 }, (_, i) => ({
        path: `page-${i + 50}-01-01`,
        url: `https://telegra.ph/page-${i + 50}-01-01`,
        title: `Page ${i + 50}`,
        author_name: "Test Author",
        views: (i + 50) * 10
      }));

      mockPublisher.listPages = async (offset: number, limit: number) => {
        if (offset === 0) {
          return { pages: firstBatch, total_count: 75 };
        } else if (offset === 50) {
          return { pages: secondBatch, total_count: 75 };
        }
        return { pages: [], total_count: 0 };
      };

      const success = await cacheManager.syncWithTelegraph(mockPublisher);

      expect(success).toBe(true);
      expect(cacheManager.getAllPages()).toHaveLength(75);
    });
  });

  describe("edge cases", () => {
    it("should handle very long URLs", () => {
      const longUrl = "https://telegra.ph/" + "a".repeat(1000);
      const pageInfo = TestHelpers.createSamplePageInfo({
        telegraphUrl: longUrl
      });

      cacheManager.addPage(pageInfo);

      const retrieved = cacheManager.getPageByUrl(longUrl);
      expect(retrieved).toEqual(pageInfo);
    });

    it("should handle special characters in URLs", () => {
      const specialUrl = "https://telegra.ph/Статья-с-русскими-буквами-01-01";
      const pageInfo = TestHelpers.createSamplePageInfo({
        telegraphUrl: specialUrl
      });

      cacheManager.addPage(pageInfo);

      const retrieved = cacheManager.getPageByUrl(specialUrl);
      expect(retrieved).toEqual(pageInfo);
    });

    it("should handle very long file paths", () => {
      const longPath = join(tempDir, "very", "long", "nested", "path", "to", "file.md");
      const pageInfo = TestHelpers.createSamplePageInfo({
        localFilePath: longPath
      });

      cacheManager.addPage(pageInfo);

      expect(cacheManager.getTelegraphUrl(longPath)).toBe(pageInfo.telegraphUrl);
    });

    it("should handle empty titles and descriptions", () => {
      const pageInfo = TestHelpers.createSamplePageInfo({
        title: "",
        authorName: ""
      });

      cacheManager.addPage(pageInfo);

      const retrieved = cacheManager.getPageByUrl(pageInfo.telegraphUrl);
      expect(retrieved?.title).toBe("");
      expect(retrieved?.authorName).toBe("");
    });
  });
});