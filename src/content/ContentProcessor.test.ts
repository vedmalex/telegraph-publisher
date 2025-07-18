import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { TestHelpers } from "../test-utils/TestHelpers";
import { ContentProcessor } from "./ContentProcessor";

describe("ContentProcessor", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = TestHelpers.createTempDir("content-processor-test");
  });

  afterEach(() => {
    TestHelpers.cleanup();
  });

  describe("processFile", () => {
    it("should process file with metadata", () => {
      const testFile = join(tempDir, "test.md");
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";

      TestHelpers.createTestFile(testFile, content, metadata);

      const result = ContentProcessor.processFile(testFile);

      expect(result.originalContent).toContain("---");
      expect(result.originalContent).toContain(content);
      expect(result.contentWithoutMetadata).toBe(content);
      expect(result.metadata).toEqual(metadata);
      expect(result.localLinks).toHaveLength(0);
      expect(result.hasChanges).toBe(false);
    });

    it("should process file without metadata", () => {
      const testFile = join(tempDir, "test.md");
      const content = "# Test Article\n\nThis is test content.";

      TestHelpers.createTestFile(testFile, content);

      const result = ContentProcessor.processFile(testFile);

      expect(result.originalContent).toBe(content);
      expect(result.contentWithoutMetadata).toBe(content);
      expect(result.metadata).toBeUndefined();
      expect(result.localLinks).toHaveLength(0);
      expect(result.hasChanges).toBe(false);
    });

    it("should process file with local links", () => {
      const testFile = join(tempDir, "test.md");
      const linkedFile = join(tempDir, "linked.md");

      TestHelpers.createTestFile(testFile, TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md"]
      ));
      TestHelpers.createTestFile(linkedFile, "# Linked Article");

      const result = ContentProcessor.processFile(testFile);

      expect(result.localLinks).toHaveLength(1);
      expect(result.localLinks[0]?.originalPath).toBe("./linked.md");
      expect(result.localLinks[0]?.resolvedPath).toBe(linkedFile);
      expect(result.hasChanges).toBe(true);
    });

    it("should throw error for non-existent file", () => {
      const nonExistentFile = join(tempDir, "non-existent.md");

      expect(() => {
        ContentProcessor.processFile(nonExistentFile);
      }).toThrow("Failed to read file");
    });
  });

  describe("processContent", () => {
    it("should process content with metadata", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      const contentWithMetadata = TestHelpers.createYamlFrontMatter(metadata) + "\n\n" + content;
      const basePath = join(tempDir, "test.md");

      const result = ContentProcessor.processContent(contentWithMetadata, basePath);

      expect(result.originalContent).toBe(contentWithMetadata);
      expect(result.contentWithoutMetadata).toBe(content);
      expect(result.metadata).toEqual(metadata);
    });

    it("should process content with local links", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md", "../other.md"]
      );
      const basePath = join(tempDir, "test.md");

      const result = ContentProcessor.processContent(content, basePath);

      expect(result.localLinks).toHaveLength(2);
      expect(result.localLinks[0]?.originalPath).toBe("./linked.md");
      expect(result.localLinks[1]?.originalPath).toBe("../other.md");
      expect(result.hasChanges).toBe(true);
    });

    it("should process content with external links", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", [], ["https://example.com", "mailto:test@example.com"]
      );
      const basePath = join(tempDir, "test.md");

      const result = ContentProcessor.processContent(content, basePath);

      expect(result.localLinks).toHaveLength(0);
      expect(result.hasChanges).toBe(false);
    });

    it("should handle empty content", () => {
      const content = "";
      const basePath = join(tempDir, "test.md");

      const result = ContentProcessor.processContent(content, basePath);

      expect(result.originalContent).toBe("");
      expect(result.contentWithoutMetadata).toBe("");
      expect(result.metadata).toBeUndefined();
      expect(result.localLinks).toHaveLength(0);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe("replaceLinksInContent", () => {
    it("should replace local links with Telegraph URLs", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md", "./another.md"]
      );
      const basePath = join(tempDir, "test.md");
      const linkedFile = join(tempDir, "linked.md");
      const anotherFile = join(tempDir, "another.md");

      TestHelpers.createTestFile(linkedFile, "# Linked");
      TestHelpers.createTestFile(anotherFile, "# Another");

      const processedContent = ContentProcessor.processContent(content, basePath);

      const linkMappings = new Map([
        [linkedFile, "https://telegra.ph/Linked-01-01"],
        [anotherFile, "https://telegra.ph/Another-01-01"]
      ]);

      const result = ContentProcessor.replaceLinksInContent(processedContent, linkMappings);

      expect(result.contentWithReplacedLinks).toContain("https://telegra.ph/Linked-01-01");
      expect(result.contentWithReplacedLinks).toContain("https://telegra.ph/Another-01-01");
      expect(result.hasChanges).toBe(true);
      expect(result.localLinks[0]?.isPublished).toBe(true);
      expect(result.localLinks[0]?.telegraphUrl).toBe("https://telegra.ph/Linked-01-01");
    });

    it("should handle partial link replacements", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md", "./unpublished.md"]
      );
      const basePath = join(tempDir, "test.md");
      const linkedFile = join(tempDir, "linked.md");
      const unpublishedFile = join(tempDir, "unpublished.md");

      TestHelpers.createTestFile(linkedFile, "# Linked");
      TestHelpers.createTestFile(unpublishedFile, "# Unpublished");

      const processedContent = ContentProcessor.processContent(content, basePath);

      const linkMappings = new Map([
        [linkedFile, "https://telegra.ph/Linked-01-01"]
        // unpublishedFile is not in mappings
      ]);

      const result = ContentProcessor.replaceLinksInContent(processedContent, linkMappings);

      expect(result.contentWithReplacedLinks).toContain("https://telegra.ph/Linked-01-01");
      expect(result.contentWithReplacedLinks).toContain("./unpublished.md");
      expect(result.localLinks[0]?.isPublished).toBe(true);
      expect(result.localLinks[1]?.isPublished).toBe(false);
    });

    it("should handle empty link mappings", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md"]
      );
      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);
      const linkMappings = new Map();

      const result = ContentProcessor.replaceLinksInContent(processedContent, linkMappings);

      expect(result.contentWithReplacedLinks).toBe(processedContent.contentWithoutMetadata);
      expect(result.hasChanges).toBe(false);
      expect(result.localLinks[0]?.isPublished).toBe(false);
    });
  });

  describe("prepareForPublication", () => {
    it("should return content with replaced links", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md"]
      );
      const basePath = join(tempDir, "test.md");
      const linkedFile = join(tempDir, "linked.md");

      TestHelpers.createTestFile(linkedFile, "# Linked");

      let processedContent = ContentProcessor.processContent(content, basePath);

      const linkMappings = new Map([
        [linkedFile, "https://telegra.ph/Linked-01-01"]
      ]);

      processedContent = ContentProcessor.replaceLinksInContent(processedContent, linkMappings);
      const publicationContent = ContentProcessor.prepareForPublication(processedContent);

      expect(publicationContent).toContain("https://telegra.ph/Linked-01-01");
      expect(publicationContent).not.toContain("./linked.md");
    });

    it("should handle content without links", () => {
      const content = "# Test Article\n\nThis is test content.";
      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);
      const publicationContent = ContentProcessor.prepareForPublication(processedContent);

      expect(publicationContent).toBe(content);
    });
  });

  describe("injectMetadataIntoContent", () => {
    it("should inject metadata into processed content", () => {
      const content = "# Test Article\n\nThis is test content.";
      const basePath = join(tempDir, "test.md");
      const metadata = TestHelpers.createSampleMetadata();

      const processedContent = ContentProcessor.processContent(content, basePath);
      const contentWithMetadata = ContentProcessor.injectMetadataIntoContent(processedContent, metadata);

      expect(contentWithMetadata).toContain("---");
      expect(contentWithMetadata).toContain(`telegraphUrl: "${metadata.telegraphUrl}"`);
      expect(contentWithMetadata).toContain(content);
    });

    it("should handle content that already has metadata", () => {
      const originalMetadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      const basePath = join(tempDir, "test.md");

      const contentWithOriginalMetadata = TestHelpers.createYamlFrontMatter(originalMetadata) + "\n\n" + content;
      const processedContent = ContentProcessor.processContent(contentWithOriginalMetadata, basePath);

      const newMetadata = TestHelpers.createSampleMetadata({
        title: "Updated Title"
      });

      const contentWithNewMetadata = ContentProcessor.injectMetadataIntoContent(processedContent, newMetadata);

      expect(contentWithNewMetadata).toContain(`title: "${newMetadata.title}"`);
      expect(contentWithNewMetadata).toContain(content);
    });
  });

  describe("validateContent", () => {
    it("should validate content with valid links", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./linked.md"]
      );
      const basePath = join(tempDir, "test.md");
      const linkedFile = join(tempDir, "linked.md");

      TestHelpers.createTestFile(linkedFile, "# Linked");

      let processedContent = ContentProcessor.processContent(content, basePath);

      const linkMappings = new Map([
        [linkedFile, "https://telegra.ph/Linked-01-01"]
      ]);

      processedContent = ContentProcessor.replaceLinksInContent(processedContent, linkMappings);
      const validation = ContentProcessor.validateContent(processedContent);

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it("should detect broken links", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./non-existent.md"]
      );
      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);
      const validation = ContentProcessor.validateContent(processedContent);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes("Broken local links"))).toBe(true);
    });

    it("should detect unpublished dependencies", () => {
      const content = TestHelpers.createMarkdownWithLinks(
        "Test Article", ["./unpublished.md"]
      );
      const basePath = join(tempDir, "test.md");
      const unpublishedFile = join(tempDir, "unpublished.md");

      TestHelpers.createTestFile(unpublishedFile, "# Unpublished");

      const processedContent = ContentProcessor.processContent(content, basePath);
      const validation = ContentProcessor.validateContent(processedContent);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes("Unpublished dependencies"))).toBe(true);
    });

    it("should detect empty content", () => {
      const content = "";
      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);
      const validation = ContentProcessor.validateContent(processedContent);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes("Content is empty"))).toBe(true);
    });

    it("should validate content with only whitespace as empty", () => {
      const content = "   \n  \t  \n   ";
      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);
      const validation = ContentProcessor.validateContent(processedContent);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes("Content is empty"))).toBe(true);
    });
  });

  describe("getContentStats", () => {
    it("should return correct content statistics", () => {
      const content = "# Test\n\nContent with [local link](./test.md).";
      const result = ContentProcessor.processContent(content, tempDir);
      const stats = ContentProcessor.getContentStats(result);

      expect(stats.originalLength).toBeGreaterThan(0);
      expect(stats.processedLength).toBeGreaterThan(0);
      expect(stats.localLinksCount).toBe(1);
      expect(stats.hasMetadata).toBe(false);
    });
  });

  describe("cloneProcessedContent", () => {
    it("should create deep copy of processed content", () => {
      const content = "# Test\n\nContent with [local link](./test.md).";
      const original = ContentProcessor.processContent(content, tempDir);
      const cloned = ContentProcessor.cloneProcessedContent(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.localLinks).not.toBe(original.localLinks);
    });
  });

  describe("extractTitle", () => {
    it("should extract title from first heading", () => {
      const content = "# Heading Title\n\nContent here.";
      const result = ContentProcessor.processContent(content, tempDir);
      const title = ContentProcessor.extractTitle(result);

      expect(title).toBe("Heading Title");
    });

    it("should extract title from bold text", () => {
      const content = "**Bold Title**\n\nContent here.";
      const result = ContentProcessor.processContent(content, tempDir);
      const title = ContentProcessor.extractTitle(result);

      expect(title).toBe("Bold Title");
    });

    it("should return null for very long first line", () => {
      const longLine = "This is a very long line that should not be considered a title because it exceeds the 100 character limit and contains too much content to be a proper title";
      const content = `${longLine}\n\nContent here.`;
      const result = ContentProcessor.processContent(content, tempDir);
      const title = ContentProcessor.extractTitle(result);

      expect(title).toBe(null);
    });
  });

  describe("edge cases", () => {
    it("should handle content with mixed link types", () => {
      const content = `# Test Article

This is a [local link](./local.md) and an [external link](https://example.com).
Also a [mailto link](mailto:test@example.com) and another [local link](./another.md).`;

      const basePath = join(tempDir, "test.md");
      const localFile = join(tempDir, "local.md");
      const anotherFile = join(tempDir, "another.md");

      TestHelpers.createTestFile(localFile, "# Local");
      TestHelpers.createTestFile(anotherFile, "# Another");

      const processedContent = ContentProcessor.processContent(content, basePath);

      expect(processedContent.localLinks).toHaveLength(2);
      expect(processedContent.localLinks.map(l => l.originalPath)).toEqual(["./local.md", "./another.md"]);
    });

    it("should handle very large content", () => {
      const largeContent = `# Large Article\n\n${"A".repeat(50000)}`;
      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(largeContent, basePath);

      expect(processedContent.contentWithoutMetadata.length).toBeGreaterThan(50000);
      expect(processedContent.localLinks).toHaveLength(0);
    });

    it("should handle content with special characters", () => {
      const content = `# Тест статья

Это статья с [русской ссылкой](./русский-файл.md) и [Chinese link](./中文文件.md).

Also emoji: 🔗 [emoji link](./emoji-😀.md)`;

      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);

      expect(processedContent.localLinks).toHaveLength(3);
      expect(processedContent.localLinks.map(l => l.originalPath)).toContain("./русский-файл.md");
      expect(processedContent.localLinks.map(l => l.originalPath)).toContain("./中文文件.md");
      expect(processedContent.localLinks.map(l => l.originalPath)).toContain("./emoji-😀.md");
    });

    it("should handle content with multiple same links", () => {
      const content = `# Test Article

First reference to [same file](./same.md).
Second reference to [same file](./same.md).
Third reference to [same file again](./same.md).`;

      const basePath = join(tempDir, "test.md");
      const sameFile = join(tempDir, "same.md");

      TestHelpers.createTestFile(sameFile, "# Same");

      const processedContent = ContentProcessor.processContent(content, basePath);

      expect(processedContent.localLinks).toHaveLength(3);
      expect(processedContent.localLinks.every(l => l.originalPath === "./same.md")).toBe(true);
    });

    it("should handle nested markdown structures", () => {
      const content = `# Test Article

## Section with [link](./section.md)

> Quote with [quoted link](./quote.md)

- List item with [list link](./list.md)
- Another item

\`\`\`markdown
This [code link](./code.md) should still be found
\`\`\`

Regular [normal link](./normal.md) after code block.`;

      const basePath = join(tempDir, "test.md");

      const processedContent = ContentProcessor.processContent(content, basePath);

      // Our simple parser finds all links including ones in code blocks
      expect(processedContent.localLinks).toHaveLength(5);
      expect(processedContent.localLinks.map(l => l.originalPath)).toContain("./code.md");
    });
  });
});