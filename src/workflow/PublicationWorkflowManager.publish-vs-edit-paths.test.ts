import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PublicationWorkflowManager } from './PublicationWorkflowManager';
import { ConfigManager } from '../config/ConfigManager';

/**
 * Test suite for correct publish vs edit path behavior
 * Validates that force flags don't create new pages for existing publications
 */
describe('PublicationWorkflowManager - Publish vs Edit Path Logic', () => {
  let tempDir: string;
  let workflowManager: PublicationWorkflowManager;
  let publishedFile: string;
  let newFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-publish-edit-paths-'));
    const config = ConfigManager.getMetadataConfig(tempDir);
    workflowManager = new PublicationWorkflowManager(config, 'test-token-paths');
    
    // Create a file with metadata (existing publication)
    publishedFile = join(tempDir, 'published.md');
    const publishedContent = `---
telegraphUrl: "https://telegra.ph/published-page"
editPath: "published-page"
username: "test"
publishedAt: "2025-08-04T14:00:00.000Z"
originalFilename: "published.md"
title: "Published Page"
contentHash: "existing-hash"
---

# Published Page

This file is already published with metadata.`;

    writeFileSync(publishedFile, publishedContent);
    
    // Create a file without metadata (new file)
    newFile = join(tempDir, 'new.md');
    const newContent = `# New Page

This file has no metadata.`;

    writeFileSync(newFile, newContent);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should use edit path for published files regardless of force flags', async () => {
    const testCases = [
      { name: 'no flags', options: { force: false, forceRepublish: false } },
      { name: '--force', options: { force: true, forceRepublish: false } },
      { name: '--force-republish', options: { force: false, forceRepublish: true } },
      { name: 'both flags', options: { force: true, forceRepublish: true } }
    ];

    for (const testCase of testCases) {
      // Mock console.log to capture output
      const originalLog = console.log;
      const outputs: string[] = [];
      console.log = (...args) => {
        outputs.push(args.join(' '));
      };

      try {
        await workflowManager.publish(publishedFile, {
          withDependencies: false,
          dryRun: true,
          debug: false,
          noVerify: true,
          ...testCase.options
        });

        // Should always use edit path for published files
        const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
        expect(updateMessage).toBeDefined();

        // Should never create new publication for existing files
        const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
        expect(publishMessage).toBeUndefined();

        console.log(`✅ ${testCase.name}: Edit path used correctly`);

      } finally {
        console.log = originalLog;
      }
    }
  });

  it('should use publish path for new files', async () => {
    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      await workflowManager.publish(newFile, {
        withDependencies: false,
        dryRun: true,
        debug: false,
        noVerify: true,
        force: true,
        forceRepublish: true
      });

      // Should use publish path for new files
      const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
      expect(publishMessage).toBeDefined();

      // Should not use edit path for new files
      const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
      expect(updateMessage).toBeUndefined();

    } finally {
      console.log = originalLog;
    }
  });

  it('should force republish behavior bypass content checks in edit path', async () => {
    // Test that force flags bypass content hash checks but still use edit path
    
    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      // First test without force flags - should skip due to unchanged content
      await workflowManager.publish(publishedFile, {
        withDependencies: false,
        dryRun: true,
        debug: false,
        noVerify: true,
        force: false,
        forceRepublish: false
      });

      const skipMessage = outputs.find(msg => msg.includes('Content unchanged. Skipping'));
      
      if (skipMessage) {
        // Content was skipped - now test with force flag
        outputs.length = 0; // Clear outputs
        
        await workflowManager.publish(publishedFile, {
          withDependencies: false,
          dryRun: true,
          debug: false,
          noVerify: true,
          force: true, // Should bypass content check
          forceRepublish: false
        });

        // Should force update even with unchanged content
        const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
        expect(updateMessage).toBeDefined();
        
        // Should still use edit path, not create new publication
        const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
        expect(publishMessage).toBeUndefined();
      }

    } finally {
      console.log = originalLog;
    }
  });

  it('should distinguish between file metadata and cache info for path decision', async () => {
    // This test validates that path decision is based on publication status,
    // not just force flags
    
    const testFile = join(tempDir, 'cache-test.md');
    const content = `# Cache Test

This file will test cache vs metadata logic.`;

    writeFileSync(testFile, content);

    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      // New file should use publish path even with force flags
      await workflowManager.publish(testFile, {
        withDependencies: false,
        dryRun: true,
        debug: false,
        noVerify: true,
        force: true,
        forceRepublish: true
      });

      // Should use publish path for truly new files
      const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
      expect(publishMessage).toBeDefined();

    } finally {
      console.log = originalLog;
    }
  });
});