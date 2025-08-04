import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { PublicationWorkflowManager } from '../workflow/PublicationWorkflowManager';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { MetadataConfig, FileMetadata } from '../types/metadata';

/**
 * Integration tests for debug functionality through PublicationWorkflowManager
 * Tests the complete CLI workflow including --debug --force scenario
 */
describe('CLI Debug Integration Tests', () => {
  let workflowManager: PublicationWorkflowManager;
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
    
    workflowManager = new PublicationWorkflowManager(mockConfig, 'mock-access-token');
    testDir = resolve('./test-cli-debug-temp');
    
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('--debug flag integration', () => {
    it('should auto-enable dry-run when debug is specified', async () => {
      const testFile = resolve(testDir, 'debug-auto-dryrun.md');
      const expectedJsonFile = resolve(testDir, 'debug-auto-dryrun.json');
      
      writeFileSync(testFile, '# Debug Auto Dry-Run Test\n\nThis tests auto-enabling dry-run with debug.');

      // Mock publisher methods
      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: true,
        url: '[DRY RUN] Would publish',
        path: '/test'
      });

      // Test with debug option only (should auto-enable dryRun)
      const options = { 
        debug: true, 
        noVerify: true // Skip link verification for test
      };

      await workflowManager.publish(testFile, options);

      // Verify options were modified to include dryRun
      expect(options.dryRun).toBe(true);

      // Verify publisher was called with both debug and dryRun
      expect(mockPublisher).toHaveBeenCalledWith(
        testFile, 
        'test-user',
        expect.objectContaining({
          debug: true,
          dryRun: true
        })
      );

      mockPublisher.mockRestore();
    });

    it('should create JSON file for new publication with --debug', async () => {
      const testFile = resolve(testDir, 'new-debug.md');
      const expectedJsonFile = resolve(testDir, 'new-debug.json');
      
      const markdownContent = `# New Publication Debug Test

This is a new publication that should create a debug JSON file.

## Features Tested
- Debug flag processing
- JSON file creation
- Telegraph node generation

## Expected Results
- JSON file created at same location as markdown file
- Valid Telegraph nodes structure
- Proper formatting with 2-space indentation`;

      writeFileSync(testFile, markdownContent);

      // Mock Telegraph API
      const mockPublishNodes = jest.spyOn(workflowManager['publisher'], 'publishNodes');
      mockPublishNodes.mockResolvedValue({
        url: 'https://telegra.ph/new-debug-test',
        path: '/new-debug-test'
      });

      const options = { 
        debug: true,
        noVerify: true
      };

      await workflowManager.publish(testFile, options);

      // Verify JSON file was created
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify JSON content
      const jsonContent = readFileSync(expectedJsonFile, 'utf-8');
      const telegraphNodes = JSON.parse(jsonContent);
      
      expect(Array.isArray(telegraphNodes)).toBe(true);
      expect(telegraphNodes.length).toBeGreaterThan(0);
      
      // Check content preservation
      const jsonString = JSON.stringify(telegraphNodes);
      expect(jsonString).toContain('New Publication Debug Test');
      expect(jsonString).toContain('Features Tested');
      expect(jsonString).toContain('Expected Results');

      mockPublishNodes.mockRestore();
    });

    it('should create JSON file for existing publication with --debug --force', async () => {
      const testFile = resolve(testDir, 'existing-debug-force.md');
      const expectedJsonFile = resolve(testDir, 'existing-debug-force.json');
      
      // Create file with existing metadata (simulating already published file)
      const existingMetadata: FileMetadata = {
        telegraphUrl: 'https://telegra.ph/existing-debug-force',
        editPath: '/edit/existing-debug-force-xyz',
        username: 'test-user',
        publishedAt: new Date('2024-01-01').toISOString(),
        originalFilename: 'existing-debug-force.md',
        title: 'Existing Debug Force Test',
        contentHash: 'original-content-hash'
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

# Existing Debug Force Test

This is an existing publication being tested with --debug --force flags.

## Bug Report Scenario
This test specifically addresses the bug report where:
- User runs: \`publish --debug --force\` 
- File is already published (has metadata)
- Expected: JSON file should be created
- Previous behavior: JSON file was not created

## Current Test
- File has publication metadata (existing publication)
- Using --debug flag (should enable dry-run)
- Using --force flag (should bypass link verification)
- Expected result: JSON file creation`;

      writeFileSync(testFile, markdownWithMetadata);

      // Mock Telegraph API calls
      const mockEditPage = jest.spyOn(workflowManager['publisher'], 'editPage');
      mockEditPage.mockResolvedValue({
        url: existingMetadata.telegraphUrl,
        path: existingMetadata.editPath
      });

      // Test the exact scenario from bug report: --debug --force
      const options = { 
        debug: true,
        force: true  // This should bypass link verification
      };

      await workflowManager.publish(testFile, options);

      // Verify JSON file was created (this was the bug - file was not created)
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify JSON content is valid and contains expected data
      const jsonContent = readFileSync(expectedJsonFile, 'utf-8');
      const telegraphNodes = JSON.parse(jsonContent);
      
      expect(Array.isArray(telegraphNodes)).toBe(true);
      expect(telegraphNodes.length).toBeGreaterThan(0);
      
      // Verify content from the markdown is in the Telegraph nodes
      const jsonString = JSON.stringify(telegraphNodes);
      expect(jsonString).toContain('Bug Report Scenario');
      expect(jsonString).toContain('Current Test');
      expect(jsonString).toContain('This is an existing publication');

      // Verify JSON formatting
      expect(jsonContent).toMatch(/^\[\s*\{/);
      expect(jsonContent).toContain('  '); // 2-space indentation

      mockEditPage.mockRestore();
    });

    it('should handle --debug --force --dry-run combination correctly', async () => {
      const testFile = resolve(testDir, 'triple-flag-test.md');
      const expectedJsonFile = resolve(testDir, 'triple-flag-test.json');
      
      // Create existing publication
      const markdownWithMetadata = `---
telegraphUrl: https://telegra.ph/triple-flag-test
editPath: /edit/triple-flag-test
username: test-user
publishedAt: ${new Date().toISOString()}
originalFilename: triple-flag-test.md
title: Triple Flag Test
contentHash: triple-hash
---

# Triple Flag Test
Testing --debug --force --dry-run combination`;

      writeFileSync(testFile, markdownWithMetadata);

      const mockEditPage = jest.spyOn(workflowManager['publisher'], 'editPage');
      mockEditPage.mockResolvedValue({
        url: 'https://telegra.ph/triple-flag-test',
        path: '/triple-flag-test'
      });

      // Test with all three flags
      const options = { 
        debug: true,
        force: true,
        dryRun: true  // Explicitly set dry-run too
      };

      await workflowManager.publish(testFile, options);

      // Verify JSON file was created
      expect(existsSync(expectedJsonFile)).toBe(true);

      // Verify the operation was indeed a dry-run
      expect(mockEditPage).not.toHaveBeenCalled(); // Should not make actual API calls in dry-run

      const jsonContent = JSON.parse(readFileSync(expectedJsonFile, 'utf-8'));
      expect(Array.isArray(jsonContent)).toBe(true);
      expect(JSON.stringify(jsonContent)).toContain('Testing --debug --force --dry-run');
    });

    it('should not create JSON when debug is false regardless of other flags', async () => {
      const testFile = resolve(testDir, 'no-debug-flag.md');
      const expectedJsonFile = resolve(testDir, 'no-debug-flag.json');
      
      writeFileSync(testFile, '# No Debug Flag Test\nThis should not create JSON file.');

      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockResolvedValue({
        success: true,
        isNewPublication: true,
        url: 'https://telegra.ph/no-debug',
        path: '/no-debug'
      });

      // Test without debug flag
      const options = { 
        force: true,
        dryRun: true,
        debug: false,  // Explicitly false
        noVerify: true
      };

      await workflowManager.publish(testFile, options);

      // Verify JSON file was NOT created
      expect(existsSync(expectedJsonFile)).toBe(false);

      mockPublisher.mockRestore();
    });
  });

  describe('error handling in debug scenarios', () => {
    it('should continue operation even if JSON file creation fails', async () => {
      const testFile = resolve(testDir, 'json-error-test.md');
      const expectedJsonFile = resolve(testDir, 'json-error-test.json');
      
      writeFileSync(testFile, '# JSON Error Test\nTesting error handling in JSON creation.');

      // Mock writeFileSync to fail for JSON files
      const originalWriteFileSync = require('fs').writeFileSync;
      const mockWriteFileSync = jest.fn((path: string, data: any, options?: any) => {
        if (path.endsWith('.json')) {
          throw new Error('Simulated JSON write error');
        }
        return originalWriteFileSync(path, data, options);
      });
      require('fs').writeFileSync = mockWriteFileSync;

      const mockPublisher = jest.spyOn(workflowManager['publisher'], 'publishWithMetadata');
      mockPublisher.mockImplementation(async (filePath, username, options) => {
        // This should try to create JSON and fail, but still return success
        return {
          success: true,
          isNewPublication: true,
          url: '[DRY RUN] Would publish',
          path: '/test'
        };
      });

      const options = { 
        debug: true,
        noVerify: true
      };

      // Test should complete without throwing errors
      await workflowManager.publish(testFile, options);

      // Verify JSON file was not created due to error
      expect(existsSync(expectedJsonFile)).toBe(false);

      // Restore mocks
      require('fs').writeFileSync = originalWriteFileSync;
      mockPublisher.mockRestore();
    });
  });
});