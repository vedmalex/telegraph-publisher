import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EnhancedTelegraphPublisher } from '../publisher/EnhancedTelegraphPublisher';
import { MetadataManager } from '../metadata/MetadataManager';
import type { MetadataConfig } from '../types/metadata';

// Mock Telegraph API
const mockTelegraphAPI = {
  createPage: vi.fn().mockResolvedValue({
    url: 'https://telegra.ph/test-page-01-01',
    path: 'test-page-01-01',
    title: 'Test Page'
  }),
  editPage: vi.fn().mockResolvedValue({
    url: 'https://telegra.ph/test-page-01-01',
    path: 'test-page-01-01', 
    title: 'Test Page'
  })
};

describe('Metadata Preservation Integration Tests', () => {
  let publisher: EnhancedTelegraphPublisher;
  let testFilePath: string;
  let testConfig: MetadataConfig;

  beforeEach(() => {
    // Setup test configuration
    testConfig = {
      rootDirectory: process.cwd(),
      maxDependencyDepth: 2,
      autoTrackMetadata: true,
      replaceLinksinContent: true,
      rateLimiting: {
        enabled: false,
        requestsPerMinute: 60,
        requestsPerHour: 300
      }
    };

    // Create publisher instance
    publisher = new EnhancedTelegraphPublisher(testConfig);
    publisher.setAccessToken('test-token');

    // Mock Telegraph API methods
    vi.spyOn(publisher, 'publishNodes').mockImplementation(async (title, nodes) => {
      return mockTelegraphAPI.createPage();
    });

    vi.spyOn(publisher, 'editPage').mockImplementation(async (path, title, nodes, username) => {
      return mockTelegraphAPI.editPage();
    });

    // Setup test file path
    testFilePath = resolve(join(process.cwd(), 'test-metadata-preservation.md'));
  });

  afterEach(() => {
    // Cleanup test files
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
    vi.clearAllMocks();
  });

  describe('publishWithMetadata - withDependencies=false preservation', () => {
    it('should preserve existing publishedDependencies when withDependencies=false', async () => {
      // Arrange: Create file with existing publishedDependencies
      const initialContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies:
  dep1.md: "https://telegra.ph/dep1-01-01"
  dep2.md: "https://telegra.ph/dep2-01-01"
---

# Test Content

This is test content for metadata preservation.`;

      writeFileSync(testFilePath, initialContent, 'utf-8');

      // Act: Publish with withDependencies=false
      const result = await publisher.publishWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false
      });

      // Assert: Check that publishedDependencies are preserved
      expect(result.success).toBe(true);
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      
      expect(metadata).toBeTruthy();
      expect(metadata!.publishedDependencies).toEqual({
        "dep1.md": "https://telegra.ph/dep1-01-01",
        "dep2.md": "https://telegra.ph/dep2-01-01"
      });
    });

    it('should handle files with no existing publishedDependencies', async () => {
      // Arrange: Create file without publishedDependencies
      const initialContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
---

# Test Content

This is test content without dependencies.`;

      writeFileSync(testFilePath, initialContent, 'utf-8');

      // Act: Publish with withDependencies=false
      const result = await publisher.publishWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false
      });

      // Assert: Should have empty publishedDependencies
      expect(result.success).toBe(true);
      
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata).toBeTruthy();
      // Handle case where publishedDependencies might be undefined
      expect(metadata!.publishedDependencies || {}).toEqual({});
    });
  });

  describe('publishWithMetadata - withDependencies=true update', () => {
    it('should update publishedDependencies when withDependencies=true', async () => {
      // Arrange: Create file with old dependencies
      const initialContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies:
  old-dep.md: "https://telegra.ph/old-dep-01-01"
---

# Test Content

This is test content with old dependencies.`;

      writeFileSync(testFilePath, initialContent, 'utf-8');

      // Mock dependency processing to return new dependencies
      const mockNewDependencies = {
        "new-dep1.md": "https://telegra.ph/new-dep1-01-01",
        "new-dep2.md": "https://telegra.ph/new-dep2-01-01"
      };

      vi.spyOn(publisher, 'publishDependencies').mockResolvedValue({
        success: true,
        publishedFiles: ['new-dep1.md', 'new-dep2.md'],
        linkMappings: mockNewDependencies
      });

      // Act: Publish with withDependencies=true
      const result = await publisher.publishWithMetadata(testFilePath, 'testuser', {
        withDependencies: true,
        dryRun: false
      });

      // Assert: Check that publishedDependencies are updated
      expect(result.success).toBe(true);
      
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata).toBeTruthy();
      expect(metadata!.publishedDependencies).toEqual(mockNewDependencies);
    });
  });

  describe('editWithMetadata - withDependencies=false preservation', () => {
    it('should preserve existing publishedDependencies during edit when withDependencies=false', async () => {
      // Arrange: Create published file with existing dependencies
      const initialContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies:
  dep1.md: "https://telegra.ph/dep1-01-01"
  dep2.md: "https://telegra.ph/dep2-01-01"
---

# Test Content (Modified)

This is modified test content for metadata preservation.`;

      writeFileSync(testFilePath, initialContent, 'utf-8');

      // Act: Edit with withDependencies=false
      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false,
        forceRepublish: true // Force edit to bypass change detection
      });

      // Assert: Check that publishedDependencies are preserved
      expect(result.success).toBe(true);
      
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata).toBeTruthy();
      expect(metadata!.publishedDependencies).toEqual({
        "dep1.md": "https://telegra.ph/dep1-01-01",
        "dep2.md": "https://telegra.ph/dep2-01-01"
      });
    });

    it('should handle edit of file with empty publishedDependencies', async () => {
      // Arrange: Create published file without dependencies
      const initialContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies: {}
---

# Test Content (Modified)

This is modified test content without dependencies.`;

      writeFileSync(testFilePath, initialContent, 'utf-8');

      // Act: Edit with withDependencies=false
      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false,
        forceRepublish: true
      });

      // Assert: Should maintain empty publishedDependencies
      expect(result.success).toBe(true);
      
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata).toBeTruthy();
      expect(metadata!.publishedDependencies || {}).toEqual({});
    });
  });

  describe('editWithMetadata - withDependencies=true update', () => {
    it('should update publishedDependencies during edit when withDependencies=true', async () => {
      // Arrange: Create published file with old dependencies
      const initialContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies:
  old-dep.md: "https://telegra.ph/old-dep-01-01"
---

# Test Content (Modified)

This is modified test content with updated dependencies.`;

      writeFileSync(testFilePath, initialContent, 'utf-8');

      // Mock dependency processing to return updated dependencies
      const mockUpdatedDependencies = {
        "updated-dep1.md": "https://telegra.ph/updated-dep1-01-01",
        "updated-dep2.md": "https://telegra.ph/updated-dep2-01-01"
      };

      vi.spyOn(publisher, 'publishDependencies').mockResolvedValue({
        success: true,
        publishedFiles: ['updated-dep1.md', 'updated-dep2.md'],
        linkMappings: mockUpdatedDependencies
      });

      // Act: Edit with withDependencies=true
      const result = await publisher.editWithMetadata(testFilePath, 'testuser', {
        withDependencies: true,
        dryRun: false,
        forceRepublish: true
      });

      // Assert: Check that publishedDependencies are updated
      expect(result.success).toBe(true);
      
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata).toBeTruthy();
      expect(metadata!.publishedDependencies).toEqual(mockUpdatedDependencies);
    });
  });

  describe('Consistency between publishWithMetadata and editWithMetadata', () => {
    it('should behave identically for both methods with same parameters', async () => {
      // Test that both methods preserve metadata consistently
      const testDependencies = {
        "consistency-test.md": "https://telegra.ph/consistency-test-01-01"
      };

      // Test publishWithMetadata first
      const publishContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies:
  consistency-test.md: "https://telegra.ph/consistency-test-01-01"
---

# Publish Test Content`;

      writeFileSync(testFilePath, publishContent, 'utf-8');

      const publishResult = await publisher.publishWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false
      });

      const publishMetadata = MetadataManager.getPublicationInfo(testFilePath);

      // Test editWithMetadata with same conditions
      const editContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies:
  consistency-test.md: "https://telegra.ph/consistency-test-01-01"
---

# Edit Test Content`;

      writeFileSync(testFilePath, editContent, 'utf-8');

      const editResult = await publisher.editWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false,
        forceRepublish: true
      });

      const editMetadata = MetadataManager.getPublicationInfo(testFilePath);

      // Assert: Both should preserve dependencies identically
      expect(publishResult.success).toBe(true);
      expect(editResult.success).toBe(true);
      expect(publishMetadata?.publishedDependencies).toEqual(testDependencies);
      expect(editMetadata?.publishedDependencies).toEqual(testDependencies);
      expect(publishMetadata?.publishedDependencies).toEqual(editMetadata?.publishedDependencies);
    });
  });

  describe('Error scenarios and edge cases', () => {
    it('should handle corrupted metadata gracefully', async () => {
      // Arrange: Create file with malformed metadata
      const corruptedContent = `---
telegraphUrl: https://telegra.ph/existing-page-01-01
editPath: existing-page-01-01
username: testuser
publishedAt: 2025-01-01T00:00:00.000Z
originalFilename: test-metadata-preservation.md
title: Test Page
contentHash: abc123
accessToken: test-token
publishedDependencies: not-an-object
---

# Test Content`;

      writeFileSync(testFilePath, corruptedContent, 'utf-8');

      // Act & Assert: Should handle gracefully without crashing
      const result = await publisher.publishWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false
      });

      // Should succeed and treat as empty dependencies
      expect(result.success).toBe(true);
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata?.publishedDependencies || {}).toEqual({});
    });

    it('should handle files without any metadata', async () => {
      // Arrange: Create file without metadata
      const contentOnly = `# Test Content

This file has no metadata section.`;

      writeFileSync(testFilePath, contentOnly, 'utf-8');

      // Act: Publish with withDependencies=false
      const result = await publisher.publishWithMetadata(testFilePath, 'testuser', {
        withDependencies: false,
        dryRun: false
      });

      // Assert: Should succeed and create empty dependencies
      expect(result.success).toBe(true);
      const metadata = MetadataManager.getPublicationInfo(testFilePath);
      expect(metadata?.publishedDependencies || {}).toEqual({});
    });
  });
});
