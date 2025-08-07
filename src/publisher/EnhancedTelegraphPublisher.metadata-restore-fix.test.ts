/**
 * Comprehensive tests for Metadata Restore Access Token Fix
 * Tests all patterns from CREATIVE phase implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { EnhancedTelegraphPublisher } from "./EnhancedTelegraphPublisher";
import { ConfigManager } from "../config/ConfigManager";
import type { MetadataConfig, PublishedPageInfo } from "../types/metadata";

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

describe("Metadata Restore Access Token Fix", () => {
  let publisher: EnhancedTelegraphPublisher;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    publisher = new EnhancedTelegraphPublisher(mockConfig);
    publisher.setAccessToken("test-current-token");
    
    tempDir = join(__dirname, '../../test-temp-metadata-restore');
    mkdirSync(tempDir, { recursive: true });
    testFilePath = join(tempDir, 'test.md');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("1. Data Model Foundation (R1)", () => {
    it("should include accessToken in PublishedPageInfo interface", () => {
      // Test that the interface accepts accessToken
      const pageInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/test",
        editPath: "/test",
        title: "Test",
        authorName: "Test Author",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        accessToken: "test-token-123" // This should compile without error
      };

      expect(pageInfo.accessToken).toBe("test-token-123");
    });

    it("should handle missing accessToken gracefully (backward compatibility)", () => {
      const pageInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/test",
        editPath: "/test", 
        title: "Test",
        authorName: "Test Author",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
        // No accessToken - should be optional
      };

      expect(pageInfo.accessToken).toBeUndefined();
    });
  });

  describe("2. Token Context Manager Pattern (R7)", () => {
    it("should resolve tokens with beautiful hierarchy: cache > directory > global > current", () => {
      // Mock ConfigManager methods
      const loadAccessTokenSpy = vi.spyOn(ConfigManager, 'loadAccessToken');
      
      // Test cache token (highest priority)
      loadAccessTokenSpy.mockReturnValue(undefined);
      
      // Access private method for testing
      const getEffectiveAccessToken = (publisher as any).getEffectiveAccessToken.bind(publisher);
      
      const result1 = getEffectiveAccessToken(testFilePath, "cache-token");
      expect(result1).toEqual({ token: "cache-token", source: "cache" });

      // Test directory token
      loadAccessTokenSpy.mockImplementation((dir) => {
        if (dir === dirname(testFilePath)) return "directory-token";
        return undefined;
      });
      
      const result2 = getEffectiveAccessToken(testFilePath);
      expect(result2).toEqual({ token: "directory-token", source: "directory" });

      // Test global token
      loadAccessTokenSpy.mockImplementation((dir) => {
        if (dir === '.') return "global-token";
        return undefined;
      });
      
      const result3 = getEffectiveAccessToken(testFilePath);
      expect(result3).toEqual({ token: "global-token", source: "global" });

      // Test current token fallback
      loadAccessTokenSpy.mockReturnValue(undefined);
      
      const result4 = getEffectiveAccessToken(testFilePath);
      expect(result4).toEqual({ token: "test-current-token", source: "current" });

      loadAccessTokenSpy.mockRestore();
    });

    it("should throw meaningful error when no tokens available", () => {
      const loadAccessTokenSpy = vi.spyOn(ConfigManager, 'loadAccessToken');
      loadAccessTokenSpy.mockReturnValue(undefined);
      
      // Clear current token
      (publisher as any).currentAccessToken = undefined;
      
      const getEffectiveAccessToken = (publisher as any).getEffectiveAccessToken.bind(publisher);
      
      expect(() => getEffectiveAccessToken(testFilePath)).toThrow(
        'No access token available for test.md. Please configure an access token.'
      );

      loadAccessTokenSpy.mockRestore();
    });
  });

  describe("3. Cache System Enhancement (R2)", () => {
    it("should include accessToken when adding to cache", () => {
      const cacheManager = {
        addPage: vi.fn()
      };
      
      (publisher as any).cacheManager = cacheManager;
      
      // Access private method
      const addToCache = (publisher as any).addToCache.bind(publisher);
      
      addToCache(testFilePath, "https://telegra.ph/test", "/test", "Test Title", "testuser", "hash123", "token123");
      
      expect(cacheManager.addPage).toHaveBeenCalledWith(
        expect.objectContaining({
          telegraphUrl: "https://telegra.ph/test",
          editPath: "/test",
          title: "Test Title",
          authorName: "testuser",
          contentHash: "hash123",
          accessToken: "token123"
        })
      );
    });

    it("should fallback to current token when accessToken not provided", () => {
      const cacheManager = {
        addPage: vi.fn()
      };
      
      (publisher as any).cacheManager = cacheManager;
      const addToCache = (publisher as any).addToCache.bind(publisher);
      
      addToCache(testFilePath, "https://telegra.ph/test", "/test", "Test Title", "testuser", "hash123");
      
      expect(cacheManager.addPage).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "test-current-token"
        })
      );
    });
  });

  describe("4. Cache Restore Logic Enhancement (R3, R4, R8)", () => {
    it("should restore metadata with cached accessToken", async () => {
      // Create test file without metadata
      writeFileSync(testFilePath, '# Test Content\n\nSome content here.');
      
      // Mock cache info with accessToken
      const cacheInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/test",
        editPath: "/test",
        title: "Test",
        authorName: "Test Author",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        accessToken: "cached-token-123"
      };

      // Mock cache manager
      const cacheManager = {
        getPageByLocalPath: vi.fn().mockReturnValue(cacheInfo)
      };
      (publisher as any).cacheManager = cacheManager;

      // Mock editWithMetadata to avoid actual API calls
      const editWithMetadataSpy = vi.spyOn(publisher as any, 'editWithMetadata');
      editWithMetadataSpy.mockResolvedValue({ success: true });

      // Console spy to verify logging
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await publisher.publishWithMetadata(testFilePath, "testuser");

      // Verify cache restore logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Found')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔑 Cache restore: using cached token')
      );

      // Verify file now contains metadata with accessToken
      const restoredContent = readFileSync(testFilePath, 'utf-8');
      expect(restoredContent).toContain('accessToken: "cached-token-123"');

      consoleLogSpy.mockRestore();
      editWithMetadataSpy.mockRestore();
    });

    it("should perform token backfill for legacy cache entries", async () => {
      // Create test file without metadata
      writeFileSync(testFilePath, '# Test Content\n\nSome content here.');
      
      // Mock legacy cache info WITHOUT accessToken
      const legacyCacheInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/test",
        editPath: "/test",
        title: "Test",
        authorName: "Test Author",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
        // No accessToken - legacy entry
      };

      // Mock directory config token
      const loadAccessTokenSpy = vi.spyOn(ConfigManager, 'loadAccessToken');
      loadAccessTokenSpy.mockImplementation((dir) => {
        if (dir === dirname(testFilePath)) return "directory-token-456";
        return undefined;
      });

      const cacheManager = {
        getPageByLocalPath: vi.fn().mockReturnValue(legacyCacheInfo)
      };
      (publisher as any).cacheManager = cacheManager;

      const editWithMetadataSpy = vi.spyOn(publisher as any, 'editWithMetadata');
      editWithMetadataSpy.mockResolvedValue({ success: true });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await publisher.publishWithMetadata(testFilePath, "testuser");

      // Verify token backfill logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔄 Legacy cache detected')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('💾 Token backfill: directory → file metadata')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Token backfill complete: future edits will use directory token')
      );

      // Verify file now contains backfilled accessToken
      const restoredContent = readFileSync(testFilePath, 'utf-8');
      expect(restoredContent).toContain('accessToken: "directory-token-456"');

      loadAccessTokenSpy.mockRestore();
      consoleLogSpy.mockRestore();
      editWithMetadataSpy.mockRestore();
    });
  });

  describe("5. Enhanced Error Diagnostics (R6)", () => {
    it("should provide enhanced PAGE_ACCESS_DENIED diagnostics", async () => {
      // Mock super.editPage to throw PAGE_ACCESS_DENIED
      const superEditPageSpy = vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(publisher)), 'editPage');
      superEditPageSpy.mockRejectedValue(new Error('Telegraph API error: PAGE_ACCESS_DENIED'));

      // Mock rate limiter
      const rateLimiter = {
        beforeCall: vi.fn(),
        markSuccessfulCall: vi.fn(),
        handleFloodWait: vi.fn()
      };
      (publisher as any).rateLimiter = rateLimiter;

      // Console spy to verify enhanced diagnostics
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await publisher.editPage("/test-path", "Test Title", []);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        // Verify enhanced error message
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('PAGE_ACCESS_DENIED for /test-path');
        expect((error as Error).message).toContain('Token mismatch');
        expect((error as Error).message).toContain('different access token');

        // Verify enhanced diagnostics logging
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('🚫 PAGE_ACCESS_DENIED: Token mismatch detected')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('💡 This usually means the file was published with a different access token')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('🔧 Suggested solutions')
        );
      }

      consoleErrorSpy.mockRestore();
      superEditPageSpy.mockRestore();
    });
  });

  describe("6. Backward Compatibility", () => {
    it("should maintain compatibility with existing cache entries", () => {
      // Test that old cache entries without accessToken still work
      const legacyPageInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/legacy",
        editPath: "/legacy",
        title: "Legacy Page",
        authorName: "Legacy Author",
        publishedAt: "2023-01-01T00:00:00.000Z",
        lastUpdated: "2023-01-01T00:00:00.000Z"
        // No accessToken, contentHash - legacy format
      };

      // Should not throw errors
      expect(() => {
        const cacheManager = {
          addPage: vi.fn()
        };
        cacheManager.addPage(legacyPageInfo);
      }).not.toThrow();

      expect(legacyPageInfo.accessToken).toBeUndefined();
    });

    it("should handle mixed cache entries (with and without accessToken)", () => {
      const modernPageInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/modern",
        editPath: "/modern",
        title: "Modern Page",
        authorName: "Modern Author",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        contentHash: "hash123",
        accessToken: "modern-token"
      };

      const legacyPageInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/legacy",
        editPath: "/legacy",
        title: "Legacy Page", 
        authorName: "Legacy Author",
        publishedAt: "2023-01-01T00:00:00.000Z",
        lastUpdated: "2023-01-01T00:00:00.000Z"
      };

      // Both should be valid
      expect(modernPageInfo.accessToken).toBe("modern-token");
      expect(legacyPageInfo.accessToken).toBeUndefined();
    });
  });

  describe("7. Progressive Disclosure Logging Pattern", () => {
    it("should provide appropriate logging detail levels", async () => {
      writeFileSync(testFilePath, '# Test Content');
      
      const cacheInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/test",
        editPath: "/test",
        title: "Test",
        authorName: "Test Author",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        accessToken: "test-token"
      };

      const cacheManager = {
        getPageByLocalPath: vi.fn().mockReturnValue(cacheInfo)
      };
      (publisher as any).cacheManager = cacheManager;

      const editWithMetadataSpy = vi.spyOn(publisher as any, 'editWithMetadata');
      editWithMetadataSpy.mockResolvedValue({ success: true });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await publisher.publishWithMetadata(testFilePath, "testuser");

      // Verify progressive disclosure: essential info always shown
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Found')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔑 Cache restore: using cached token')
      );

      consoleLogSpy.mockRestore();
      editWithMetadataSpy.mockRestore();
    });
  });

  describe("8. Integration Tests", () => {
    it("should handle complete cache restore workflow", async () => {
      // Create file without metadata
      writeFileSync(testFilePath, '# Integration Test\n\nContent for integration test.');
      
      // Mock legacy cache entry
      const legacyCacheInfo: PublishedPageInfo = {
        telegraphUrl: "https://telegra.ph/integration-test",
        editPath: "/integration-test", 
        title: "Integration Test",
        authorName: "Test User",
        publishedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      // Mock directory token
      const loadAccessTokenSpy = vi.spyOn(ConfigManager, 'loadAccessToken');
      loadAccessTokenSpy.mockImplementation((dir) => {
        if (dir === dirname(testFilePath)) return "integration-directory-token";
        return undefined;
      });

      const cacheManager = {
        getPageByLocalPath: vi.fn().mockReturnValue(legacyCacheInfo)
      };
      (publisher as any).cacheManager = cacheManager;

      const editWithMetadataSpy = vi.spyOn(publisher as any, 'editWithMetadata');
      editWithMetadataSpy.mockResolvedValue({ success: true });

      // Execute the workflow
      const result = await publisher.publishWithMetadata(testFilePath, "testuser");

      // Verify successful result
      expect(result.success).toBe(true);

      // Verify file was updated with complete metadata including accessToken
      const finalContent = readFileSync(testFilePath, 'utf-8');
      expect(finalContent).toContain('telegraphUrl: "https://telegra.ph/integration-test"');
      expect(finalContent).toContain('editPath: "/integration-test"');
      expect(finalContent).toContain('accessToken: "integration-directory-token"');

      loadAccessTokenSpy.mockRestore();
      editWithMetadataSpy.mockRestore();
    });
  });
}); 