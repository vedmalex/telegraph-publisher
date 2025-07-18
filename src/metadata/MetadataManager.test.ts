import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { TestHelpers } from "../test-utils/TestHelpers";
import type { FileMetadata } from "../types/metadata";
import { PublicationStatus } from "../types/metadata";
import { MetadataManager } from "./MetadataManager";

describe("MetadataManager", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = TestHelpers.createTempDir("metadata-test");
    testFile = join(tempDir, "test.md");
  });

  afterEach(() => {
    TestHelpers.cleanup();
  });

  describe("parseMetadata", () => {
    it("should parse valid YAML front-matter", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      const contentWithMetadata = TestHelpers.createYamlFrontMatter(metadata) + "\n\n" + content;

      const result = MetadataManager.parseMetadata(contentWithMetadata);

      expect(result).toEqual(metadata);
    });

    it("should return null for content without metadata", () => {
      const content = "# Test Article\n\nNo metadata here.";

      const result = MetadataManager.parseMetadata(content);

      expect(result).toBeNull();
    });

    it("should handle malformed YAML gracefully", () => {
      const malformedYaml = `---
telegraphUrl: "https://telegra.ph/Test-01-01"
editPath: "Test-01-01"
username: "Test Author"
invalidField: some invalid syntax ][
---

# Test Article`;

      const result = MetadataManager.parseMetadata(malformedYaml);

      // Parser returns null because required fields (publishedAt, originalFilename) are missing
      expect(result).toBeNull();
    });
  });

  describe("injectMetadata", () => {
    it("should inject metadata into content without existing front-matter", () => {
      const content = "# Test Article\n\nThis is test content.";
      const metadata = TestHelpers.createSampleMetadata();

      const result = MetadataManager.injectMetadata(content, metadata);

      expect(result).toContain("---");
      expect(result).toContain(`telegraphUrl: "${metadata.telegraphUrl}"`);
      expect(result).toContain(`username: "${metadata.username}"`);
      expect(result).toContain("# Test Article");
    });

    it("should update existing metadata", () => {
      const originalMetadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      const contentWithMetadata = TestHelpers.createYamlFrontMatter(originalMetadata) + "\n\n" + content;

      const updatedMetadata = TestHelpers.createSampleMetadata({
        title: "Updated Title",
        username: "Updated Author"
      });

      const result = MetadataManager.injectMetadata(contentWithMetadata, updatedMetadata);

      expect(result).toContain(`title: "${updatedMetadata.title}"`);
      expect(result).toContain(`username: "${updatedMetadata.username}"`);
    });
  });

  describe("updateMetadata", () => {
    it("should update metadata in content", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      const contentWithMetadata = TestHelpers.createYamlFrontMatter(metadata) + "\n\n" + content;

      const updatedMetadata = TestHelpers.createSampleMetadata({
        title: "New Title",
        description: "New Description"
      });

      const result = MetadataManager.updateMetadata(contentWithMetadata, updatedMetadata);

      expect(result).toContain(`title: "${updatedMetadata.title}"`);
      expect(result).toContain(`description: "${updatedMetadata.description}"`);
    });
  });

  describe("removeMetadata", () => {
    it("should remove metadata from content", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      const contentWithMetadata = TestHelpers.createYamlFrontMatter(metadata) + "\n\n" + content;

      const result = MetadataManager.removeMetadata(contentWithMetadata);

      expect(result).not.toContain("---");
      expect(result).not.toContain("telegraphUrl:");
      expect(result).toContain("# Test Article");
      expect(result.trim()).toBe(content);
    });

    it("should handle content without metadata", () => {
      const content = "# Test Article\n\nNo metadata here.";

      const result = MetadataManager.removeMetadata(content);

      expect(result).toBe(content);
    });
  });

  describe("validateMetadata", () => {
    it("should validate correct metadata", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const result = MetadataManager.validateMetadata(metadata);

      expect(result).toBe(true);
    });

    it("should detect missing required fields", () => {
      const invalidMetadata = {
        telegraphUrl: "https://telegra.ph/Test-01-01",
        // Missing editPath, username, publishedAt, originalFilename
      } as FileMetadata;

      const result = MetadataManager.validateMetadata(invalidMetadata);

      expect(result).toBe(false);
    });

    it("should detect invalid URL format", () => {
      const metadata = TestHelpers.createSampleMetadata({
        telegraphUrl: "not-a-valid-url"
      });

      const result = MetadataManager.validateMetadata(metadata);

      expect(result).toBe(false);
    });

    it("should detect invalid date format", () => {
      const metadata = TestHelpers.createSampleMetadata({
        publishedAt: "not-a-valid-date"
      });

      const result = MetadataManager.validateMetadata(metadata);

      expect(result).toBe(false);
    });

    it("should return false for null metadata", () => {
      const result = MetadataManager.validateMetadata(null);

      expect(result).toBe(false);
    });
  });

  describe("getPublicationStatus", () => {
    it("should return PUBLISHED for file with valid metadata", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      TestHelpers.createTestFile(testFile, content, metadata);

      const status = MetadataManager.getPublicationStatus(testFile);

      expect(status).toBe(PublicationStatus.PUBLISHED);
    });

    it("should return NOT_PUBLISHED for file without metadata", () => {
      TestHelpers.createTestFile(testFile, "# Test Article\n\nNo metadata here.");

      const status = MetadataManager.getPublicationStatus(testFile);

      expect(status).toBe(PublicationStatus.NOT_PUBLISHED);
    });

    it("should return METADATA_CORRUPTED for file with invalid metadata", () => {
      const invalidMetadata = TestHelpers.createSampleMetadata({
        telegraphUrl: "not-a-valid-url",
        publishedAt: "invalid-date"
      });
      const content = "# Test Article\n\nThis is test content.";
      TestHelpers.createTestFile(testFile, content, invalidMetadata);

      const status = MetadataManager.getPublicationStatus(testFile);

      expect(status).toBe(PublicationStatus.METADATA_CORRUPTED);
    });

    it("should return METADATA_MISSING for non-existent file", () => {
      const status = MetadataManager.getPublicationStatus("/non/existent/file.md");

      expect(status).toBe(PublicationStatus.METADATA_MISSING);
    });
  });

  describe("getPublicationInfo", () => {
    it("should return metadata for published file", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      TestHelpers.createTestFile(testFile, content, metadata);

      const info = MetadataManager.getPublicationInfo(testFile);

      expect(info).toEqual(metadata);
    });

    it("should return null for unpublished file", () => {
      TestHelpers.createTestFile(testFile, "# Test Article\n\nNo metadata here.");

      const info = MetadataManager.getPublicationInfo(testFile);

      expect(info).toBeNull();
    });
  });

  describe("isPublished", () => {
    it("should return true for published file", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const content = "# Test Article\n\nThis is test content.";
      TestHelpers.createTestFile(testFile, content, metadata);

      const result = MetadataManager.isPublished(testFile);

      expect(result).toBe(true);
    });

    it("should return false for unpublished file", () => {
      TestHelpers.createTestFile(testFile, "# Test Article\n\nNo metadata here.");

      const result = MetadataManager.isPublished(testFile);

      expect(result).toBe(false);
    });
  });

  describe("createMetadata", () => {
    it("should create metadata object", () => {
      const url = "https://telegra.ph/Test-Article-01-01";
      const path = "Test-Article-01-01";
      const username = "Test Author";
      const filePath = "/path/to/test.md";
      const title = "Test Article";
      const description = "Test description";

      const metadata = MetadataManager.createMetadata(url, path, username, filePath, title, description);

      expect(metadata.telegraphUrl).toBe(url);
      expect(metadata.editPath).toBe(path);
      expect(metadata.username).toBe(username);
      expect(metadata.originalFilename).toBe("test.md");
      expect(metadata.title).toBe(title);
      expect(metadata.description).toBe(description);
      expect(metadata.publishedAt).toBeDefined();
      expect(new Date(metadata.publishedAt)).toBeInstanceOf(Date);
    });

    it("should create metadata object without optional fields", () => {
      const url = "https://telegra.ph/Test-Article-01-01";
      const path = "Test-Article-01-01";
      const username = "Test Author";
      const filePath = "/path/to/test.md";

      const metadata = MetadataManager.createMetadata(url, path, username, filePath);

      expect(metadata.telegraphUrl).toBe(url);
      expect(metadata.editPath).toBe(path);
      expect(metadata.username).toBe(username);
      expect(metadata.originalFilename).toBe("test.md");
      expect(metadata.title).toBeUndefined();
      expect(metadata.description).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty content", () => {
      const metadata = MetadataManager.parseMetadata("");
      expect(metadata).toBeNull();
    });

    it("should handle content with only front-matter", () => {
      const metadata = TestHelpers.createSampleMetadata();
      const yamlOnly = TestHelpers.createYamlFrontMatter(metadata);

      const parsedMetadata = MetadataManager.parseMetadata(yamlOnly);
      expect(parsedMetadata).toEqual(metadata);

      const contentWithoutMetadata = MetadataManager.removeMetadata(yamlOnly);
      expect(contentWithoutMetadata.trim()).toBe("");
    });

    it("should handle very large metadata objects", () => {
      const largeMetadata = TestHelpers.createSampleMetadata({
        description: "A".repeat(10000), // Very long description
        title: "B".repeat(1000)
      });

      const content = "# Test Article\n\nContent here.";
      const result = MetadataManager.injectMetadata(content, largeMetadata);

      expect(result).toContain(largeMetadata.description);
      expect(result).toContain(largeMetadata.title);
    });

    it("should handle content with multiple front-matter delimiters", () => {
      const content = `---
telegraphUrl: "https://telegra.ph/Test-01-01"
editPath: "Test-01-01"
username: "Test Author"
publishedAt: "${new Date().toISOString()}"
originalFilename: "test.md"
---

# Test Article

Some content with --- in the middle

More content`;

      const metadata = MetadataManager.parseMetadata(content);
      expect(metadata).toBeDefined();
      expect(metadata?.telegraphUrl).toBe("https://telegra.ph/Test-01-01");

      const cleanContent = MetadataManager.removeMetadata(content);
      expect(cleanContent).toContain("# Test Article");
      expect(cleanContent).toContain("Some content with --- in the middle");
    });
  });
});