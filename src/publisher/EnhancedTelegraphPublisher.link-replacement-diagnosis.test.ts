import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MetadataConfig } from '../types/metadata';

/**
 * DIAGNOSTIC TEST: Link Replacement Investigation
 * 
 * Purpose: Reproduce and diagnose the link replacement issue where:
 * - Links remain as local paths (./file.md) instead of Telegraph URLs
 * - JSON debug files show "href": "01.md" instead of "href": "https://telegra.ph/..."
 * 
 * This test creates a minimal reproduction case to trace what happens
 * to links through the entire pipeline.
 */
describe('Link Replacement Diagnosis', () => {
  let testDir: string;
  let publisher: EnhancedTelegraphPublisher;
  let mockTelegraphApi: any;

  beforeEach(() => {
    // Create test directory
    testDir = join(process.cwd(), 'test-link-diagnosis');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Mock Telegraph API to return predictable URLs
    mockTelegraphApi = {
      createAccount: vi.fn().mockResolvedValue({
        access_token: 'test-token-123',
        auth_url: 'test-auth-url',
        short_name: 'test-user'
      }),
      publishNodes: vi.fn().mockImplementation((nodes, title) => {
        // Create predictable URLs based on title
        const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        return Promise.resolve({
          path: `test-${slug}-${Date.now()}`,
          url: `https://telegra.ph/test-${slug}-${Date.now()}`,
          title,
          content: nodes
        });
      }),
      editPage: vi.fn().mockImplementation((path, nodes, title) => {
        return Promise.resolve({
          path,
          url: `https://telegra.ph/${path}`,
          title,
          content: nodes
        });
      })
    };

    // Create publisher with diagnostic configuration
    const config: MetadataConfig = {
      defaultUsername: 'test-user',
      autoPublishDependencies: true,
      replaceLinksinContent: true, // CRITICAL: This should be true
      maxDependencyDepth: 10,
      createBackups: false,
      manageBidirectionalLinks: false,
      autoSyncCache: true,
      rateLimiting: {
        baseDelayMs: 0, // No delay for tests
        adaptiveMultiplier: 1,
        maxDelayMs: 0,
        backoffStrategy: 'linear',
        maxRetries: 1
      }
    };

    publisher = new EnhancedTelegraphPublisher(config);
    
    // Mock the internal Telegraph API
    (publisher as any).api = mockTelegraphApi;
    publisher.setAccessToken('test-token-123');
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should reproduce link replacement issue with diagnostic logging', async () => {
    console.log('\n🔍 DIAGNOSTIC TEST: Link Replacement Issue Reproduction');
    console.log('═══════════════════════════════════════════════════════');

    // Step 1: Create test files with known link structure
    const subDependencyFile = join(testDir, 'sub-dependency.md');
    const dependencyFile = join(testDir, 'dependency.md');
    const rootFile = join(testDir, 'root.md');

    writeFileSync(subDependencyFile, `# Sub Dependency
This file has no links - it's the end of the chain.

Content here should be published normally.`);

    writeFileSync(dependencyFile, `# Dependency File
This file links to a sub-dependency.

[Link to Sub Dependency](./sub-dependency.md)

This link should be replaced with Telegraph URL after publication.`);

    writeFileSync(rootFile, `# Root File  
This file links to a dependency.

[Link to Dependency](./dependency.md)

This link should be replaced with Telegraph URL after publication.`);

    console.log(`\n📁 Created test files in: ${testDir}`);
    console.log(`   - root.md → links to dependency.md`);
    console.log(`   - dependency.md → links to sub-dependency.md`);  
    console.log(`   - sub-dependency.md → no links`);

    // Step 2: Attempt publication with debug enabled
    console.log(`\n🚀 STARTING PUBLICATION TEST`);
    console.log(`───────────────────────────────────────`);

    const result = await publisher.publishWithMetadata(rootFile, 'test-user', {
      withDependencies: true,
      debug: true,
      dryRun: false,
      forceRepublish: false
    });

    console.log(`\n📊 PUBLICATION RESULT:`);
    console.log(`   Success: ${result.success}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    } else {
      console.log(`   URL: ${result.url}`);
    }

    // Step 3: Analyze the results
    console.log(`\n🔍 DIAGNOSTIC ANALYSIS:`);
    console.log(`───────────────────────────────────────`);

    // Check if debug JSON files were created
    const debugFiles = [
      join(testDir, 'root.json'),
      join(testDir, 'dependency.json'),
      join(testDir, 'sub-dependency.json')
    ];

    debugFiles.forEach(file => {
      if (existsSync(file)) {
        console.log(`✅ Debug file exists: ${file}`);
        try {
          const content = require(file);
          // Look for href attributes
          const jsonStr = JSON.stringify(content, null, 2);
          const hrefMatches = jsonStr.match(/"href":\s*"([^"]+)"/g);
          
          if (hrefMatches) {
            console.log(`   📝 Found hrefs in ${file}:`);
            hrefMatches.forEach(href => {
              const url = href.match(/"href":\s*"([^"]+)"/)?.[1];
              if (url?.endsWith('.md')) {
                console.log(`   ❌ LOCAL LINK FOUND: ${href}`);
              } else if (url?.includes('telegra.ph')) {
                console.log(`   ✅ TELEGRAPH URL FOUND: ${href}`);
              } else {
                console.log(`   ❓ OTHER LINK: ${href}`);
              }
            });
          } else {
            console.log(`   ℹ️  No href attributes found in ${file}`);
          }
        } catch (error) {
          console.log(`   ❌ Error reading ${file}:`, error);
        }
      } else {
        console.log(`❌ Debug file missing: ${file}`);
      }
    });

    // Step 4: Expected vs Actual Analysis
    console.log(`\n🎯 EXPECTED vs ACTUAL:`);
    console.log(`───────────────────────────────────────`);
    console.log(`EXPECTED: All .md links should be replaced with https://telegra.ph/... URLs`);
    console.log(`ACTUAL: Will be determined by diagnostic output above`);
    
    console.log(`\n🔍 KEY DIAGNOSTIC QUESTIONS:`);
    console.log(`1. Are local links detected in ContentProcessor.processFile?`);
    console.log(`2. Is the cache populated with Telegraph URLs after dependency publication?`);
    console.log(`3. Is replaceLinksWithTelegraphUrls actually called?`);
    console.log(`4. Does the replacement method work correctly?`);

    // Basic assertions - this test is primarily for diagnosis
    expect(result).toBeDefined();
    
    // The success/failure will depend on what we discover
    // For now, we just want to see the diagnostic output
    console.log(`\n🏁 DIAGNOSTIC TEST COMPLETED`);
    console.log(`═══════════════════════════════════════════════════════\n`);
  });

  it('should test ContentProcessor.processFile link detection in isolation', async () => {
    console.log('\n🔍 ISOLATED TEST: ContentProcessor.processFile Link Detection');
    console.log('════════════════════════════════════════════════════════════');

    // Create a simple test file
    const testFile = join(testDir, 'test-links.md');
    writeFileSync(testFile, `# Test Links

[Local Link 1](./dependency.md)
[Local Link 2](./sub/subdep.md)
[External Link](https://example.com)
[Another Local](../other.md)
`);

    // Import ContentProcessor directly
    const { ContentProcessor } = await import('../content/ContentProcessor');
    
    console.log(`📄 Processing test file: ${testFile}`);
    
    const processed = ContentProcessor.processFile(testFile);
    
    console.log(`\n📊 PROCESSING RESULTS:`);
    console.log(`   localLinks.length: ${processed.localLinks.length}`);
    
    if (processed.localLinks.length > 0) {
      console.log(`   Local links detected:`);
      processed.localLinks.forEach((link, index) => {
        console.log(`   ${index + 1}. "${link.originalPath}" → "${link.resolvedPath}" (published: ${link.isPublished})`);
      });
    } else {
      console.log(`   ❌ NO LOCAL LINKS DETECTED - This could be the root cause!`);
    }

    // Basic expectations
    expect(processed.localLinks.length).toBeGreaterThan(0);
    expect(processed.localLinks.some(link => link.originalPath.includes('dependency.md'))).toBe(true);
    
    console.log(`✅ Link detection test completed\n`);
  });

  it('should test cache state after dependency publication', async () => {
    console.log('\n🔍 ISOLATED TEST: Cache State After Dependency Publication');
    console.log('═══════════════════════════════════════════════════════════');

    // Create dependency file
    const depFile = join(testDir, 'dependency.md');
    writeFileSync(depFile, `# Dependency\nThis is a dependency file.`);

    console.log(`📄 Publishing dependency file: ${depFile}`);

    // Publish dependency
    const depResult = await publisher.publishWithMetadata(depFile, 'test-user', {
      withDependencies: false,
      debug: true,
      dryRun: false
    });

    console.log(`\n📊 DEPENDENCY PUBLICATION RESULT:`);
    console.log(`   Success: ${depResult.success}`);
    console.log(`   URL: ${depResult.url}`);

    // Check cache state
    const cacheManager = publisher.getCacheManager();
    console.log(`\n💾 CACHE STATE ANALYSIS:`);
    console.log(`   Cache manager exists: ${!!cacheManager}`);

    if (cacheManager) {
      const allPages = cacheManager.getAllPages();
      console.log(`   Cache entries count: ${allPages.length}`);
      
      if (allPages.length > 0) {
        console.log(`   Cache entries:`);
        allPages.forEach((page, index) => {
          console.log(`   ${index + 1}. "${page.localFilePath}" → "${page.telegraphUrl}"`);
        });
        
        // Check specific dependency
        const depCacheEntry = cacheManager.getPageByLocalPath(depFile);
        console.log(`   Specific dependency in cache: ${!!depCacheEntry}`);
        if (depCacheEntry) {
          console.log(`   Dependency URL: ${depCacheEntry.telegraphUrl}`);
        }
      } else {
        console.log(`   ❌ CACHE IS EMPTY - This could be the root cause!`);
      }
    } else {
      console.log(`   ❌ CACHE MANAGER NOT INITIALIZED - This could be the root cause!`);
    }

    expect(depResult.success).toBe(true);
    
    console.log(`✅ Cache state test completed\n`);
  });
}); 