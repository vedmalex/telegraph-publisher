import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { MetadataConfig, FileMetadata } from '../types/metadata';

/**
 * Test for Debug Hash Skip Fix - validates that debug JSON is created 
 * even when content is unchanged (hash matches)
 */
describe('EnhancedTelegraphPublisher - Debug Hash Skip Fix', () => {
  let publisher: EnhancedTelegraphPublisher;
  let testDir: string;
  let mockConfig: MetadataConfig;

  beforeEach(() => {
    mockConfig = {
      defaultUsername: 'test-user',
      autoPublishDependencies: true,
      replaceLinksinContent: true,
      maxDependencyDepth: 5,
      createBackups: false,
      manageBidirectionalLinks: false,
      autoSyncCache: false,
      rateLimiting: {
        baseDelayMs: 1500,
        adaptiveMultiplier: 2.0,
        maxDelayMs: 30000,
        backoffStrategy: 'linear' as const,
        maxRetries: 3,
        cooldownPeriodMs: 60000,
        enableAdaptiveThrottling: true
      }
    };
    
    publisher = new EnhancedTelegraphPublisher(mockConfig);
    testDir = resolve('./test-debug-hash-skip-temp');
    
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Debug Hash Skip Fix - Core Functionality', () => {
    it('should create debug JSON for UNCHANGED content when debug=true', async () => {
      const testFile = resolve(testDir, 'unchanged-content-debug.md');
      const expectedJsonFile = resolve(testDir, 'unchanged-content-debug.json');
      
      // Create content that will have a specific hash
      const originalContent = `# Test Article

This is test content that will remain unchanged.

## Section 1
Some content here.

## Section 2  
More content here.`;

      // Create existing metadata with matching content hash
      const contentHash = 'test-matching-hash-12345';
      const existingMetadata: FileMetadata = {
        telegraphUrl: 'https://telegra.ph/test-unchanged-123',
        editPath: '/edit/test-unchanged-123',
        username: 'test-user',
        publishedAt: new Date().toISOString(),
        originalFilename: 'unchanged-content-debug.md',
        title: 'Test Article',
        contentHash: contentHash
      };

      // Create file with metadata (simulating already published file)
      const markdownWithMetadata = `---
telegraphUrl: ${existingMetadata.telegraphUrl}
editPath: ${existingMetadata.editPath}
username: ${existingMetadata.username}
publishedAt: ${existingMetadata.publishedAt}
originalFilename: ${existingMetadata.originalFilename}
title: ${existingMetadata.title}
contentHash: ${existingMetadata.contentHash}
---

${originalContent}`;
      
      writeFileSync(testFile, markdownWithMetadata);

      // Mock the hash calculation to return matching hash (simulating unchanged content)
      const mockCalculateContentHash = jest.spyOn(publisher, 'calculateContentHash');
      mockCalculateContentHash.mockReturnValue(contentHash);

      // Mock Telegraph API calls
      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: existingMetadata.telegraphUrl,
        path: existingMetadata.editPath
      });

      // CRITICAL TEST: Call editWithMetadata with debug=true for unchanged content
      const result = await publisher.editWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Verify the operation succeeded
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);

      // CRITICAL VALIDATION: JSON file should be created despite unchanged content
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify JSON content is valid Telegraph nodes
      const jsonContent = readFileSync(expectedJsonFile, 'utf-8');
      const telegraphNodes = JSON.parse(jsonContent);
      
      expect(Array.isArray(telegraphNodes)).toBe(true);
      expect(telegraphNodes.length).toBeGreaterThan(0);
      
      // Verify content was properly converted to Telegraph nodes
      const jsonString = JSON.stringify(telegraphNodes);
      expect(jsonString).toContain('Section 1');
      expect(jsonString).toContain('Section 2');

      // Cleanup mocks
      mockCalculateContentHash.mockRestore();
      mockEditPage.mockRestore();
    });

    it('should skip processing for UNCHANGED content when debug=false (preserve performance)', async () => {
      const testFile = resolve(testDir, 'unchanged-content-no-debug.md');
      const expectedJsonFile = resolve(testDir, 'unchanged-content-no-debug.json');
      
      const originalContent = `# Performance Test
This content should trigger early return when debug=false.`;

      const contentHash = 'test-matching-hash-performance';
      const existingMetadata: FileMetadata = {
        telegraphUrl: 'https://telegra.ph/performance-test',
        editPath: '/edit/performance-test',
        username: 'test-user',
        publishedAt: new Date().toISOString(),
        originalFilename: 'unchanged-content-no-debug.md',
        title: 'Performance Test',
        contentHash: contentHash
      };

      const markdownWithMetadata = `---
telegraphUrl: ${existingMetadata.telegraphUrl}
editPath: ${existingMetadata.editPath}
username: ${existingMetadata.username}
publishedAt: ${existingMetadata.publishedAt}
originalFilename: ${existingMetadata.originalFilename}
title: ${existingMetadata.title}
contentHash: ${existingMetadata.contentHash}
---

${originalContent}`;
      
      writeFileSync(testFile, markdownWithMetadata);

      // Mock hash to return matching value
      const mockCalculateContentHash = jest.spyOn(publisher, 'calculateContentHash');
      mockCalculateContentHash.mockReturnValue(contentHash);

      // Call with debug=false (should trigger early return)
      const result = await publisher.editWithMetadata(testFile, 'test-user', {
        debug: false,
        dryRun: false,
        withDependencies: false
      });

      // Should succeed with early return
      expect(result.success).toBe(true);
      expect(result.url).toBe(existingMetadata.telegraphUrl);

      // JSON file should NOT be created (performance optimization)
      expect(existsSync(expectedJsonFile)).toBe(false);

      mockCalculateContentHash.mockRestore();
    });

    it('should process CHANGED content normally with debug=true', async () => {
      const testFile = resolve(testDir, 'changed-content-debug.md');
      const expectedJsonFile = resolve(testDir, 'changed-content-debug.json');
      
      const originalContent = `# Changed Content Test
This content has been modified.`;

      const oldContentHash = 'old-hash-12345';
      const newContentHash = 'new-hash-67890';
      
      const existingMetadata: FileMetadata = {
        telegraphUrl: 'https://telegra.ph/changed-content-test',
        editPath: '/edit/changed-content-test',
        username: 'test-user',
        publishedAt: new Date().toISOString(),
        originalFilename: 'changed-content-debug.md',
        title: 'Changed Content Test',
        contentHash: oldContentHash
      };

      const markdownWithMetadata = `---
telegraphUrl: ${existingMetadata.telegraphUrl}
editPath: ${existingMetadata.editPath}
username: ${existingMetadata.username}
publishedAt: ${existingMetadata.publishedAt}
originalFilename: ${existingMetadata.originalFilename}
title: ${existingMetadata.title}
contentHash: ${existingMetadata.contentHash}
---

${originalContent}`;
      
      writeFileSync(testFile, markdownWithMetadata);

      // Mock hash to return different value (content changed)
      const mockCalculateContentHash = jest.spyOn(publisher, 'calculateContentHash');
      mockCalculateContentHash.mockReturnValue(newContentHash);

      // Mock Telegraph API
      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: existingMetadata.telegraphUrl,
        path: existingMetadata.editPath
      });

      // Call with debug=true for changed content
      const result = await publisher.editWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Should process normally and create JSON
      expect(result.success).toBe(true);
      expect(existsSync(expectedJsonFile)).toBe(true);

      mockCalculateContentHash.mockRestore();
      mockEditPage.mockRestore();
    });

    it('should handle forceRepublish flag correctly with debug', async () => {
      const testFile = resolve(testDir, 'force-republish-debug.md');
      const expectedJsonFile = resolve(testDir, 'force-republish-debug.json');
      
      const originalContent = `# Force Republish Test
Testing forceRepublish with debug.`;

      const contentHash = 'matching-hash-force-test';
      const existingMetadata: FileMetadata = {
        telegraphUrl: 'https://telegra.ph/force-republish-test',
        editPath: '/edit/force-republish-test', 
        username: 'test-user',
        publishedAt: new Date().toISOString(),
        originalFilename: 'force-republish-debug.md',
        title: 'Force Republish Test',
        contentHash: contentHash
      };

      const markdownWithMetadata = `---
telegraphUrl: ${existingMetadata.telegraphUrl}
editPath: ${existingMetadata.editPath}
username: ${existingMetadata.username}
publishedAt: ${existingMetadata.publishedAt}
originalFilename: ${existingMetadata.originalFilename}
title: ${existingMetadata.title}
contentHash: ${existingMetadata.contentHash}
---

${originalContent}`;
      
      writeFileSync(testFile, markdownWithMetadata);

      // Mock hash to return matching value
      const mockCalculateContentHash = jest.spyOn(publisher, 'calculateContentHash');
      mockCalculateContentHash.mockReturnValue(contentHash);

      // Mock Telegraph API
      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: existingMetadata.telegraphUrl,
        path: existingMetadata.editPath
      });

      // Call with forceRepublish=true (should bypass hash check entirely)
      const result = await publisher.editWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        forceRepublish: true,
        withDependencies: false
      });

      // Should process and create JSON even with forceRepublish
      expect(result.success).toBe(true);
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Hash calculation should not have been called with forceRepublish
      expect(mockCalculateContentHash).not.toHaveBeenCalled();

      mockEditPage.mockRestore();
    });
  });

  describe('Regression Prevention', () => {
    it('should maintain existing behavior for non-debug scenarios', async () => {
      // This test ensures we didn't break existing functionality
      const testFile = resolve(testDir, 'regression-test.md');
      
      const content = `# Regression Test
Ensuring existing behavior is preserved.`;

      writeFileSync(testFile, content);

      // Mock publishNodes for new publication
      const mockPublishNodes = jest.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/regression-test',
        path: '/regression-test'
      });

      // Test normal publication (should work as before)
      const result = await publisher.publishWithMetadata(testFile, 'test-user', {
        debug: false,
        dryRun: false,
        withDependencies: false
      });

      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(true);

      mockPublishNodes.mockRestore();
    });
  });
});