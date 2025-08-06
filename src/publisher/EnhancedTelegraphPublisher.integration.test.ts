import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import type { MetadataConfig } from '../types/metadata';

// Mock all dependencies
vi.mock('../cli/ProgressIndicator');
vi.mock('../metadata/MetadataManager');
vi.mock('../content/ContentProcessor');
vi.mock('node:fs');
vi.mock('node:crypto');

describe('EnhancedTelegraphPublisher - Integration Tests', () => {
  let publisher: EnhancedTelegraphPublisher;
  let mockConfig: MetadataConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      metadataPosition: 'top',
      metadataFormat: 'yaml',
      rateLimiting: {
        enabled: false,
        requestsPerSecond: 1,
        burstLimit: 5
      },
      maxDependencyDepth: 20
    };

    publisher = new EnhancedTelegraphPublisher(mockConfig);
    publisher.setAccessToken('test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 4.2.1: Unchanged file detection with same mtime and hash', () => {
    it('should skip unchanged files using timestamp-first validation', async () => {
      const testFilePath = '/test/unchanged.md';
      const publishedAt = '2025-08-06T10:00:00.000Z';
      const currentMtime = '2025-08-06T10:00:00.000Z'; // Same as publishedAt
      
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: publishedAt,
        contentHash: 'unchanged-hash'
      };

      // Mock MetadataManager
      const { MetadataManager } = await import('../metadata/MetadataManager');
      vi.mocked(MetadataManager.getPublicationInfo).mockReturnValue(existingMetadata);

      // Mock filesystem with same timestamp
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockReturnValue({
        mtime: new Date(currentMtime)
      } as any);

      // Mock ContentProcessor
      const { ContentProcessor } = await import('../content/ContentProcessor');
      vi.mocked(ContentProcessor.processFile).mockReturnValue({
        contentWithoutMetadata: 'test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      });

      // Mock ProgressIndicator
      const { ProgressIndicator } = await import('../cli/ProgressIndicator');
      const showStatusSpy = vi.mocked(ProgressIndicator.showStatus);

      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: false,
        debug: false
      });

      // Verify fast path was taken (timestamp check)
      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚡ Content unchanged (timestamp check)'),
        'info'
      );

      // Verify early return without publication
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);
      expect(result.url).toBe(existingMetadata.telegraphUrl);
    });
  });

  describe('Task 4.2.2: Modified file detection with changed mtime but same hash', () => {
    it('should detect timestamp change but skip publication when hash is same', async () => {
      const testFilePath = '/test/touched-only.md';
      const publishedAt = '2025-08-06T10:00:00.000Z';
      const newerMtime = '2025-08-06T11:00:00.000Z'; // File was touched but content unchanged
      
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: publishedAt,
        contentHash: 'same-hash'
      };

      // Mock MetadataManager
      const { MetadataManager } = await import('../metadata/MetadataManager');
      vi.mocked(MetadataManager.getPublicationInfo).mockReturnValue(existingMetadata);

      // Mock filesystem with newer timestamp
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockReturnValue({
        mtime: new Date(newerMtime)
      } as any);

      // Mock ContentProcessor
      const { ContentProcessor } = await import('../content/ContentProcessor');
      vi.mocked(ContentProcessor.processFile).mockReturnValue({
        contentWithoutMetadata: 'test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      });

      // Mock hash calculation to return same hash
      vi.spyOn(publisher as any, 'calculateContentHash').mockReturnValue('same-hash');

      // Mock ProgressIndicator
      const { ProgressIndicator } = await import('../cli/ProgressIndicator');
      const showStatusSpy = vi.mocked(ProgressIndicator.showStatus);

      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: false,
        debug: false
      });

      // Verify timestamp changed but hash same message
      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('📝 Content timestamp changed, but hash is identical'),
        'info'
      );

      // Verify skipped publication
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);
    });
  });

  describe('Task 4.2.3: Modified file detection with changed mtime and hash', () => {
    it('should proceed with publication when both timestamp and hash changed', async () => {
      const testFilePath = '/test/modified.md';
      const publishedAt = '2025-08-06T10:00:00.000Z';
      const newerMtime = '2025-08-06T11:00:00.000Z';
      
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: publishedAt,
        contentHash: 'old-hash'
      };

      // Mock MetadataManager
      const { MetadataManager } = await import('../metadata/MetadataManager');
      vi.mocked(MetadataManager.getPublicationInfo).mockReturnValue(existingMetadata);

      // Mock filesystem with newer timestamp
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockReturnValue({
        mtime: new Date(newerMtime)
      } as any);

      // Mock ContentProcessor
      const { ContentProcessor } = await import('../content/ContentProcessor');
      vi.mocked(ContentProcessor.processFile).mockReturnValue({
        contentWithoutMetadata: 'modified test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      });

      vi.mocked(ContentProcessor.validateContent).mockReturnValue({
        isValid: true,
        issues: []
      });

      vi.mocked(ContentProcessor.prepareForPublication).mockReturnValue('prepared content');
      vi.mocked(ContentProcessor.extractTitle).mockReturnValue('Test Page');
      vi.mocked(ContentProcessor.injectMetadataIntoContent).mockReturnValue('content with metadata');

      // Mock hash calculation to return different hash
      vi.spyOn(publisher as any, 'calculateContentHash').mockReturnValue('new-hash');

      // Mock Telegraph API
      vi.spyOn(publisher, 'editPage').mockResolvedValue({
        url: 'https://telegra.ph/updated-page',
        path: 'updated-path'
      });

      // Mock markdown converter
      vi.doMock('../markdownConverter', () => ({
        convertMarkdownToTelegraphNodes: vi.fn().mockReturnValue([{ tag: 'p', children: ['test'] }])
      }));

      // Mock file write
      const { writeFileSync } = await import('node:fs');
      vi.mocked(writeFileSync).mockImplementation(() => {});

      // Mock ProgressIndicator
      const { ProgressIndicator } = await import('../cli/ProgressIndicator');
      const showStatusSpy = vi.mocked(ProgressIndicator.showStatus);

      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: false,
        debug: false
      });

      // Verify content changed message
      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔄 Content changed (hash verification). Proceeding with publication'),
        'info'
      );

      // Verify publication proceeded
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://telegra.ph/updated-page');
    });
  });

  describe('Task 4.2.4: Force flag with unchanged target and dependencies', () => {
    it('should force republish all files when --force flag is used', async () => {
      const rootFile = '/test/root.md';
      const depFile = '/test/dependency.md';
      
      const unchangedMetadata = {
        telegraphUrl: 'https://telegra.ph/unchanged',
        editPath: 'unchanged-path',
        title: 'Unchanged Page',
        publishedAt: '2025-08-06T12:00:00.000Z', // Future time
        contentHash: 'unchanged-hash'
      };

      // Mock MetadataManager for both files
      const { MetadataManager } = await import('../metadata/MetadataManager');
      vi.mocked(MetadataManager.getPublicationInfo).mockReturnValue(unchangedMetadata);

      // Mock dependency tree
      const mockDependencyTree = {
        [rootFile]: new Set([depFile])
      };

      const mockAnalysis = {
        publishOrder: [depFile, rootFile],
        circularDependencies: []
      };

      vi.spyOn(publisher['dependencyManager'], 'buildDependencyTree').mockReturnValue(mockDependencyTree);
      vi.spyOn(publisher['dependencyManager'], 'analyzeDependencyTree').mockReturnValue(mockAnalysis);

      // Mock filesystem with old timestamps
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockReturnValue({
        mtime: new Date('2025-08-06T10:00:00.000Z') // Earlier than publishedAt
      } as any);

      // Mock ContentProcessor
      const { ContentProcessor } = await import('../content/ContentProcessor');
      vi.mocked(ContentProcessor.processFile).mockReturnValue({
        contentWithoutMetadata: 'unchanged content',
        frontMatter: {},
        title: 'Unchanged Page',
        localLinks: []
      });

      vi.mocked(ContentProcessor.validateContent).mockReturnValue({
        isValid: true,
        issues: []
      });

      vi.mocked(ContentProcessor.prepareForPublication).mockReturnValue('prepared content');
      vi.mocked(ContentProcessor.extractTitle).mockReturnValue('Unchanged Page');
      vi.mocked(ContentProcessor.injectMetadataIntoContent).mockReturnValue('content with metadata');

      // Mock hash calculation to return same hash (unchanged)
      vi.spyOn(publisher as any, 'calculateContentHash').mockReturnValue('unchanged-hash');

      // Mock Telegraph API
      vi.spyOn(publisher, 'editPage').mockResolvedValue({
        url: 'https://telegra.ph/forced-update',
        path: 'forced-path'
      });

      // Mock publishWithMetadata for dependencies
      vi.spyOn(publisher, 'publishWithMetadata').mockResolvedValue({
        success: true,
        url: 'https://telegra.ph/forced-dep',
        path: 'forced-dep-path',
        isNewPublication: false,
        metadata: unchangedMetadata
      });

      // Mock markdown converter
      vi.doMock('../markdownConverter', () => ({
        convertMarkdownToTelegraphNodes: vi.fn().mockReturnValue([{ tag: 'p', children: ['test'] }])
      }));

      // Mock file write
      const { writeFileSync } = await import('node:fs');
      vi.mocked(writeFileSync).mockImplementation(() => {});

      // Mock ProgressIndicator
      const { ProgressIndicator } = await import('../cli/ProgressIndicator');
      const showStatusSpy = vi.mocked(ProgressIndicator.showStatus);

      // Test root file with force
      const result = await publisher.editWithMetadata(rootFile, 'testuser', {
        forceRepublish: true,
        debug: false,
        withDependencies: true
      });

      // Verify force messages were shown
      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚙️ --force flag detected. Forcing republication'),
        'info'
      );

      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔄 FORCE: Processing dependency'),
        'info'
      );

      // Verify publication proceeded despite unchanged content
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://telegra.ph/forced-update');
    });
  });

  describe('Fallback and error handling integration', () => {
    it('should fallback gracefully when timestamp read fails', async () => {
      const testFilePath = '/test/fallback.md';
      
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: '2025-08-06T10:00:00.000Z',
        contentHash: 'same-hash'
      };

      // Mock MetadataManager
      const { MetadataManager } = await import('../metadata/MetadataManager');
      vi.mocked(MetadataManager.getPublicationInfo).mockReturnValue(existingMetadata);

      // Mock filesystem error
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('File access denied');
      });

      // Mock ContentProcessor
      const { ContentProcessor } = await import('../content/ContentProcessor');
      vi.mocked(ContentProcessor.processFile).mockReturnValue({
        contentWithoutMetadata: 'test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      });

      // Mock hash calculation to return same hash
      vi.spyOn(publisher as any, 'calculateContentHash').mockReturnValue('same-hash');

      // Mock ProgressIndicator
      const { ProgressIndicator } = await import('../cli/ProgressIndicator');
      const showStatusSpy = vi.mocked(ProgressIndicator.showStatus);

      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: false,
        debug: false
      });

      // Verify fallback warning and hash-based skip
      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Cannot read file timestamp, falling back to hash validation'),
        'warning'
      );

      expect(showStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('📄 Content unchanged (hash fallback)'),
        'info'
      );

      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);
    });
  });

  describe('Performance validation', () => {
    it('should demonstrate fast path performance for unchanged files', async () => {
      const testFilePath = '/test/performance.md';
      
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: '2025-08-06T12:00:00.000Z', // Future time
        contentHash: 'any-hash'
      };

      // Mock MetadataManager
      const { MetadataManager } = await import('../metadata/MetadataManager');
      vi.mocked(MetadataManager.getPublicationInfo).mockReturnValue(existingMetadata);

      // Mock filesystem with old timestamp
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockReturnValue({
        mtime: new Date('2025-08-06T10:00:00.000Z') // Earlier than publishedAt
      } as any);

      // Mock ContentProcessor (should not be called for hash calculation)
      const { ContentProcessor } = await import('../content/ContentProcessor');
      vi.mocked(ContentProcessor.processFile).mockReturnValue({
        contentWithoutMetadata: 'test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      });

      // Mock hash calculation - this should NOT be called for fast path
      const calculateContentHashSpy = vi.spyOn(publisher as any, 'calculateContentHash');

      const startTime = performance.now();
      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: false,
        debug: false
      });
      const endTime = performance.now();

      // Verify fast path was taken (no hash calculation)
      expect(calculateContentHashSpy).not.toHaveBeenCalled();
      
      // Verify result
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);

      // Performance should be very fast (under 10ms for mocked operations)
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(100); // Generous limit for CI environments
    });
  });
}); 