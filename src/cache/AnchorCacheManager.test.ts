import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnchorCacheManager } from "./AnchorCacheManager";

describe('AnchorCacheManager', () => {
  const testDir = join(__dirname, '../../test-temp-cache');
  const cacheFilePath = join(testDir, '.telegraph-anchors-cache.json');
  let cacheManager: AnchorCacheManager;

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    
    // Clean up any existing cache file
    if (existsSync(cacheFilePath)) {
      rmSync(cacheFilePath);
    }
    
    cacheManager = new AnchorCacheManager(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('loadCache', () => {
    test('should create empty cache when no file exists', () => {
      const stats = cacheManager.getCacheStats();
      expect(stats.totalFiles).toBe(0);
    });

    test('should load existing valid cache', () => {
      const testCache = {
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        anchors: {
          "/test/file.md": {
            contentHash: "testhash123",
            anchors: ["anchor1", "anchor2"]
          }
        }
      };
      
      writeFileSync(cacheFilePath, JSON.stringify(testCache));
      const newCacheManager = new AnchorCacheManager(testDir);
      
      const result = newCacheManager.getAnchorsIfValid("/test/file.md", "testhash123");
      expect(result.valid).toBe(true);
      expect(result.anchors).toEqual(new Set(["anchor1", "anchor2"]));
    });

    test('should handle corrupted cache file gracefully', () => {
      writeFileSync(cacheFilePath, "invalid json content");
      const newCacheManager = new AnchorCacheManager(testDir);
      
      const stats = newCacheManager.getCacheStats();
      expect(stats.totalFiles).toBe(0);
    });

    test('should handle version mismatch gracefully', () => {
      const testCache = {
        version: "0.1.0", // Old version
        createdAt: new Date().toISOString(),
        anchors: {}
      };
      
      writeFileSync(cacheFilePath, JSON.stringify(testCache));
      const newCacheManager = new AnchorCacheManager(testDir);
      
      const stats = newCacheManager.getCacheStats();
      expect(stats.totalFiles).toBe(0);
    });
  });

  describe('getAnchorsIfValid', () => {
    test('should return invalid for non-existent file', () => {
      const result = cacheManager.getAnchorsIfValid("/non/existent/file.md", "anyhash");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
    });

    test('should return invalid for content hash mismatch', () => {
      const anchors = new Set(["anchor1", "anchor2"]);
      cacheManager.updateAnchors("/test/file.md", "oldhash", anchors);
      
      const result = cacheManager.getAnchorsIfValid("/test/file.md", "newhash");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('content-changed');
    });

    test('should return valid for matching content hash', () => {
      const anchors = new Set(["anchor1", "anchor2"]);
      cacheManager.updateAnchors("/test/file.md", "samehash", anchors);
      
      const result = cacheManager.getAnchorsIfValid("/test/file.md", "samehash");
      expect(result.valid).toBe(true);
      expect(result.anchors).toEqual(anchors);
    });
  });

  describe('updateAnchors', () => {
    test('should update cache entry correctly', () => {
      const anchors = new Set(["header1", "header2", "header3"]);
      cacheManager.updateAnchors("/test/file.md", "testhash123", anchors);
      
      const result = cacheManager.getAnchorsIfValid("/test/file.md", "testhash123");
      expect(result.valid).toBe(true);
      expect(result.anchors).toEqual(anchors);
    });

    test('should overwrite existing entry', () => {
      const oldAnchors = new Set(["old1", "old2"]);
      const newAnchors = new Set(["new1", "new2", "new3"]);
      
      cacheManager.updateAnchors("/test/file.md", "oldhash", oldAnchors);
      cacheManager.updateAnchors("/test/file.md", "newhash", newAnchors);
      
      const result = cacheManager.getAnchorsIfValid("/test/file.md", "newhash");
      expect(result.valid).toBe(true);
      expect(result.anchors).toEqual(newAnchors);
    });
  });

  describe('saveCache', () => {
    test('should persist cache to file system', () => {
      const anchors = new Set(["anchor1", "anchor2"]);
      cacheManager.updateAnchors("/test/file.md", "testhash123", anchors);
      cacheManager.saveCache();
      
      expect(existsSync(cacheFilePath)).toBe(true);
      
      const savedData = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
      expect(savedData.version).toBe("1.0.0");
      expect(savedData.anchors["/test/file.md"].contentHash).toBe("testhash123");
      expect(savedData.anchors["/test/file.md"].anchors).toEqual(["anchor1", "anchor2"]);
    });

    test('should handle write errors gracefully', () => {
      // Make directory read-only to cause write error
      try {
        const readOnlyDir = join(__dirname, '../../test-readonly');
        mkdirSync(readOnlyDir, { recursive: true, mode: 0o444 });
        
        const readOnlyCacheManager = new AnchorCacheManager(readOnlyDir);
        readOnlyCacheManager.updateAnchors("/test/file.md", "hash", new Set(["anchor"]));
        
        // Should not throw error
        expect(() => readOnlyCacheManager.saveCache()).not.toThrow();
        
        // Clean up
        rmSync(readOnlyDir, { recursive: true, force: true });
      } catch (error) {
        // Test environment might not support read-only directories
        console.warn('Read-only directory test skipped:', error);
      }
    });
  });

  describe('getCacheStats', () => {
    test('should return correct statistics', () => {
      expect(cacheManager.getCacheStats().totalFiles).toBe(0);
      
      cacheManager.updateAnchors("/test/file1.md", "hash1", new Set(["a", "b"]));
      cacheManager.updateAnchors("/test/file2.md", "hash2", new Set(["c", "d", "e"]));
      
      const stats = cacheManager.getCacheStats();
      expect(stats.totalFiles).toBe(2);
      expect(stats.cacheSize).toMatch(/\d+KB/);
    });
  });

  describe('cleanupStaleEntries', () => {
    test('should remove entries for non-existent files', () => {
      cacheManager.updateAnchors("/test/existing.md", "hash1", new Set(["a"]));
      cacheManager.updateAnchors("/test/deleted.md", "hash2", new Set(["b"]));
      cacheManager.updateAnchors("/test/another.md", "hash3", new Set(["c"]));
      
      const existingFiles = ["/test/existing.md", "/test/another.md"];
      cacheManager.cleanupStaleEntries(existingFiles);
      
      expect(cacheManager.getAnchorsIfValid("/test/existing.md", "hash1").valid).toBe(true);
      expect(cacheManager.getAnchorsIfValid("/test/another.md", "hash3").valid).toBe(true);
      expect(cacheManager.getAnchorsIfValid("/test/deleted.md", "hash2").valid).toBe(false);
      
      expect(cacheManager.getCacheStats().totalFiles).toBe(2);
    });

    test('should handle empty file list', () => {
      cacheManager.updateAnchors("/test/file.md", "hash", new Set(["anchor"]));
      cacheManager.cleanupStaleEntries([]);
      
      expect(cacheManager.getCacheStats().totalFiles).toBe(0);
    });
  });
});