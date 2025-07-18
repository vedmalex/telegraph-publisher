import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { PagesCacheManager } from "../cache/PagesCacheManager";
import { TestHelpers } from "../test-utils/TestHelpers";
import { BidirectionalLinkResolver } from "./BidirectionalLinkResolver";

describe("BidirectionalLinkResolver", () => {
  let tempDir: string;
  let cacheManager: PagesCacheManager;
  let resolver: BidirectionalLinkResolver;

  beforeEach(() => {
    tempDir = TestHelpers.createTempDir("bidirectional-link-test");
    cacheManager = new PagesCacheManager(tempDir, "test-access-token");
    resolver = new BidirectionalLinkResolver(cacheManager);
  });

  afterEach(() => {
    TestHelpers.cleanup();
  });

  describe("findTelegraphLinks", () => {
    it("should find Telegraph links pointing to our pages", () => {
      const content = `# Test Article

This is a [telegraph link](https://telegra.ph/Our-Page-01-01) and [another link](https://telegra.ph/Another-Page-01-02).
Also an [external telegraph link](https://telegra.ph/Not-Our-Page-01-03).`;

      // Add our pages to cache
      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Our-Page-01-01",
        localFilePath: join(tempDir, "our-page.md")
      }));
      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Another-Page-01-02",
        localFilePath: join(tempDir, "another-page.md")
      }));

      const telegraphLinks = BidirectionalLinkResolver.findTelegraphLinks(content, cacheManager);

      expect(telegraphLinks).toHaveLength(3);
      expect(telegraphLinks[0]?.shouldConvertToLocal).toBe(true);
      expect(telegraphLinks[0]?.localFilePath).toBe(join(tempDir, "our-page.md"));
      expect(telegraphLinks[1]?.shouldConvertToLocal).toBe(true);
      expect(telegraphLinks[2]?.shouldConvertToLocal).toBe(false); // Not our page
    });

    it("should handle content without Telegraph links", () => {
      const content = `# Test Article

This is content with [local links](./local.md) and [external links](https://example.com).`;

      const telegraphLinks = BidirectionalLinkResolver.findTelegraphLinks(content, cacheManager);

      expect(telegraphLinks).toHaveLength(0);
    });

    it("should handle empty content", () => {
      const telegraphLinks = BidirectionalLinkResolver.findTelegraphLinks("", cacheManager);

      expect(telegraphLinks).toHaveLength(0);
    });
  });

  describe("findLocalLinksEnhanced", () => {
    it("should mark internal links to published pages", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./published.md", "./unpublished.md"]
      );
      const basePath = join(tempDir, "main.md");

      // Add published page to cache
      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Published-01-01",
        localFilePath: join(tempDir, "published.md")
      }));

      const localLinks = BidirectionalLinkResolver.findLocalLinksEnhanced(content, basePath, cacheManager);

      expect(localLinks).toHaveLength(2);
      expect(localLinks[0]?.isInternalLink).toBe(true); // Published page
      expect(localLinks[1]?.isInternalLink).toBeUndefined(); // Unpublished page (property not set)
    });

    it("should handle content without local links", () => {
      const content = `# Test Article

This is content with [external links](https://example.com) only.`;

      const basePath = join(tempDir, "main.md");
      const localLinks = BidirectionalLinkResolver.findLocalLinksEnhanced(content, basePath, cacheManager);

      expect(localLinks).toHaveLength(0);
    });
  });

  describe("replaceTelegraphLinksWithLocal", () => {
    it("should replace Telegraph links with local links", () => {
      const content = `# Test Article

This is a [telegraph link](https://telegra.ph/Our-Page-01-01) and [another link](https://telegra.ph/Another-Page-01-02).`;

      const telegraphLinks = [
        {
          text: "telegraph link",
          telegraphUrl: "https://telegra.ph/Our-Page-01-01",
          localFilePath: "./our-page.md",
          fullMatch: "[telegraph link](https://telegra.ph/Our-Page-01-01)",
          startIndex: 30,
          endIndex: 85,
          shouldConvertToLocal: true
        },
        {
          text: "another link",
          telegraphUrl: "https://telegra.ph/Another-Page-01-02",
          localFilePath: "./another-page.md",
          fullMatch: "[another link](https://telegra.ph/Another-Page-01-02)",
          startIndex: 90,
          endIndex: 150,
          shouldConvertToLocal: true
        }
      ];

      const result = BidirectionalLinkResolver.replaceTelegraphLinksWithLocal(content, telegraphLinks);

      expect(result).toContain("[telegraph link](./our-page.md)");
      expect(result).toContain("[another link](./another-page.md)");
      expect(result).not.toContain("telegra.ph");
    });

    it("should only replace links marked for conversion", () => {
      const content = `# Test Article

This is [our link](https://telegra.ph/Our-Page-01-01) and [external link](https://telegra.ph/External-01-02).`;

      const telegraphLinks = [
        {
          text: "our link",
          telegraphUrl: "https://telegra.ph/Our-Page-01-01",
          localFilePath: "./our-page.md",
          fullMatch: "[our link](https://telegra.ph/Our-Page-01-01)",
          startIndex: 20,
          endIndex: 70,
          shouldConvertToLocal: true
        },
        {
          text: "external link",
          telegraphUrl: "https://telegra.ph/External-01-02",
          localFilePath: undefined,
          fullMatch: "[external link](https://telegra.ph/External-01-02)",
          startIndex: 75,
          endIndex: 130,
          shouldConvertToLocal: false
        }
      ];

      const result = BidirectionalLinkResolver.replaceTelegraphLinksWithLocal(content, telegraphLinks);

      expect(result).toContain("[our link](./our-page.md)");
      expect(result).toContain("[external link](https://telegra.ph/External-01-02)");
    });

    it("should handle empty telegraph links array", () => {
      const content = `# Test Article

This is content with [telegraph links](https://telegra.ph/Some-Page-01-01).`;

      const result = BidirectionalLinkResolver.replaceTelegraphLinksWithLocal(content, []);

      expect(result).toBe(content);
    });
  });

  describe("processBidirectionalContent", () => {
    it("should process content with both local and Telegraph links", () => {
      const content = `# Test Article

This is a [local link](./local.md) and a [telegraph link](https://telegra.ph/Our-Page-01-01).
Also an [external link](https://example.com).`;

      const basePath = join(tempDir, "main.md");

      // Setup cache
      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Our-Page-01-01",
        localFilePath: join(tempDir, "our-page.md")
      }));

      // Create local file
      TestHelpers.createTestFile(join(tempDir, "local.md"), "# Local Page");

      const result = BidirectionalLinkResolver.processBidirectionalContent(content, basePath, cacheManager);

      expect(result.contentWithLocalLinks).toContain("[local link](./local.md)");
      expect(result.contentWithLocalLinks).toContain(`[telegraph link](${join(tempDir, "our-page.md")})`);
      expect(result.contentWithTelegraphLinks).toContain("[local link](./local.md)");
      expect(result.contentWithTelegraphLinks).toContain("[telegraph link](https://telegra.ph/Our-Page-01-01)");
      expect(result.hasTelegraphToLocalChanges).toBe(true);
      expect(result.hasLocalToTelegraphChanges).toBe(false); // No published local links
    });

    it("should handle content with only local links", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./local1.md", "./local2.md"]
      );
      const basePath = join(tempDir, "main.md");

      TestHelpers.createTestFile(join(tempDir, "local1.md"), "# Local 1");
      TestHelpers.createTestFile(join(tempDir, "local2.md"), "# Local 2");

      const result = BidirectionalLinkResolver.processBidirectionalContent(content, basePath, cacheManager);

      expect(result.localLinks).toHaveLength(2);
      expect(result.telegraphLinks).toHaveLength(0);
      expect(result.hasTelegraphToLocalChanges).toBe(false);
      expect(result.hasLocalToTelegraphChanges).toBe(false);
    });

    it("should handle content with only Telegraph links", () => {
      const content = `# Test Article

This is a [telegraph link](https://telegra.ph/Our-Page-01-01).`;

      const basePath = join(tempDir, "main.md");

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Our-Page-01-01",
        localFilePath: join(tempDir, "our-page.md")
      }));

      const result = BidirectionalLinkResolver.processBidirectionalContent(content, basePath, cacheManager);

      expect(result.localLinks).toHaveLength(0);
      expect(result.telegraphLinks).toHaveLength(1);
      expect(result.hasTelegraphToLocalChanges).toBe(true);
      expect(result.hasLocalToTelegraphChanges).toBe(false);
    });
  });

  describe("updateSourceFileWithLocalLinks", () => {
    it("should update source file when changes are needed", () => {
      const filePath = join(tempDir, "test.md");
      const originalContent = `# Test Article

This is a [telegraph link](https://telegra.ph/Our-Page-01-01).`;

      const contentWithLocalLinks = `# Test Article

This is a [telegraph link](./our-page.md).`;

      TestHelpers.createTestFile(filePath, originalContent);

      const wasUpdated = BidirectionalLinkResolver.updateSourceFileWithLocalLinks(
        filePath,
        contentWithLocalLinks,
        originalContent,
        true
      );

      expect(wasUpdated).toBe(true);
      const updatedContent = TestHelpers.readFile(filePath);
      expect(updatedContent).toBe(contentWithLocalLinks);
    });

    it("should not update source file when no changes are needed", () => {
      const filePath = join(tempDir, "test.md");
      const originalContent = `# Test Article

This is content without Telegraph links.`;

      TestHelpers.createTestFile(filePath, originalContent);

      const wasUpdated = BidirectionalLinkResolver.updateSourceFileWithLocalLinks(
        filePath,
        originalContent,
        originalContent,
        false
      );

      expect(wasUpdated).toBe(false);
    });

    it("should handle non-existent file by creating it", () => {
      const filePath = join(tempDir, "non-existent.md");
      const contentWithLocalLinks = "# Test";

      const wasUpdated = BidirectionalLinkResolver.updateSourceFileWithLocalLinks(
        filePath,
        contentWithLocalLinks,
        "original",
        true
      );

      expect(wasUpdated).toBe(true);
      expect(TestHelpers.fileExists(filePath)).toBe(true);
      expect(TestHelpers.readFile(filePath)).toBe(contentWithLocalLinks);
    });
  });

  describe("analyzeBidirectionalChanges", () => {
    it("should analyze changes correctly", () => {
      const localLinks = [
        {
          text: "local1",
          originalPath: "./local1.md",
          resolvedPath: join(tempDir, "local1.md"),
          isPublished: true,
          isInternalLink: true,
          fullMatch: "[local1](./local1.md)",
          startIndex: 0,
          endIndex: 20,
          telegraphUrl: "https://telegra.ph/Local1-01-01"
        },
        {
          text: "local2",
          originalPath: "./local2.md",
          resolvedPath: join(tempDir, "local2.md"),
          isPublished: false,
          isInternalLink: false,
          fullMatch: "[local2](./local2.md)",
          startIndex: 25,
          endIndex: 45
        }
      ];

      const telegraphLinks = [
        {
          text: "telegraph1",
          telegraphUrl: "https://telegra.ph/Telegraph1-01-01",
          localFilePath: "./telegraph1.md",
          fullMatch: "[telegraph1](https://telegra.ph/Telegraph1-01-01)",
          startIndex: 50,
          endIndex: 100,
          shouldConvertToLocal: true
        }
      ];

      const analysis = BidirectionalLinkResolver.analyzeBidirectionalChanges(localLinks, telegraphLinks);

      expect(analysis.localToTelegraphCount).toBe(1); // Only published local links
      expect(analysis.telegraphToLocalCount).toBe(1); // Only convertible telegraph links
      expect(analysis.internalLinksCount).toBe(1);
      expect(analysis.externalTelegraphLinksCount).toBe(0);
    });

    it("should handle empty arrays", () => {
      const analysis = BidirectionalLinkResolver.analyzeBidirectionalChanges([], []);

      expect(analysis.localToTelegraphCount).toBe(0);
      expect(analysis.telegraphToLocalCount).toBe(0);
      expect(analysis.internalLinksCount).toBe(0);
      expect(analysis.externalTelegraphLinksCount).toBe(0);
    });
  });

  describe("validateBidirectionalLinks", () => {
    it("should validate links and report issues", () => {
      const localLinks = [
        {
          text: "broken",
          originalPath: "./broken.md",
          resolvedPath: join(tempDir, "broken.md"), // Non-existent file
          isPublished: false,
          isInternalLink: false,
          fullMatch: "[broken](./broken.md)",
          startIndex: 0,
          endIndex: 20
        },
        {
          text: "valid",
          originalPath: "./valid.md",
          resolvedPath: join(tempDir, "valid.md"),
          isPublished: true,
          isInternalLink: true,
          fullMatch: "[valid](./valid.md)",
          startIndex: 25,
          endIndex: 45,
          telegraphUrl: "https://telegra.ph/Valid-01-01"
        }
      ];

      const telegraphLinks = [
        {
          text: "missing",
          telegraphUrl: "https://telegra.ph/Missing-01-01",
          localFilePath: undefined, // Missing local mapping
          fullMatch: "[missing](https://telegra.ph/Missing-01-01)",
          startIndex: 50,
          endIndex: 100,
          shouldConvertToLocal: false
        }
      ];

      // Create valid file
      TestHelpers.createTestFile(join(tempDir, "valid.md"), "# Valid");

      const validation = BidirectionalLinkResolver.validateBidirectionalLinks(localLinks, telegraphLinks, cacheManager);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(error => error.includes("broken.md"))).toBe(true);
    });

    it("should validate successfully with no issues", () => {
      const localLinks = [
        {
          text: "valid",
          originalPath: "./valid.md",
          resolvedPath: join(tempDir, "valid.md"),
          isPublished: true,
          isInternalLink: true,
          fullMatch: "[valid](./valid.md)",
          startIndex: 0,
          endIndex: 20,
          telegraphUrl: "https://telegra.ph/Valid-01-01"
        }
      ];

      const telegraphLinks = [
        {
          text: "mapped",
          telegraphUrl: "https://telegra.ph/Mapped-01-01",
          localFilePath: "./mapped.md",
          fullMatch: "[mapped](https://telegra.ph/Mapped-01-01)",
          startIndex: 25,
          endIndex: 75,
          shouldConvertToLocal: true
        }
      ];

      // Create files
      TestHelpers.createTestFile(join(tempDir, "valid.md"), "# Valid");
      TestHelpers.createTestFile(join(tempDir, "mapped.md"), "# Mapped");

      const validation = BidirectionalLinkResolver.validateBidirectionalLinks(localLinks, telegraphLinks, cacheManager);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle content with mixed link types", () => {
      const content = `# Test Article

This is a [local link](./local.md), a [telegraph link](https://telegra.ph/Our-Page-01-01),
and an [external link](https://example.com).`;

      const basePath = join(tempDir, "main.md");

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Our-Page-01-01",
        localFilePath: join(tempDir, "our-page.md")
      }));

      TestHelpers.createTestFile(join(tempDir, "local.md"), "# Local");

      const result = BidirectionalLinkResolver.processBidirectionalContent(content, basePath, cacheManager);

      expect(result.localLinks).toHaveLength(1);
      expect(result.telegraphLinks).toHaveLength(1);
      expect(result.contentWithLocalLinks).toContain("./local.md");
      expect(result.contentWithLocalLinks).toContain(join(tempDir, "our-page.md"));
      expect(result.contentWithLocalLinks).toContain("https://example.com");
    });

    it("should handle very long URLs", () => {
      const longUrl = "https://telegra.ph/" + "a".repeat(500);
      const content = `# Test Article

This is a [long link](${longUrl}).`;

      const basePath = join(tempDir, "main.md");

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: longUrl,
        localFilePath: join(tempDir, "long.md")
      }));

      const result = BidirectionalLinkResolver.processBidirectionalContent(content, basePath, cacheManager);

      expect(result.telegraphLinks).toHaveLength(1);
      expect(result.telegraphLinks[0]?.shouldConvertToLocal).toBe(true);
    });

    it("should handle special characters in file paths", () => {
      const content = `# Test Article

This is a [русская ссылка](https://telegra.ph/Русская-статья-01-01) and [中文链接](https://telegra.ph/中文文章-01-02).`;

      const basePath = join(tempDir, "main.md");

      cacheManager.addPage(TestHelpers.createSamplePageInfo({
        telegraphUrl: "https://telegra.ph/Русская-статья-01-01",
        localFilePath: join(tempDir, "русская.md")
      }));

      const result = BidirectionalLinkResolver.processBidirectionalContent(content, basePath, cacheManager);

      expect(result.telegraphLinks).toHaveLength(2);
      expect(result.telegraphLinks[0]?.shouldConvertToLocal).toBe(true);
      expect(result.telegraphLinks[1]?.shouldConvertToLocal).toBe(false); // Not in cache
    });
  });
});