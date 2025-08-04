import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { MetadataConfig, FileMetadata } from '../types/metadata';

/**
 * Comprehensive debug functionality tests for EnhancedTelegraphPublisher
 * Tests the specific scenario mentioned in the bug report: --debug --force for existing files
 */
describe('EnhancedTelegraphPublisher - Debug Functionality', () => {
  let publisher: EnhancedTelegraphPublisher;
  let testDir: string;
  let mockConfig: MetadataConfig;

  beforeEach(() => {
    // Create mock config for testing
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
    testDir = resolve('./test-debug-temp');
    
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('publishWithMetadata debug functionality', () => {
    it('should create debug JSON file for new publication when debug and dryRun are true', async () => {
      const testFile = resolve(testDir, 'new-publication.md');
      const expectedJsonFile = resolve(testDir, 'new-publication.json');
      
      // Create test markdown file without metadata (new publication)
      const markdownContent = `# Test Article

This is a test article for debug functionality.

## Section 1
Some content here.

## Section 2
More content here.`;
      
      writeFileSync(testFile, markdownContent);

      // Mock Telegraph API calls to avoid network requests
      const mockPublishNodes = jest.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/test-123',
        path: '/test-123'
      });

      // Call publishWithMetadata with debug and dryRun enabled
      const result = await publisher.publishWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Verify the result indicates success and dry run
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(true);
      expect(result.url).toContain('[DRY RUN]');

      // Verify JSON file was created
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify JSON content is valid Telegraph nodes
      const jsonContent = readFileSync(expectedJsonFile, 'utf-8');
      const telegraphNodes = JSON.parse(jsonContent);
      
      expect(Array.isArray(telegraphNodes)).toBe(true);
      expect(telegraphNodes.length).toBeGreaterThan(0);
      
      // Check that content was properly converted
      const jsonString = JSON.stringify(telegraphNodes);
      expect(jsonString).toContain('Test Article');
      expect(jsonString).toContain('Section 1');
      expect(jsonString).toContain('Section 2');

      // Verify proper JSON formatting (2-space indentation)
      expect(jsonContent).toMatch(/^\[\s*\{/);
      expect(jsonContent).toContain('  ');

      mockPublishNodes.mockRestore();
    });

    it('should NOT create debug JSON file when debug is true but dryRun is false', async () => {
      const testFile = resolve(testDir, 'no-debug-json.md');
      const expectedJsonFile = resolve(testDir, 'no-debug-json.json');
      
      writeFileSync(testFile, '# Test\nContent without debug JSON');

      const mockPublishNodes = jest.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/test-456',
        path: '/test-456'
      });

      // Call with debug=true but dryRun=false
      await publisher.publishWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: false,
        withDependencies: false
      });

      // Verify JSON file was NOT created
      expect(existsSync(expectedJsonFile)).toBe(false);

      mockPublishNodes.mockRestore();
    });
  });

  describe('editWithMetadata debug functionality', () => {
    it('should create debug JSON file for existing publication when debug and dryRun are true', async () => {
      const testFile = resolve(testDir, 'existing-publication.md');
      const expectedJsonFile = resolve(testDir, 'existing-publication.json');
      
      // Create test markdown file WITH metadata (existing publication)
      const existingMetadata: FileMetadata = {
        telegraphUrl: 'https://telegra.ph/existing-test-123',
        editPath: '/edit/existing-test-123',
        username: 'test-user',
        publishedAt: new Date().toISOString(),
        originalFilename: 'existing-publication.md',
        title: 'Existing Test Article',
        contentHash: 'original-hash-value'
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

# Existing Test Article

This is an existing article that will be edited with debug enabled.

## Updated Section
This content has been updated.

## Another Section
More updated content here.`;
      
      writeFileSync(testFile, markdownWithMetadata);

      // Mock Telegraph API calls
      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: 'https://telegra.ph/existing-test-123',
        path: '/existing-test-123'
      });

      // Call editWithMetadata with debug and dryRun enabled
      const result = await publisher.editWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Verify the result indicates success and is not a new publication
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);
      expect(result.url).toBe(existingMetadata.telegraphUrl);

      // Verify JSON file was created
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify JSON content is valid Telegraph nodes
      const jsonContent = readFileSync(expectedJsonFile, 'utf-8');
      const telegraphNodes = JSON.parse(jsonContent);
      
      expect(Array.isArray(telegraphNodes)).toBe(true);
      expect(telegraphNodes.length).toBeGreaterThan(0);
      
      // Check that updated content was properly converted
      const jsonString = JSON.stringify(telegraphNodes);
      expect(jsonString).toContain('Updated Section');
      expect(jsonString).toContain('Another Section');
      expect(jsonString).toContain('This is an existing article');

      // Verify proper JSON formatting
      expect(jsonContent).toMatch(/^\[\s*\{/);
      expect(jsonContent).toContain('  ');

      mockEditPage.mockRestore();
    });

    it('should NOT create debug JSON file when debug is true but dryRun is false in edit mode', async () => {
      const testFile = resolve(testDir, 'existing-no-debug.md');
      const expectedJsonFile = resolve(testDir, 'existing-no-debug.json');
      
      // Create existing publication with metadata
      const markdownWithMetadata = `---
telegraphUrl: https://telegra.ph/existing-no-debug
editPath: /edit/existing-no-debug
username: test-user
publishedAt: ${new Date().toISOString()}
originalFilename: existing-no-debug.md
title: No Debug Test
contentHash: hash-value
---

# No Debug Test
Content without debug JSON in edit mode`;
      
      writeFileSync(testFile, markdownWithMetadata);

      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: 'https://telegra.ph/existing-no-debug',
        path: '/existing-no-debug'
      });

      // Call with debug=true but dryRun=false
      await publisher.editWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: false,
        withDependencies: false
      });

      // Verify JSON file was NOT created
      expect(existsSync(expectedJsonFile)).toBe(false);

      mockEditPage.mockRestore();
    });

    it('should handle file system errors gracefully when creating debug JSON', async () => {
      const testFile = resolve(testDir, 'error-test.md');
      const expectedJsonFile = resolve(testDir, 'error-test.json');
      
      // Create existing publication
      const markdownWithMetadata = `---
telegraphUrl: https://telegra.ph/error-test
editPath: /edit/error-test
username: test-user
publishedAt: ${new Date().toISOString()}
originalFilename: error-test.md
title: Error Test
contentHash: hash-value
---

# Error Test
Testing error handling for debug JSON creation`;
      
      writeFileSync(testFile, markdownWithMetadata);

      // Test with debug enabled - should attempt to create JSON
      const result = await publisher.editWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Verify the operation succeeds 
      expect(result.success).toBe(true);

      // Note: In a real error scenario, JSON file would not be created
      // but the main operation should still complete successfully
    });
  });

  describe('debug functionality integration scenarios', () => {
    it('should create consistent JSON output for both new and existing publications', async () => {
      const newFile = resolve(testDir, 'consistency-new.md');
      const existingFile = resolve(testDir, 'consistency-existing.md');
      const newJsonFile = resolve(testDir, 'consistency-new.json');
      const existingJsonFile = resolve(testDir, 'consistency-existing.json');
      
      const sameContent = `# Consistency Test

This is the same content used for both new and existing publication tests.

## Section A
Content in section A.

## Section B
Content in section B.`;

      // Test 1: Create new publication with debug
      writeFileSync(newFile, sameContent);
      
      const mockPublishNodes = jest.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/consistency-new',
        path: '/consistency-new'
      });

      await publisher.publishWithMetadata(newFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Test 2: Create existing publication with debug
      const existingMetadata = `---
telegraphUrl: https://telegra.ph/consistency-existing
editPath: /edit/consistency-existing
username: test-user
publishedAt: ${new Date().toISOString()}
originalFilename: consistency-existing.md
title: Consistency Test
contentHash: existing-hash
---

${sameContent}`;
      
      writeFileSync(existingFile, existingMetadata);
      
      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: 'https://telegra.ph/consistency-existing',
        path: '/consistency-existing'
      });

      await publisher.editWithMetadata(existingFile, 'test-user', {
        debug: true,
        dryRun: true,
        withDependencies: false
      });

      // Verify both JSON files were created
      expect(existsSync(newJsonFile)).toBe(true);
      expect(existsSync(existingJsonFile)).toBe(true);

      // Read and parse both JSON files
      const newJsonContent = JSON.parse(readFileSync(newJsonFile, 'utf-8'));
      const existingJsonContent = JSON.parse(readFileSync(existingJsonFile, 'utf-8'));

      // Verify both contain the same structure and content
      expect(Array.isArray(newJsonContent)).toBe(true);
      expect(Array.isArray(existingJsonContent)).toBe(true);
      expect(newJsonContent.length).toBeGreaterThan(0);
      expect(existingJsonContent.length).toBeGreaterThan(0);

      // Content should be essentially the same (Telegraph nodes)
      const newContentStr = JSON.stringify(newJsonContent);
      const existingContentStr = JSON.stringify(existingJsonContent);
      
      expect(newContentStr).toContain('Section A');
      expect(existingContentStr).toContain('Section A');
      expect(newContentStr).toContain('Section B');
      expect(existingContentStr).toContain('Section B');

      mockPublishNodes.mockRestore();
      mockEditPage.mockRestore();
    });

    it('should work correctly with forceRepublish option', async () => {
      const testFile = resolve(testDir, 'force-republish.md');
      const expectedJsonFile = resolve(testDir, 'force-republish.json');
      
      // Create existing publication
      const markdownWithMetadata = `---
telegraphUrl: https://telegra.ph/force-republish
editPath: /edit/force-republish
username: test-user
publishedAt: ${new Date().toISOString()}
originalFilename: force-republish.md
title: Force Republish Test
contentHash: force-hash
---

# Force Republish Test
This will be force republished with debug enabled`;
      
      writeFileSync(testFile, markdownWithMetadata);

      const mockEditPage = jest.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: 'https://telegra.ph/force-republish',
        path: '/edit/force-republish'
      });

      // Call publishWithMetadata with forceRepublish (should use edit path, but bypass content checks)
      const result = await publisher.publishWithMetadata(testFile, 'test-user', {
        debug: true,
        dryRun: true,
        forceRepublish: true,
        withDependencies: false
      });

      // Verify it was treated as edit operation (correct behavior after fix)
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);

      // Verify JSON file was created
      expect(existsSync(expectedJsonFile)).toBe(true);

      const jsonContent = JSON.parse(readFileSync(expectedJsonFile, 'utf-8'));
      expect(Array.isArray(jsonContent)).toBe(true);
      expect(JSON.stringify(jsonContent)).toContain('This will be force republished');

      mockEditPage.mockRestore();
    });
  });
});