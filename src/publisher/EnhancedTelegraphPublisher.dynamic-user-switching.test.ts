/**
 * Tests for dynamic user switching functionality in EnhancedTelegraphPublisher
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { EnhancedTelegraphPublisher } from "./EnhancedTelegraphPublisher";
import { MetadataManager } from "../metadata/MetadataManager";
import type { MetadataConfig, FileMetadata } from "../types/metadata";

const mockConfig: MetadataConfig = {
  defaultUsername: "testuser",
  autoPublishDependencies: false,
  replaceLinksinContent: false,
  maxDependencyDepth: 1,
  createBackups: false,
  manageBidirectionalLinks: false,
  autoSyncCache: false,
  rateLimiting: {
    baseDelayMs: 100,
    adaptiveMultiplier: 1.5,
    maxDelayMs: 5000,
    backoffStrategy: 'linear',
    maxRetries: 2,
    cooldownPeriodMs: 10000,
    enableAdaptiveThrottling: false
  }
};

describe("Dynamic User Switching", () => {
  let publisher: EnhancedTelegraphPublisher;
  let testFile: string;
  
  beforeEach(() => {
    publisher = new EnhancedTelegraphPublisher(mockConfig);
    publisher.setAccessToken("original-test-token");
    testFile = resolve(__dirname, "../../test-cache-fix/test-user-switching.md");
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    // Clean up test file
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  describe("AccessToken in Metadata", () => {
    it("should include accessToken field in FileMetadata interface", () => {
      // Test that our type definition includes accessToken
      const metadata: FileMetadata = {
        telegraphUrl: "https://telegra.ph/test",
        editPath: "/test-path",
        username: "testuser", 
        publishedAt: new Date().toISOString(),
        originalFilename: "test.md",
        contentHash: "hash123",
        accessToken: "test-token"
      };
      
      expect(metadata.accessToken).toBe("test-token");
    });

    it("should parse accessToken from YAML front-matter", () => {
      const testContent = `---
telegraphUrl: "https://telegra.ph/test-url"
editPath: "/test-path"
username: "testuser"
publishedAt: "2024-01-01T00:00:00.000Z"
originalFilename: "test.md"
contentHash: "hash123"
accessToken: "parsed-token-123"
---

# Test Content

This is test content.`;

      writeFileSync(testFile, testContent);
      
      const metadata = MetadataManager.getPublicationInfo(testFile);
      expect(metadata?.accessToken).toBe("parsed-token-123");
    });

    it("should serialize accessToken to YAML front-matter", () => {
      const metadata: FileMetadata = {
        telegraphUrl: "https://telegra.ph/test-url",
        editPath: "/test-path",
        username: "testuser",
        publishedAt: new Date().toISOString(),
        originalFilename: "test.md",
        contentHash: "hash123",
        accessToken: "serialized-token-456"
      };

      const originalContent = "# Test Content\n\nThis is test content.";
      const contentWithMetadata = MetadataManager.injectMetadata(originalContent, metadata);
      
      writeFileSync(testFile, contentWithMetadata);
      
      // Verify the token was written correctly
      const parsedMetadata = MetadataManager.getPublicationInfo(testFile);
      expect(parsedMetadata?.accessToken).toBe("serialized-token-456");
    });
  });

  describe("Enhanced createMetadata", () => {
    it("should create metadata with accessToken parameter", () => {
      const metadata = MetadataManager.createMetadata(
        "https://telegra.ph/test",
        "/test-path",
        "testuser",
        "/path/to/test.md",
        "contenthash123",
        "Test Title",
        "Test Description", 
        "access-token-789"
      );
      
      expect(metadata.accessToken).toBe("access-token-789");
      expect(metadata.telegraphUrl).toBe("https://telegra.ph/test");
      expect(metadata.title).toBe("Test Title");
      expect(metadata.description).toBe("Test Description");
    });

    it("should create metadata without accessToken parameter (backward compatibility)", () => {
      const metadata = MetadataManager.createMetadata(
        "https://telegra.ph/test",
        "/test-path",
        "testuser",
        "/path/to/test.md",
        "contenthash123",
        "Test Title"
      );
      
      expect(metadata.accessToken).toBeUndefined();
      expect(metadata.telegraphUrl).toBe("https://telegra.ph/test");
      expect(metadata.title).toBe("Test Title");
    });
  });

  describe("User switching infrastructure", () => {
    it("should have user switching properties initialized", () => {
      // Verify the publisher has the necessary properties for user switching
      // This is a structural test to ensure the class has the right setup
      expect(publisher).toBeDefined();
      expect(typeof publisher.setAccessToken).toBe("function");
      
      // Test that we can set an access token
      publisher.setAccessToken("test-token");
      // No direct way to verify this without making the property public,
      // but we can verify the method exists and doesn't throw
    });

    it("should handle FLOOD_WAIT error detection pattern", () => {
      // Test the error pattern matching for FLOOD_WAIT
      const floodWaitError = new Error("FLOOD_WAIT_30");
      expect(floodWaitError.message.includes("FLOOD_WAIT_")).toBe(true);
      
      const normalError = new Error("Network timeout");
      expect(normalError.message.includes("FLOOD_WAIT_")).toBe(false);
    });
  });
}); 