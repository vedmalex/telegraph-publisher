import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PublicationWorkflowManager } from './PublicationWorkflowManager';
import { ConfigManager } from '../config/ConfigManager';

/**
 * Test suite for --force flag functionality
 * Validates that --force properly triggers forceRepublish behavior
 */
describe('PublicationWorkflowManager - Force Flag Fix', () => {
  let tempDir: string;
  let workflowManager: PublicationWorkflowManager;
  let publishedFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-force-flag-'));
    const config = ConfigManager.getMetadataConfig(tempDir);
    workflowManager = new PublicationWorkflowManager(config, 'test-token-force');
    
    // Create a file with metadata (simulating already published file)
    publishedFile = join(tempDir, 'published-file.md');
    const publishedContent = `---
telegraphUrl: "https://telegra.ph/published-file"
editPath: "published-file"
username: "test"
publishedAt: "2025-08-04T14:00:00.000Z"
originalFilename: "published-file.md"
title: "Published File"
contentHash: "existing-hash-12345"
---

# Published File

This file is already published and has metadata.`;

    writeFileSync(publishedFile, publishedContent);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should use edit path for published files WITHOUT --force flag', async () => {
    const options = {
      withDependencies: false,
      forceRepublish: false,
      force: false, // No force flag
      dryRun: true,
      debug: false,
      noVerify: true
    };

    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      await workflowManager.publish(publishedFile, options);
      
      // Should show "Updated successfully!" (edit path)
      const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
      expect(updateMessage).toBeDefined();
      
      // Should NOT show "Published successfully!" (publish path)  
      const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
      expect(publishMessage).toBeUndefined();
      
    } finally {
      console.log = originalLog;
    }
  });

  it('should use edit path for published files WITH --force flag (correct behavior)', async () => {
    const options = {
      withDependencies: false,
      forceRepublish: false,
      force: true, // Force flag enabled
      dryRun: true,
      debug: false,
      noVerify: true
    };

    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      await workflowManager.publish(publishedFile, options);
      
      // Should show "Updated successfully!" (edit path - correct behavior)
      const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
      expect(updateMessage).toBeDefined();
      
      // Should NOT show "Published successfully!" (would indicate bug)
      const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
      expect(publishMessage).toBeUndefined();
      
    } finally {
      console.log = originalLog;
    }
  });

  it('should use edit path for published files WITH --force-republish flag (correct behavior)', async () => {
    const options = {
      withDependencies: false,
      forceRepublish: true, // Force republish flag
      force: false,
      dryRun: true,
      debug: false,
      noVerify: true
    };

    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      await workflowManager.publish(publishedFile, options);
      
      // Should show "Updated successfully!" (edit path - correct behavior)
      const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
      expect(updateMessage).toBeDefined();
      
      // Should NOT show "Published successfully!" (would indicate bug)
      const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
      expect(publishMessage).toBeUndefined();
      
    } finally {
      console.log = originalLog;
    }
  });

  it('should show bypass warning when using --force flag', async () => {
    const options = {
      withDependencies: false,
      forceRepublish: false,
      force: true, // Force flag for link verification bypass
      dryRun: true,
      debug: false,
      noVerify: false // Enable verification to see bypass message
    };

    // Mock ProgressIndicator to capture status messages
    const originalShowStatus = require('../cli/ProgressIndicator').ProgressIndicator.showStatus;
    const statusMessages: string[] = [];
    require('../cli/ProgressIndicator').ProgressIndicator.showStatus = (message: string) => {
      statusMessages.push(message);
    };

    try {
      await workflowManager.publish(publishedFile, options);
      
      // Should show bypass warning
      const bypassMessage = statusMessages.find(msg => 
        msg.includes('Bypassing link verification due to --force flag')
      );
      expect(bypassMessage).toBeDefined();
      
      // Should show debug warning
      const debugMessage = statusMessages.find(msg => 
        msg.includes('This mode is intended for debugging only')
      );
      expect(debugMessage).toBeDefined();
      
    } finally {
      require('../cli/ProgressIndicator').ProgressIndicator.showStatus = originalShowStatus;
    }
  });

  it('should handle combination of --force and --force-republish correctly', async () => {
    const options = {
      withDependencies: false,
      forceRepublish: true, // Both flags enabled
      force: true,
      dryRun: true,
      debug: false,
      noVerify: true
    };

    // Mock console.log to capture output
    const originalLog = console.log;
    const outputs: string[] = [];
    console.log = (...args) => {
      outputs.push(args.join(' '));
    };

    try {
      await workflowManager.publish(publishedFile, options);
      
      // Should still use edit path (correct behavior regardless of flag combination)
      const updateMessage = outputs.find(msg => msg.includes('Updated successfully!'));
      expect(updateMessage).toBeDefined();
      
      // Should NOT create new publication even with both flags
      const publishMessage = outputs.find(msg => msg.includes('Published successfully!'));
      expect(publishMessage).toBeUndefined();
      
    } finally {
      console.log = originalLog;
    }
  });
});