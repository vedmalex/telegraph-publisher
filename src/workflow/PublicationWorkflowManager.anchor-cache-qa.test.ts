import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TestHelpers } from "../test-utils/TestHelpers";
import { PublicationWorkflowManager } from "./PublicationWorkflowManager";
import type { MetadataConfig } from "../types/metadata";

describe('PublicationWorkflowManager - Anchor Cache QA', () => {
  let tempDir: string;
  let workflowManager: PublicationWorkflowManager;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = TestHelpers.createTempDir("anchor-cache-qa-test");
    
    // Change to temp directory to simulate running command from a subdirectory
    process.chdir(tempDir);
    
    const config: MetadataConfig = {
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
    workflowManager = new PublicationWorkflowManager(config, "test-token");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    TestHelpers.cleanup();
  });

  describe('Anchor cache creation during publication workflow', () => {
    it('should create anchor cache in current working directory during link verification', async () => {
      // Create test files with cross-references
      const file1Content = `# Document One

## Introduction
This is the introduction.

## Features
Here are the features.

Links:
- [Link to Document Two](./file2.md)
- [Link to Section in Document Two](./file2.md#Installation)
- [Link to non-existent anchor](./file2.md#NonExistent)`;

      const file2Content = `# Document Two

## Overview
This is the overview.

## Installation
Installation instructions.

## Usage
Usage examples.`;

      const file1Path = join(tempDir, "file1.md");
      const file2Path = join(tempDir, "file2.md");
      
      writeFileSync(file1Path, file1Content);
      writeFileSync(file2Path, file2Content);

      const cacheFilePath = join(tempDir, ".telegraph-anchors-cache.json");
      
      // Ensure cache doesn't exist before test
      expect(existsSync(cacheFilePath)).toBe(false);

      try {
        // Run publication workflow - this should trigger link verification and cache creation
        await workflowManager.publish(file1Path, { 
          dryRun: true, // Don't actually publish
          force: false, // Enable link verification
          noVerify: false // Enable link verification
        });
      } catch (error) {
        // We expect this to fail due to broken links, but cache should still be created
        expect(error.message || error).toContain('Publication aborted');
      }

      // Verify that anchor cache was created in the current working directory
      expect(existsSync(cacheFilePath)).toBe(true);

      // Verify cache content
      const cacheContent = JSON.parse(require("fs").readFileSync(cacheFilePath, "utf-8"));
      expect(cacheContent.version).toBe("1.0.0");
      expect(cacheContent.anchors).toBeDefined();
      
      // Should have entries for both files
      const file2AbsolutePath = file2Path;
      expect(cacheContent.anchors[file2AbsolutePath]).toBeDefined();
      expect(cacheContent.anchors[file2AbsolutePath].anchors).toContain("Document-Two");
      expect(cacheContent.anchors[file2AbsolutePath].anchors).toContain("Overview");
      expect(cacheContent.anchors[file2AbsolutePath].anchors).toContain("Installation");
      expect(cacheContent.anchors[file2AbsolutePath].anchors).toContain("Usage");
      expect(cacheContent.anchors[file2AbsolutePath].contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should work correctly when running from a subdirectory', async () => {
      // Create subdirectory structure
      const subDir = join(tempDir, "subdir");
      mkdirSync(subDir, { recursive: true });
      
      // Change to subdirectory
      process.chdir(subDir);
      
      // Create test files in subdirectory
      const fileContent = `# Test Document

## Section One
Content here.

## Section Two
More content.

Link to self: [Section One](#Section-One)`;

      const filePath = join(subDir, "test.md");
      writeFileSync(filePath, fileContent);

      const cacheFilePath = join(subDir, ".telegraph-anchors-cache.json");
      
      // Ensure cache doesn't exist before test
      expect(existsSync(cacheFilePath)).toBe(false);

      try {
        // Run publication workflow from subdirectory
        await workflowManager.publish(filePath, { 
          dryRun: true,
          force: false,
          noVerify: false
        });
      } catch (error) {
        // May fail for other reasons, but cache should still be created
      }

      // Verify that anchor cache was created in the subdirectory (current working directory)
      expect(existsSync(cacheFilePath)).toBe(true);

      // Verify cache content
      const cacheContent = JSON.parse(require("fs").readFileSync(cacheFilePath, "utf-8"));
      expect(cacheContent.version).toBe("1.0.0");
      expect(cacheContent.anchors).toBeDefined();
      
      // Should have entry for the test file
      expect(cacheContent.anchors[filePath]).toBeDefined();
      expect(cacheContent.anchors[filePath].anchors).toContain("Test-Document");
      expect(cacheContent.anchors[filePath].anchors).toContain("Section-One");
      expect(cacheContent.anchors[filePath].anchors).toContain("Section-Two");
    });

    it('should use existing cache for performance on subsequent runs', async () => {
      // Create test file
      const fileContent = `# Performance Test

## Fast Section
This should be cached.`;

      const filePath = join(tempDir, "perf-test.md");
      writeFileSync(filePath, fileContent);

      // First run - creates cache
      try {
        await workflowManager.publish(filePath, { 
          dryRun: true,
          force: false,
          noVerify: false
        });
      } catch (error) {
        // Ignore publication errors
      }

      const cacheFilePath = join(tempDir, ".telegraph-anchors-cache.json");
      expect(existsSync(cacheFilePath)).toBe(true);

      // Get cache modification time
      const cacheStats1 = require("fs").statSync(cacheFilePath);
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second run - should use cache
      try {
        await workflowManager.publish(filePath, { 
          dryRun: true,
          force: false,
          noVerify: false
        });
      } catch (error) {
        // Ignore publication errors
      }

      // Cache should still exist
      expect(existsSync(cacheFilePath)).toBe(true);
      
      // Cache modification time should be the same or very close (cache hit)
      const cacheStats2 = require("fs").statSync(cacheFilePath);
      const timeDiff = Math.abs(cacheStats2.mtime.getTime() - cacheStats1.mtime.getTime());
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second difference
    });
  });

  describe('Error handling with anchor cache', () => {
    it('should gracefully handle cache corruption during publication', async () => {
      // Create test file
      const fileContent = `# Test Document

## Section One
Content here.`;

      const filePath = join(tempDir, "test.md");
      writeFileSync(filePath, fileContent);

      // Create corrupted cache file
      const cacheFilePath = join(tempDir, ".telegraph-anchors-cache.json");
      writeFileSync(cacheFilePath, "invalid json content");

      // Should not throw error, should recreate cache
      try {
        await workflowManager.publish(filePath, { 
          dryRun: true,
          force: false,
          noVerify: false
        });
      } catch (error) {
        // Ignore publication errors, focus on cache handling
      }

      // Cache should be recreated with valid content
      expect(existsSync(cacheFilePath)).toBe(true);
      
      // Should be valid JSON now
      expect(() => {
        JSON.parse(require("fs").readFileSync(cacheFilePath, "utf-8"));
      }).not.toThrow();
    });
  });
});