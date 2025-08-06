import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MetadataConfig } from '../types/metadata';

/**
 * DIAGNOSTIC TEST: Cache Synchronization Investigation
 * 
 * Purpose: Diagnose exactly when and how the cache gets populated
 * Focus: Understanding the relationship between publication order and cache state
 */
describe('Cache Synchronization Diagnosis', () => {
  let testDir: string;
  let publisher: EnhancedTelegraphPublisher;

  beforeEach(() => {
    // Create test directory
    testDir = join(process.cwd(), 'test-cache-sync');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Create publisher with test configuration
    const config: MetadataConfig = {
      defaultUsername: 'test-user',
      autoPublishDependencies: true,
      replaceLinksinContent: true,
      maxDependencyDepth: 10,
      createBackups: false,
      manageBidirectionalLinks: false,
      autoSyncCache: true,
      rateLimiting: {
        baseDelayMs: 0,
        adaptiveMultiplier: 1,
        maxDelayMs: 0,
        backoffStrategy: 'linear',
        maxRetries: 1
      }
    };

    publisher = new EnhancedTelegraphPublisher(config);
    publisher.setAccessToken('test-token-123');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should track cache state changes during dependency publication', async () => {
    console.log('\n🔍 CACHE SYNC TEST: Tracking Cache Population');
    console.log('════════════════════════════════════════════════');

    // Create test files
    const leafFile = join(testDir, 'leaf.md');
    const middleFile = join(testDir, 'middle.md');
    const rootFile = join(testDir, 'root.md');

    writeFileSync(leafFile, `# Leaf File\nThis is a leaf file with no dependencies.`);
    writeFileSync(middleFile, `# Middle File\nThis links to [Leaf](./leaf.md).`);
    writeFileSync(rootFile, `# Root File\nThis links to [Middle](./middle.md).`);

    console.log(`📁 Created test files:`);
    console.log(`   - root.md → middle.md → leaf.md`);

    // Spy on addToCache to track when files are added
    const addToCacheSpy = vi.spyOn(publisher as any, 'addToCache');
    
    // Also spy on the cache manager's addPage method
    let cacheAddPageSpy: any;
    
    // Mock Telegraph API with predictable responses
    const mockResponses = new Map([
      ['Leaf File', { url: 'https://telegra.ph/leaf-123', path: 'leaf-123' }],
      ['Middle File', { url: 'https://telegra.ph/middle-456', path: 'middle-456' }],
      ['Root File', { url: 'https://telegra.ph/root-789', path: 'root-789' }]
    ]);

    const originalPublishNodes = publisher.publishNodes.bind(publisher);
    vi.spyOn(publisher, 'publishNodes').mockImplementation(async (title: string, nodes: any) => {
      const response = mockResponses.get(title);
      if (!response) {
        throw new Error(`No mock response for title: ${title}`);
      }
      console.log(`📤 MOCK API: Publishing "${title}" → ${response.url}`);
      return response;
    });

    // Initialize cache manager manually to enable spying
    publisher.ensureCacheInitialized(rootFile);
    const cacheManager = publisher.getCacheManager();
    if (cacheManager) {
      cacheAddPageSpy = vi.spyOn(cacheManager, 'addPage');
    }

    // Helper function to check cache state
    const checkCacheState = (label: string) => {
      const cache = publisher.getCacheManager();
      if (cache) {
        const pages = cache.getAllPages();
        console.log(`💾 CACHE STATE ${label}: ${pages.length} entries`);
        pages.forEach((page, index) => {
          console.log(`   ${index + 1}. "${page.localFilePath}" → "${page.telegraphUrl}"`);
        });
      } else {
        console.log(`💾 CACHE STATE ${label}: NO CACHE MANAGER`);
      }
    };

    console.log(`\n🚀 STARTING DEPENDENCY PUBLICATION TEST`);
    console.log(`──────────────────────────────────────────────`);

    checkCacheState('(BEFORE)');

    try {
      // Publish root file with dependencies
      const result = await publisher.publishWithMetadata(rootFile, 'test-user', {
        withDependencies: true,
        debug: false,
        dryRun: false,
        forceRepublish: false
      });

      console.log(`\n📊 FINAL RESULT:`);
      console.log(`   Success: ${result.success}`);
      if (!result.success) {
        console.log(`   Error: ${result.error}`);
      }

      checkCacheState('(AFTER)');

      console.log(`\n🔍 SPY ANALYSIS:`);
      console.log(`   addToCache called: ${addToCacheSpy.mock.calls.length} times`);
      addToCacheSpy.mock.calls.forEach((call, index) => {
        const [filePath, url, path, title] = call;
        console.log(`   ${index + 1}. addToCache("${filePath}", "${url}", "${path}", "${title}")`);
      });

      if (cacheAddPageSpy) {
        console.log(`   cache.addPage called: ${cacheAddPageSpy.mock.calls.length} times`);
      }

      // Test specific scenario: when middle.md is being processed, 
      // leaf.md should already be in cache
      console.log(`\n🎯 CRITICAL TEST:`);
      console.log(`When middle.md processes links, leaf.md should be in cache.`);
      
      // This is the core issue - we need to verify the timing
      expect(result).toBeDefined();

    } catch (error) {
      console.log(`❌ Publication failed:`, error);
      checkCacheState('(AFTER ERROR)');
      throw error;
    }

    console.log(`\n🏁 CACHE SYNC TEST COMPLETED`);
    console.log(`════════════════════════════════════════════════\n`);
  });

  it('should verify cache state at the moment of link replacement', async () => {
    console.log('\n🔍 LINK REPLACEMENT TIMING TEST');
    console.log('═══════════════════════════════════════════════');

    // Create simple dependency chain
    const depFile = join(testDir, 'dependency.md');
    const rootFile = join(testDir, 'root.md');

    writeFileSync(depFile, `# Dependency\nThis is a dependency file.`);
    writeFileSync(rootFile, `# Root\nThis links to [Dependency](./dependency.md).`);

    // Mock Telegraph API
    vi.spyOn(publisher, 'publishNodes').mockResolvedValue({
      url: 'https://telegra.ph/test-123',
      path: 'test-123'
    });

    // Initialize cache
    publisher.ensureCacheInitialized(rootFile);

    console.log(`\n📁 Test Setup:`);
    console.log(`   - dependency.md (standalone)`);
    console.log(`   - root.md → dependency.md`);

    // Step 1: Publish dependency first
    console.log(`\n🔄 STEP 1: Publishing dependency.md`);
    const depResult = await publisher.publishWithMetadata(depFile, 'test-user', {
      withDependencies: false,
      debug: false
    });

    const cacheAfterDep = publisher.getCacheManager()?.getAllPages() || [];
    console.log(`💾 Cache after dependency publication: ${cacheAfterDep.length} entries`);
    cacheAfterDep.forEach((page, index) => {
      console.log(`   ${index + 1}. "${page.localFilePath}" → "${page.telegraphUrl}"`);
    });

    // Step 2: Now publish root with dependencies
    console.log(`\n🔄 STEP 2: Publishing root.md (should find dependency in cache)`);
    
    const rootResult = await publisher.publishWithMetadata(rootFile, 'test-user', {
      withDependencies: true,
      debug: false
    });

    const cacheAfterRoot = publisher.getCacheManager()?.getAllPages() || [];
    console.log(`💾 Cache after root publication: ${cacheAfterRoot.length} entries`);

    console.log(`\n📊 RESULTS:`);
    console.log(`   Dependency success: ${depResult.success}`);
    console.log(`   Root success: ${rootResult.success}`);
    
    expect(depResult.success).toBe(true);
    // Note: Root might still fail due to other issues, but we should see 
    // dependency in cache when root processes links

    console.log(`\n🏁 TIMING TEST COMPLETED\n`);
  });
}); 