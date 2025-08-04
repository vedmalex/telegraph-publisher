import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProgressIndicator } from '../cli/ProgressIndicator';
import type { MetadataConfig } from '../types/metadata';
import { PublicationWorkflowManager } from './PublicationWorkflowManager';

describe('PublicationWorkflowManager', () => {
  const testDir = join(process.cwd(), 'test-publication-workflow');
  let workflowManager: PublicationWorkflowManager;
  let mockConfig: MetadataConfig;
  let mockAccessToken: string;

  beforeEach(() => {
    // Create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Mock ProgressIndicator to avoid issues
    jest.spyOn(ProgressIndicator, 'showStatus').mockImplementation((message: string, type?: "info" | "success" | "warning" | "error") => { });

    // Setup mock configuration
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

    mockAccessToken = 'test-access-token-123';

    // Create PublicationWorkflowManager instance
    workflowManager = new PublicationWorkflowManager(mockConfig, mockAccessToken);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct configuration and access token', () => {
      expect(workflowManager).toBeInstanceOf(PublicationWorkflowManager);
      // The internal config and accessToken are private, but we can test behavior
    });
  });

  describe('publish', () => {
    test('should publish single file without verification when noVerify option is true', async () => {
      // Setup test file
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Article\n\nContent with [link](./target.md)');

      // Mock the publisher
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: true,
        url: 'https://telegra.ph/Test-Article-01-01',
        path: 'Test-Article-01-01'
      });

      // Mock console.log to capture output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Test options with noVerify: true
      const options = { noVerify: true, withDependencies: true, forceRepublish: false, dryRun: false };

      // Run publish
      await workflowManager.publish(testFile, options);

      // Verify publisher was called
      expect(mockPublisher).toHaveBeenCalledWith(testFile, 'test-user', {
        withDependencies: true,
        forceRepublish: false,
        dryRun: false,
        debug: false,
        generateAside: true
      });

      // Verify success message was logged
      expect(consoleSpy).toHaveBeenCalledWith('🔗 URL: https://telegra.ph/Test-Article-01-01');
      expect(consoleSpy).toHaveBeenCalledWith('📍 Path: Test-Article-01-01');

      // Clean up mocks
      mockPublisher.mockRestore();
      consoleSpy.mockRestore();
    });

    test('should verify links and block publication when broken links are found', async () => {
      // Setup test file with broken link
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Article\n\nContent with [broken link](./nonexistent.md)');

      // Mock LinkVerifier to return broken links
      const mockVerifier = jest.spyOn(workflowManager['linkVerifier'], 'verifyLinks');
      mockVerifier.mockResolvedValue({
        filePath: testFile,
        allLinks: [],
        localLinks: [],
        brokenLinks: [
          {
            filePath: testFile,
            link: {
              text: 'broken link',
              href: './nonexistent.md',
              lineNumber: 3,
              columnStart: 13,
              columnEnd: 42
            },
            suggestions: [],
            canAutoFix: false
          }
        ],
        processingTime: 0
      });

      // Mock console.log and process.exit
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });

      // Test options without noVerify
      const options = { noVerify: false, noAutoRepair: false, withDependencies: true };

      // Run publish - should throw due to process.exit
      await expect(workflowManager.publish(testFile, options)).rejects.toThrow('process.exit(1)');

      // Verify error messages were logged
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📄 In file: ' + testFile));
      expect(consoleSpy).toHaveBeenCalledWith('  - "./nonexistent.md" (line 3)');

      // Clean up mocks
      mockVerifier.mockRestore();
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('should auto-repair links when possible and continue publication', async () => {
      // Setup test file with repairable broken link
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Article\n\nContent with [link](./broken.md)');

      // Mock AutoRepairer to successfully repair the link
      const mockAutoRepairer = jest.spyOn(workflowManager['autoRepairer'], 'autoRepair');
      mockAutoRepairer.mockResolvedValue({
        repairedLinksCount: 1,
        repairedFilesIn: new Set([testFile]),
        remainingBrokenLinks: []
      });

      // Mock LinkVerifier to return broken links initially, then no broken links after repair
      const mockVerifier = jest.spyOn(workflowManager['linkVerifier'], 'verifyLinks');
      mockVerifier
        .mockResolvedValueOnce({
          filePath: testFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: testFile,
              link: {
                text: 'link',
                href: './broken.md',
                lineNumber: 3,
                columnStart: 13,
                columnEnd: 30
              },
              suggestions: ['./fixed.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        })
        .mockResolvedValue({
          filePath: testFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [], // No broken links after repair
          processingTime: 0
        });

      // Mock LinkResolver to return suggestions
      const mockResolver = jest.spyOn(workflowManager['linkResolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: testFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: testFile,
              link: {
                text: 'link',
                href: './broken.md',
                lineNumber: 3,
                columnStart: 13,
                columnEnd: 30
              },
              suggestions: ['./fixed.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        }
      ]);

      // Mock the publisher
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: false,
        url: 'https://telegra.ph/Test-Article-01-01',
        path: 'Test-Article-01-01'
      });

      // Mock ProgressIndicator.showStatus
      const progressSpy = jest.spyOn(ProgressIndicator, 'showStatus').mockImplementation();

      // Test options without noVerify and noAutoRepair
      const options = { noVerify: false, noAutoRepair: false, withDependencies: true };

      // Run publish
      await workflowManager.publish(testFile, options);

      // Verify auto-repair was called
      expect(mockAutoRepairer).toHaveBeenCalledWith(testFile);

      // Verify success messages were logged
      expect(progressSpy).toHaveBeenCalledWith(expect.stringContaining('🔧 Automatically repaired 1 link(s)'), 'success');
      expect(progressSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Link verification passed.'), 'success');

      // Verify publisher was called
      expect(mockPublisher).toHaveBeenCalled();

      // Clean up mocks
      mockAutoRepairer.mockRestore();
      mockVerifier.mockRestore();
      mockResolver.mockRestore();
      mockPublisher.mockRestore();
      progressSpy.mockRestore();
    });

    test('should handle publication failure gracefully', async () => {
      // Setup test file
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Article\n\nContent without links');

      // Mock the publisher to fail
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: false,
        isNewPublication: false,
        error: 'Publication failed due to network error'
      });

      // Mock ProgressIndicator.showStatus
      const progressSpy = jest.spyOn(ProgressIndicator, 'showStatus').mockImplementation();

      // Test options with noVerify
      const options = { noVerify: true, withDependencies: true };

      // Run publish
      await workflowManager.publish(testFile, options);

      // Verify error message was logged
      expect(progressSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Failed: ' + testFile), 'error');

      // Clean up mocks
      mockPublisher.mockRestore();
      progressSpy.mockRestore();
    });

    test('should handle directory publication with multiple files', async () => {
      // Setup multiple test files
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      writeFileSync(file1, '# Article 1\n\nFirst article');
      writeFileSync(file2, '# Article 2\n\nSecond article');

      // Mock LinkScanner to return multiple files
      const mockScanner = jest.spyOn(workflowManager['linkScanner'], 'findMarkdownFiles');
      mockScanner.mockResolvedValue([file1, file2]);

      // Mock the publisher for both files
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher
        .mockResolvedValueOnce({
          success: true,
          isNewPublication: true,
          url: 'https://telegra.ph/Article-1-01-01',
          path: 'Article-1-01-01'
        })
        .mockResolvedValueOnce({
          success: true,
          isNewPublication: true,
          url: 'https://telegra.ph/Article-2-01-01',
          path: 'Article-2-01-01'
        });

      // Mock console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Test directory publication
      const options = { noVerify: true, withDependencies: true };

      // Run publish on directory
      await workflowManager.publish(testDir, options);

      // Verify publisher was called for both files
      expect(mockPublisher).toHaveBeenCalledTimes(2);
      expect(mockPublisher).toHaveBeenCalledWith(file1, 'test-user', expect.any(Object));
      expect(mockPublisher).toHaveBeenCalledWith(file2, 'test-user', expect.any(Object));

      // Clean up mocks
      mockScanner.mockRestore();
      mockPublisher.mockRestore();
      consoleSpy.mockRestore();
    });

    test('should handle empty directory gracefully', async () => {
      // Mock LinkScanner to return no files
      const mockScanner = jest.spyOn(workflowManager['linkScanner'], 'findMarkdownFiles');
      mockScanner.mockResolvedValue([]);

      // Mock ProgressIndicator.showStatus
      const progressSpy = jest.spyOn(ProgressIndicator, 'showStatus').mockImplementation();

      // Test empty directory
      const options = { noVerify: true };

      // Run publish on empty directory
      await workflowManager.publish(testDir, options);

      // Verify appropriate message was logged
      expect(progressSpy).toHaveBeenCalledWith('No markdown files found to publish.', 'info');

      // Clean up mocks
      mockScanner.mockRestore();
      progressSpy.mockRestore();
    });

    test('should handle dry run mode correctly', async () => {
      // Setup test file
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Article\n\nContent for dry run');

      // Mock the publisher
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: true,
        url: 'https://telegra.ph/Test-Article-01-01',
        path: 'Test-Article-01-01'
      });

      // Test dry run mode
      const options = { noVerify: true, dryRun: true };

      // Run publish in dry run mode
      await workflowManager.publish(testFile, options);

      // Verify publisher was called with dryRun: true
      expect(mockPublisher).toHaveBeenCalledWith(testFile, 'test-user', expect.objectContaining({
        dryRun: true
      }));

      // Clean up mocks
      mockPublisher.mockRestore();
    });
  });

  describe('debug option functionality', () => {
    test('should auto-enable dry-run when debug is specified', async () => {
      // Setup test file
      const testFile = join(testDir, 'test-debug.md');
      writeFileSync(testFile, '# Test Article\n\nThis is test content for debug option.');

      // Mock publisher to track calls
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: true,
        url: 'https://telegra.ph/test',
        path: '/test'
      });

      // Test with debug option (should auto-enable dryRun)
      const options = { debug: true, noVerify: true };

      await workflowManager.publish(testFile, options);

      // Verify publisher was called with both debug: true and dryRun: true
      expect(mockPublisher).toHaveBeenCalledWith(testFile, 'test-user', expect.objectContaining({
        debug: true,
        dryRun: true
      }));

      // Clean up mocks
      mockPublisher.mockRestore();
    });

    test('should create JSON file when debug option is used', async () => {
      // Setup test file
      const testFile = join(testDir, 'test-json-creation.md');
      const expectedJsonFile = join(testDir, 'test-json-creation.json');
      writeFileSync(testFile, '# Test Article\n\nThis is test content that should generate JSON.');

      // Mock the telegraph API calls to avoid actual network requests
      const mockPublishNodes = jest.spyOn(workflowManager['publisher'], 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/test',
        path: '/test'
      });

      // Test with debug option
      const options = { debug: true, noVerify: true };

      await workflowManager.publish(testFile, options);

      // Verify JSON file was created
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify JSON content is valid and properly formatted
      const jsonContent = readFileSync(expectedJsonFile, 'utf-8');
      const telegraphNodes = JSON.parse(jsonContent);

      // Should be an array of Telegraph nodes
      expect(Array.isArray(telegraphNodes)).toBe(true);
      expect(telegraphNodes.length).toBeGreaterThan(0);

      // Should be properly formatted with 2-space indentation
      expect(jsonContent).toContain('  ');

      // Clean up created JSON file
      if (existsSync(expectedJsonFile)) {
        rmSync(expectedJsonFile);
      }

      // Clean up mocks
      mockPublishNodes.mockRestore();
    });

    test('should not create JSON file when debug is false', async () => {
      // Setup test file
      const testFile = join(testDir, 'test-no-json.md');
      const expectedJsonFile = join(testDir, 'test-no-json.json');
      writeFileSync(testFile, '# Test Article\n\nThis should not generate JSON.');

      // Mock publisher to avoid actual publication
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: true,
        url: 'https://telegra.ph/test',
        path: '/test'
      });

      // Test with dryRun but without debug
      const options = { dryRun: true, debug: false, noVerify: true };

      await workflowManager.publish(testFile, options);

      // Verify JSON file was NOT created
      expect(existsSync(expectedJsonFile)).toBe(false);

      // Clean up mocks
      mockPublisher.mockRestore();
    });
  });

  describe('error handling', () => {
    test('should handle workflow exceptions gracefully', async () => {
      // Setup test file in directory
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Article\n\nContent');

      // Mock LinkScanner to throw an error when scanning directory
      const mockScanner = jest.spyOn(workflowManager['linkScanner'], 'findMarkdownFiles');
      mockScanner.mockRejectedValue(new Error('Scanner error'));

      // Test that the error is propagated when publishing directory
      const options = { noVerify: true };

      await expect(workflowManager.publish(testDir, options)).rejects.toThrow('Scanner error');

      // Clean up mocks
      mockScanner.mockRestore();
    });
  });
});