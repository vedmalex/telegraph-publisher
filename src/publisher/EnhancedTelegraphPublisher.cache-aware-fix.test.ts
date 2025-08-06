import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import { PagesCacheManager } from '../cache/PagesCacheManager';
import type { MetadataConfig } from '../types/metadata';

describe('EnhancedTelegraphPublisher - Cache-Aware Link Replacement Fix', () => {
  let tempDir: string;
  let publisher: EnhancedTelegraphPublisher;
  let cacheManager: PagesCacheManager;
  let config: MetadataConfig;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cache-fix-test-'));
    
    config = {
      metadataFile: '.telegraph-metadata.json',
      cacheDirectory: tempDir,
      rateLimiting: {
        requestsPerSecond: 1,
        burstLimit: 3
      },
      maxDependencyDepth: 3,
      autoRepairing: { enabled: false }
    };

    publisher = new EnhancedTelegraphPublisher(config);
    publisher.setAccessToken('dummy-token-for-testing');
    
    // Initialize cache manager directly
    cacheManager = new PagesCacheManager(tempDir, 'dummy-token-for-testing');
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should accept cache manager parameter in replaceLinksWithTelegraphUrls method', async () => {
    // This test verifies the method signature was updated correctly
    const testFile = join(tempDir, 'test.md');
    writeFileSync(testFile, `# Test\nContent here.`);

    // Process the file to get ProcessedContent
    const processed = (await import('../content/ContentProcessor')).ContentProcessor.processFile(testFile);

    // Test that the method can be called with cache manager parameter
    const result = await publisher['replaceLinksWithTelegraphUrls'](processed, cacheManager);
    
    // Should return ProcessedContent object
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  test('should gracefully handle missing cache manager', async () => {
    // This test verifies the early return logic
    const testFile = join(tempDir, 'test.md');
    writeFileSync(testFile, `# Test\nContent here.`);

    // Process the file to get ProcessedContent
    const processed = (await import('../content/ContentProcessor')).ContentProcessor.processFile(testFile);

    // Call without cache manager (should use early return)
    const result = await publisher['replaceLinksWithTelegraphUrls'](processed);

    // Should return the same object when no cache manager
    expect(result).toBe(processed);
  });

  test('should use cache manager when provided vs. return early when not provided', async () => {
    const testFile = join(tempDir, 'test.md');
    writeFileSync(testFile, `# Test\nContent here with [link](./other.md).`);

    // Process the file to get ProcessedContent
    const processed = (await import('../content/ContentProcessor')).ContentProcessor.processFile(testFile);

    // Test both scenarios
    const resultWithoutCache = await publisher['replaceLinksWithTelegraphUrls'](processed);
    const resultWithCache = await publisher['replaceLinksWithTelegraphUrls'](processed, cacheManager);

    // Both should return ProcessedContent objects
    expect(resultWithoutCache).toBeDefined();
    expect(resultWithCache).toBeDefined();
    
    // Without cache should return the exact same object (early return)
    expect(resultWithoutCache).toBe(processed);
    
    // With cache should process (even if no links match)
    expect(typeof resultWithCache).toBe('object');
  });

  test('should pass cache manager to link replacement in publish flow', async () => {
    const rootFile = join(tempDir, 'root.md');
    writeFileSync(rootFile, `# Root Document\nContent here.`);

    // Mock publishNodes to avoid actual API calls
    publisher['publishNodes'] = async () => ({
      path: 'test-path',
      url: 'https://telegra.ph/test-url',
      title: 'Test',
      description: '',
      author_name: '',
      author_url: '',
      image_url: '',
      content: [],
      views: 0,
      can_edit: true
    });

    // Track if cache manager was passed
    let cacheManagerPassed = false;
    const originalMethod = publisher['replaceLinksWithTelegraphUrls'].bind(publisher);
    
    publisher['replaceLinksWithTelegraphUrls'] = async function(processed, passedCacheManager) {
      cacheManagerPassed = passedCacheManager instanceof PagesCacheManager;
      return originalMethod(processed, passedCacheManager);
    };

    // Call publishWithMetadata
    try {
      await publisher.publishWithMetadata(rootFile, {
        withDependencies: true,
        maxDepth: 2,
        force: false,
        debug: false,
        dryRun: false
      });
    } catch (error) {
      // Expected to fail due to mocking, but we're testing the parameter passing
    }

    // Verify cache manager was passed
    expect(cacheManagerPassed).toBe(true);
  });
}); 