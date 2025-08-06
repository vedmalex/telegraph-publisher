import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorCacheManager } from './AnchorCacheManager';

describe('AnchorCacheManager - Enhanced Timestamp Validation', () => {
  const testDir = join(process.cwd(), 'test-anchor-cache');
  const cacheFilePath = join(testDir, '.telegraph-anchors-cache.json');
  let cacheManager: AnchorCacheManager;

  beforeEach(() => {
    // Create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    
    cacheManager = new AnchorCacheManager(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Task 4.1.1: Timestamp-based change detection tests', () => {
    test('should return valid cache when both timestamp and hash match', () => {
      const testFilePath = join(testDir, 'test.md');
      const testContent = 'test content';
      const testAnchors = new Set(['header1', 'header2']);
      
      // Create test file
      writeFileSync(testFilePath, testContent);
      
      // Update cache
      cacheManager.updateAnchors(testFilePath, 'test-hash', testAnchors);
      
      // Verify cache is valid
      const result = cacheManager.getAnchorsIfValid(testFilePath, 'test-hash');
      
      expect(result.valid).toBe(true);
      expect(result.anchors).toEqual(testAnchors);
      expect(result.reason).toBeUndefined();
    });

    test('should return invalid cache with timestamp-changed reason when file is modified', () => {
      const testFilePath = join(testDir, 'test.md');
      const testAnchors = new Set(['header1']);
      
      // Create initial file
      writeFileSync(testFilePath, 'initial content');
      cacheManager.updateAnchors(testFilePath, 'initial-hash', testAnchors);
      
      // Wait a bit and modify file (this will change mtime)
      setTimeout(() => {
        writeFileSync(testFilePath, 'modified content');
      }, 10);
      
      // Small delay to ensure mtime changes
      Bun.sleepSync(20);
      writeFileSync(testFilePath, 'modified content');
      
      const result = cacheManager.getAnchorsIfValid(testFilePath, 'initial-hash');
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('timestamp-changed');
    });

    test('should return content-changed when hash differs after timestamp check', () => {
      const testFilePath = join(testDir, 'test.md');
      const testAnchors = new Set(['header1']);
      
      // Create test file
      writeFileSync(testFilePath, 'test content');
      cacheManager.updateAnchors(testFilePath, 'original-hash', testAnchors);
      
      // Same timestamp but different hash
      const result = cacheManager.getAnchorsIfValid(testFilePath, 'different-hash');
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('content-changed');
    });
  });

  describe('Task 4.1.2: Hash-based change validation tests', () => {
    test('should store mtime when updating anchors', () => {
      const testFilePath = join(testDir, 'test.md');
      const testAnchors = new Set(['header1']);
      
      // Create test file
      writeFileSync(testFilePath, 'test content');
      
      // Update cache
      cacheManager.updateAnchors(testFilePath, 'test-hash', testAnchors);
      
      // Access the private cache to verify mtime is stored
      const cacheData = (cacheManager as any).cache;
      expect(cacheData.anchors[testFilePath].mtime).toBeDefined();
      expect(typeof cacheData.anchors[testFilePath].mtime).toBe('string');
    });

    test('should use fallback mtime when file stat fails during update', () => {
      const nonExistentFile = join(testDir, 'nonexistent.md');
      const testAnchors = new Set(['header1']);
      
      // This should not throw and should use fallback mtime
      cacheManager.updateAnchors(nonExistentFile, 'test-hash', testAnchors);
      
      const cacheData = (cacheManager as any).cache;
      expect(cacheData.anchors[nonExistentFile].mtime).toBeDefined();
      expect(typeof cacheData.anchors[nonExistentFile].mtime).toBe('string');
    });
  });

  describe('Task 4.2.2: Cache migration and backward compatibility tests', () => {
    test('should migrate v1.1.0 cache to v1.2.0 with mtime fields', () => {
      const oldCacheData = {
        version: '1.1.0',
        createdAt: '2025-08-06T10:00:00.000Z',
        anchors: {
          '/test/file1.md': {
            contentHash: 'hash1',
            anchors: ['anchor1']
          },
          '/test/file2.md': {
            contentHash: 'hash2', 
            anchors: ['anchor2']
          }
        }
      };

      // Write old cache file
      writeFileSync(cacheFilePath, JSON.stringify(oldCacheData));
      
      // Create new cache manager (should trigger migration)
      const newCacheManager = new AnchorCacheManager(testDir);
      
      // Verify cache structure
      const cacheData = (newCacheManager as any).cache;
      expect(cacheData.version).toBe('1.2.0');
      expect(cacheData.anchors['/test/file1.md'].mtime).toBeDefined();
      expect(cacheData.anchors['/test/file2.md'].mtime).toBeDefined();
    });

    test('should create new cache for unsupported versions', () => {
      const unknownVersionData = {
        version: '2.0.0',
        createdAt: '2025-08-06T10:00:00.000Z',
        anchors: {}
      };

      writeFileSync(cacheFilePath, JSON.stringify(unknownVersionData));
      
      const newCacheManager = new AnchorCacheManager(testDir);
      const cacheData = (newCacheManager as any).cache;
      
      expect(cacheData.version).toBe('1.2.0');
      expect(Object.keys(cacheData.anchors)).toHaveLength(0);
    });
  });

  describe('Performance validation', () => {
    test('should perform timestamp check before hash calculation', () => {
      const testFilePath = join(testDir, 'performance.md');
      const testAnchors = new Set(['header1']);
      
      // Create test file
      writeFileSync(testFilePath, 'test content');
      cacheManager.updateAnchors(testFilePath, 'test-hash', testAnchors);
      
      // Modify file to change timestamp
      Bun.sleepSync(10);
      writeFileSync(testFilePath, 'modified content');
      
      const result = cacheManager.getAnchorsIfValid(testFilePath, 'any-hash');
      
      // Should return timestamp-changed, indicating early return
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('timestamp-changed');
    });
  });

  describe('Basic functionality tests', () => {
    test('should return not-found for non-existent cache entry', () => {
      const result = cacheManager.getAnchorsIfValid('/nonexistent/file.md', 'any-hash');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
    });

    test('should save and load cache correctly', () => {
      const testFilePath = join(testDir, 'test.md');
      const testAnchors = new Set(['header1', 'header2']);
      
      writeFileSync(testFilePath, 'test content');
      cacheManager.updateAnchors(testFilePath, 'test-hash', testAnchors);
      cacheManager.saveCache();
      
      // Create new cache manager (should load existing cache)
      const newCacheManager = new AnchorCacheManager(testDir);
      const result = newCacheManager.getAnchorsIfValid(testFilePath, 'test-hash');
      
      expect(result.valid).toBe(true);
      expect(result.anchors).toEqual(testAnchors);
    });
  });
});