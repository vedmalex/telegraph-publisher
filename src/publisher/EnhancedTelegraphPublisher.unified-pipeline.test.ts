import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import type { MetadataConfig } from '../types/metadata';

/**
 * Comprehensive test suite for the unified publication pipeline fix
 * Tests the fix for REQ-001: dependency files skipping link replacement
 * 
 * Bug: When publishing a root file that has dependencies, the links within 
 * dependency files are not being replaced with Telegraph URLs before publication.
 * 
 * Solution: Decouple link replacement from withDependencies flag and use
 * global configuration (this.config.replaceLinksinContent) instead.
 */
describe('EnhancedTelegraphPublisher - Unified Pipeline', () => {
  let publisher: EnhancedTelegraphPublisher;
  let testDir: string;
  let rootFile: string;
  let dependencyFile: string;
  let subDependencyFile: string;

  // Mock configuration for testing
  const testConfig: MetadataConfig = {
    defaultUsername: 'test-user',
    maxDependencyDepth: 3, // Allow multi-level dependencies for full test
    replaceLinksinContent: true, // KEY: This should control link replacement
    autoPublishDependencies: true,
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

  beforeEach(() => {
    // Create test directory structure
    testDir = resolve(__dirname, '../../test-unified-pipeline');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Define test file paths
    rootFile = resolve(testDir, 'root.md');
    dependencyFile = resolve(testDir, 'dependency.md');
    subDependencyFile = resolve(testDir, 'sub-dependency.md');

    // Create test files with multi-level dependencies
    writeFileSync(subDependencyFile, `# Sub Dependency
This is the deepest level file with no dependencies.

Some content here.
`);

    writeFileSync(dependencyFile, `# Dependency
This file depends on a sub-dependency.

Link to sub-dependency: [Sub Dependency](./sub-dependency.md)

Some content here.
`);

    writeFileSync(rootFile, `# Root File
This is the root file that has dependencies.

Link to dependency: [Dependency](./dependency.md)

Some content here.
`);

    // Test config is ready - no base directory property needed
    
    // Create publisher instance
    publisher = new EnhancedTelegraphPublisher(testConfig);
    publisher.setAccessToken('test-token');
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('REQ-001: Fix dependency link replacement bug', () => {
    it('should replace links based on global config, not withDependencies flag', async () => {
      // Mock the replaceLinksWithTelegraphUrls method to track calls
      const mockReplaceLinks = vi.spyOn(publisher as any, 'replaceLinksWithTelegraphUrls');
      mockReplaceLinks.mockImplementation(async (processed) => processed);

      // Mock Telegraph API
      const mockPublishNodes = vi.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/test-123',
        path: 'test-123',
        title: 'Test',
        author_name: 'test-user',
        views: 0
      });

      // Test 1: withDependencies = false, replaceLinksinContent = true
      // OLD BEHAVIOR: Would NOT call link replacement (coupled to withDependencies)
      // NEW BEHAVIOR: SHOULD call link replacement (based on global config)
      const result1 = await publisher.publishWithMetadata(dependencyFile, 'test-user', {
        withDependencies: false, // This should NOT affect link replacement anymore
        dryRun: false
      });

      expect(result1.success).toBe(true);
      // CRITICAL TEST: Link replacement should be called despite withDependencies = false
      expect(mockReplaceLinks).toHaveBeenCalled();

      // Reset mock for next test
      mockReplaceLinks.mockClear();

      // Test 2: Verify the NEW logic works as expected with dry run
      // Test with dependency file that HAS local links
      const result2 = await publisher.publishWithMetadata(dependencyFile, 'test-user', {
        withDependencies: false, // This should NOT be the deciding factor anymore
        dryRun: true, // Use dry run to avoid API issues
        forceRepublish: true
      });

      expect(result2.success).toBe(true);
      expect(mockReplaceLinks).toHaveBeenCalled();
    });

    it('should respect global configuration for link replacement', async () => {
      // Test with replaceLinksinContent = false
      const configWithoutReplacement: MetadataConfig = {
        ...testConfig,
        replaceLinksinContent: false
      };

      const publisherNoReplacement = new EnhancedTelegraphPublisher(configWithoutReplacement);
      publisherNoReplacement.setAccessToken('test-token');

      // Mock the replaceLinksWithTelegraphUrls method to track calls
      const mockReplaceLinks = vi.spyOn(publisherNoReplacement as any, 'replaceLinksWithTelegraphUrls');

      // Mock Telegraph API
      const mockPublishNodes = vi.spyOn(publisherNoReplacement, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/test-123',
        path: 'test-123',
        title: 'Test',
        author_name: 'test-user',
        views: 0
      });

      // Publish with dependencies but link replacement disabled in config
      await publisherNoReplacement.publishWithMetadata(dependencyFile, 'test-user', {
        withDependencies: true,
        dryRun: false
      });

      // Verify that link replacement was NOT called when config disables it
      expect(mockReplaceLinks).not.toHaveBeenCalled();
    });

    it('should work consistently for both publishWithMetadata and editWithMetadata', async () => {
      // First, publish the file to create metadata
      const mockPublishNodes = vi.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/test-123',
        path: 'test-123',
        title: 'Test',
        author_name: 'test-user',
        views: 0
      });

      // Publish file first to create metadata
      await publisher.publishWithMetadata(dependencyFile, 'test-user', {
        withDependencies: false,
        dryRun: false
      });

      // Now test editWithMetadata with same logic
      const mockEditPage = vi.spyOn(publisher, 'editPage');
      mockEditPage.mockResolvedValue({
        url: 'https://telegra.ph/test-123',
        path: 'test-123',
        title: 'Test',
        author_name: 'test-user',
        views: 0
      });

      // Mock the replaceLinksWithTelegraphUrls method to track calls
      const mockReplaceLinks = vi.spyOn(publisher as any, 'replaceLinksWithTelegraphUrls');
      mockReplaceLinks.mockImplementation(async (processed) => processed);

      // Edit the file - should use same unified pipeline logic
      await publisher.editWithMetadata(dependencyFile, 'test-user', {
        withDependencies: false, // Should NOT affect link replacement
        forceRepublish: true
      });

      // Verify that link replacement was called (unified pipeline)
      expect(mockReplaceLinks).toHaveBeenCalled();
    });
  });

  describe('REQ-004: Maintain recursion prevention', () => {
    it('should preserve withDependencies flag functionality for recursion control', async () => {
      // Mock Telegraph API to prevent actual calls
      const mockPublishNodes = vi.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/mock',
        path: 'mock',
        title: 'Mock',
        author_name: 'test-user',
        views: 0
      });

      // Publish with withDependencies: false should not process dependencies
      const result = await publisher.publishWithMetadata(rootFile, 'test-user', {
        withDependencies: false,
        dryRun: true
      });

      // DryRun should succeed but not call publishNodes (it's just validation)
      expect(result.success).toBe(true);
      expect(mockPublishNodes).not.toHaveBeenCalled();
      
      // Verify it returns dry run response
      expect(result.url).toContain('[DRY RUN]');
    });
  });

  describe('REQ-006: Performance optimization', () => {
    it('should skip link replacement when no local links are present', async () => {
      // Create file without local links
      const fileWithoutLinks = resolve(testDir, 'no-links.md');
      writeFileSync(fileWithoutLinks, `# File Without Links
This file has no local links.

Just some content.
`);

      // Mock the replaceLinksWithTelegraphUrls method to track calls
      const mockReplaceLinks = vi.spyOn(publisher as any, 'replaceLinksWithTelegraphUrls');

      // Mock Telegraph API
      const mockPublishNodes = vi.spyOn(publisher, 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/no-links-123',
        path: 'no-links-123',
        title: 'File Without Links',
        author_name: 'test-user',
        views: 0
      });

      // Publish file without links
      await publisher.publishWithMetadata(fileWithoutLinks, 'test-user', {
        withDependencies: true,
        dryRun: false
      });

      // Should not call link replacement for files without local links
      expect(mockReplaceLinks).not.toHaveBeenCalled();
    });
  });
}); 