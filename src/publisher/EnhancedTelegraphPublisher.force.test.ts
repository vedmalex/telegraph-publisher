import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedTelegraphPublisher } from './EnhancedTelegraphPublisher';
import { ProgressIndicator } from '../cli/ProgressIndicator';
import { MetadataManager } from '../metadata/MetadataManager';
import type { MetadataConfig } from '../types/metadata';

// Mock dependencies
vi.mock('../cli/ProgressIndicator');
vi.mock('../metadata/MetadataManager');
vi.mock('node:fs');

const mockedProgressIndicator = vi.mocked(ProgressIndicator);
const mockedMetadataManager = vi.mocked(MetadataManager);

describe('EnhancedTelegraphPublisher - Force Flag Propagation', () => {
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

  describe('Task 4.1.3: Force flag bypassing all validation tests', () => {
    it('should bypass timestamp and hash validation when forceRepublish is true', async () => {
      const testFilePath = '/test/file.md';
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: '2025-08-06T10:00:00.000Z',
        contentHash: 'existing-hash'
      };

      // Mock file exists and has metadata
      mockedMetadataManager.getPublicationInfo.mockReturnValue(existingMetadata);

      // Mock content processing
      const mockProcessed = {
        contentWithoutMetadata: 'test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      };
      
      vi.doMock('../content/ContentProcessor', () => ({
        ContentProcessor: {
          processFile: vi.fn().mockReturnValue(mockProcessed),
          validateContent: vi.fn().mockReturnValue({ isValid: true, issues: [] }),
          prepareForPublication: vi.fn().mockReturnValue('prepared content'),
          extractTitle: vi.fn().mockReturnValue('Test Page'),
          injectMetadataIntoContent: vi.fn().mockReturnValue('content with metadata')
        }
      }));

      // Mock Telegraph API
      const mockResult = { url: 'https://telegra.ph/updated', path: 'updated-path' };
      vi.spyOn(publisher, 'editPage').mockResolvedValue(mockResult);

      // Mock calculateContentHash
      vi.spyOn(publisher as any, 'calculateContentHash').mockReturnValue('existing-hash');

      // Call editWithMetadata with forceRepublish: true
      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: true,
        debug: false
      });

      // Verify force message was shown
      expect(mockedProgressIndicator.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('⚙️ --force flag detected. Forcing republication'),
        'info'
      );

      // Verify it proceeded to publication (didn't return early)
      expect(result.success).toBe(true);
    });

    it('should skip publication for unchanged files when forceRepublish is false', async () => {
      const testFilePath = '/test/unchanged-file.md';
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: '2025-08-06T12:00:00.000Z', // Future time
        contentHash: 'existing-hash'
      };

      mockedMetadataManager.getPublicationInfo.mockReturnValue(existingMetadata);

      // Mock filesystem timestamp check
      const { statSync } = await import('node:fs');
      vi.mocked(statSync).mockReturnValue({
        mtime: new Date('2025-08-06T10:00:00.000Z') // Earlier than publishedAt
      } as any);

      const mockProcessed = {
        contentWithoutMetadata: 'test content',
        frontMatter: {},
        title: 'Test Page',
        localLinks: []
      };

      vi.doMock('../content/ContentProcessor', () => ({
        ContentProcessor: {
          processFile: vi.fn().mockReturnValue(mockProcessed)
        }
      }));

      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        forceRepublish: false,
        debug: false
      });

      // Verify timestamp check message was shown
      expect(mockedProgressIndicator.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('⚡ Content unchanged (timestamp check)'),
        'info'
      );

      // Verify it returned early without publication
      expect(result.success).toBe(true);
      expect(result.isNewPublication).toBe(false);
    });
  });

  describe('Task 4.1.4: Dependency force propagation tests', () => {
    it('should propagate force flag to all dependencies', async () => {
      const rootFile = '/test/root.md';
      const dependencyFile = '/test/dependency.md';

      // Mock dependency tree
      const mockDependencyTree = {
        [rootFile]: new Set([dependencyFile])
      };

      const mockAnalysis = {
        publishOrder: [dependencyFile, rootFile],
        circularDependencies: []
      };

      // Mock dependency manager
      vi.spyOn(publisher['dependencyManager'], 'buildDependencyTree').mockReturnValue(mockDependencyTree);
      vi.spyOn(publisher['dependencyManager'], 'analyzeDependencyTree').mockReturnValue(mockAnalysis);

      // Mock publishWithMetadata to track calls
      const publishWithMetadataSpy = vi.spyOn(publisher, 'publishWithMetadata').mockResolvedValue({
        success: true,
        url: 'https://telegra.ph/test',
        path: 'test-path',
        isNewPublication: false,
        metadata: {}
      });

      // Call publishDependencies with force: true
      const result = await publisher.publishDependencies(rootFile, 'testuser', {
        force: true,
        dryRun: false,
        debug: false
      });

      // Verify force propagation message
      expect(mockedProgressIndicator.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('🔄 FORCE: Processing dependency'),
        'info'
      );

      // Verify publishWithMetadata was called with forceRepublish: true
      expect(publishWithMetadataSpy).toHaveBeenCalledWith(
        dependencyFile,
        'testuser',
        expect.objectContaining({
          forceRepublish: true,
          withDependencies: false
        })
      );

      expect(result.success).toBe(true);
    });

    it('should use standard change detection when force is false', async () => {
      const rootFile = '/test/root.md';
      const dependencyFile = '/test/dependency.md';

      const mockDependencyTree = {
        [rootFile]: new Set([dependencyFile])
      };

      const mockAnalysis = {
        publishOrder: [dependencyFile, rootFile],
        circularDependencies: []
      };

      vi.spyOn(publisher['dependencyManager'], 'buildDependencyTree').mockReturnValue(mockDependencyTree);
      vi.spyOn(publisher['dependencyManager'], 'analyzeDependencyTree').mockReturnValue(mockAnalysis);

      // Mock processFileByStatus
      const processFileByStatusSpy = vi.spyOn(publisher as any, 'processFileByStatus').mockResolvedValue(undefined);

      const result = await publisher.publishDependencies(rootFile, 'testuser', {
        force: false,
        dryRun: false,
        debug: false
      });

      // Verify processFileByStatus was called (standard mode)
      expect(processFileByStatusSpy).toHaveBeenCalledWith(
        dependencyFile,
        'testuser',
        expect.any(Array),
        expect.any(Object),
        expect.objectContaining({ force: false })
      );

      // Verify no force messages
      expect(mockedProgressIndicator.showStatus).not.toHaveBeenCalledWith(
        expect.stringContaining('🔄 FORCE:'),
        'info'
      );

      expect(result.success).toBe(true);
    });

    it('should handle force flag in backfill operations correctly', async () => {
      const testFilePath = '/test/backfill-file.md';
      const existingMetadata = {
        telegraphUrl: 'https://telegra.ph/test-page',
        editPath: 'edit-path',
        title: 'Test Page',
        publishedAt: '2025-08-06T10:00:00.000Z'
        // Note: no contentHash, so backfill is needed
      };

      // Mock the processFileByStatus method flow for backfill case
      const mockStats = { backfilledFiles: 0 };
      const mockPublishedFiles: string[] = [];

      // Mock editWithMetadata for backfill operation
      const editWithMetadataSpy = vi.spyOn(publisher, 'editWithMetadata').mockResolvedValue({
        success: true,
        url: 'https://telegra.ph/updated',
        path: 'updated-path',
        isNewPublication: false,
        metadata: existingMetadata
      });

      // Create options with force: false to test that backfill respects the flag
      const options = {
        force: false,
        dryRun: false,
        debug: false,
        generateAside: true,
        tocTitle: '',
        tocSeparators: true
      };

      // Call handlePublishedFile directly (this is where backfill logic resides)
      await (publisher as any).handlePublishedFile(
        testFilePath,
        'testuser',
        mockPublishedFiles,
        mockStats,
        existingMetadata,
        options
      );

      // Verify editWithMetadata was called with the correct force flag
      expect(editWithMetadataSpy).toHaveBeenCalledWith(
        testFilePath,
        'testuser',
        expect.objectContaining({
          forceRepublish: false // Should use actual force flag, not hardcoded true
        })
      );
    });
  });

  describe('Integration tests: Force flag end-to-end', () => {
    it('should maintain force context throughout entire dependency chain', async () => {
      const rootFile = '/test/root.md';
      const dep1 = '/test/dep1.md';
      const dep2 = '/test/dep2.md';

      // Create a chain: root -> dep1 -> dep2
      const mockDependencyTree = {
        [rootFile]: new Set([dep1]),
        [dep1]: new Set([dep2])
      };

      const mockAnalysis = {
        publishOrder: [dep2, dep1, rootFile],
        circularDependencies: []
      };

      vi.spyOn(publisher['dependencyManager'], 'buildDependencyTree').mockReturnValue(mockDependencyTree);
      vi.spyOn(publisher['dependencyManager'], 'analyzeDependencyTree').mockReturnValue(mockAnalysis);

      const publishWithMetadataSpy = vi.spyOn(publisher, 'publishWithMetadata').mockResolvedValue({
        success: true,
        url: 'https://telegra.ph/test',
        path: 'test-path',
        isNewPublication: false,
        metadata: {}
      });

      // Test with force: true
      await publisher.publishDependencies(rootFile, 'testuser', {
        force: true,
        dryRun: false,
        debug: false
      });

      // Verify all dependencies were called with force
      expect(publishWithMetadataSpy).toHaveBeenCalledWith(
        dep2,
        'testuser',
        expect.objectContaining({ forceRepublish: true })
      );

      expect(publishWithMetadataSpy).toHaveBeenCalledWith(
        dep1,
        'testuser',
        expect.objectContaining({ forceRepublish: true })
      );
    });
  });
}); 