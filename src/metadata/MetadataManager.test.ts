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

describe("resetMetadata", () => {
  it("should preserve only title from existing front-matter", () => {
    const content = `---
title: "Test Article"
telegraphUrl: "https://telegra.ph/test-123"
editPath: "/edit/test-123"
username: "testuser"
publishedAt: "2023-01-01T00:00:00.000Z"
originalFilename: "test.md"
description: "Test description"
---

# Test Content

This is test content.`;

    const result = MetadataManager.resetMetadata(content);
    const expectedResult = `---
title: "Test Article"
---

# Test Content

This is test content.`;

    expect(result).toBe(expectedResult);
  });

  it("should extract title from markdown heading when no front-matter title", () => {
    const content = `---
telegraphUrl: "https://telegra.ph/test-123"
editPath: "/edit/test-123"
username: "testuser"
---

# Extracted Title

This is test content.`;

    const result = MetadataManager.resetMetadata(content);
    const expectedResult = `---
title: "Extracted Title"
---

# Extracted Title

This is test content.`;

    expect(result).toBe(expectedResult);
  });

  it("should extract title from filename when no other title sources", () => {
    const content = `---
telegraphUrl: "https://telegra.ph/test-123"
editPath: "/edit/test-123"
username: "testuser"
---

This is test content without heading.`;

    const result = MetadataManager.resetMetadata(content, "/path/to/my-test-article.md");
    const expectedResult = `---
title: "My Test Article"
---

This is test content without heading.`;

    expect(result).toBe(expectedResult);
  });

  it("should remove all front-matter when no title sources available", () => {
    const content = `---
telegraphUrl: "https://telegra.ph/test-123"
editPath: "/edit/test-123"
username: "testuser"
---

This is test content without heading.`;

    const result = MetadataManager.resetMetadata(content, "/path/to/123.md");
    const expectedResult = `This is test content without heading.`;

    expect(result).toBe(expectedResult);
  });

  it("should handle content without front-matter", () => {
    const content = `# Test Title

This is content without front-matter.`;

    const result = MetadataManager.resetMetadata(content);
    const expectedResult = `---
title: "Test Title"
---

# Test Title

This is content without front-matter.`;

    expect(result).toBe(expectedResult);
  });

  it("should handle empty or minimal content", () => {
    const content = "";
    const result = MetadataManager.resetMetadata(content);
    expect(result).toBe("");
  });

  it("should handle content with only front-matter", () => {
    const content = `---
title: "Only Title"
telegraphUrl: "https://telegra.ph/test-123"
---`;

    const result = MetadataManager.resetMetadata(content);
    const expectedResult = `---
title: "Only Title"
---`;

    expect(result).toBe(expectedResult);
  });

  it("should handle malformed front-matter gracefully", () => {
    const content = `---
title: "Valid Title"
broken: [unclosed array
telegraphUrl: "https://telegra.ph/test-123"
---

# Content Title

Test content.`;

    const result = MetadataManager.resetMetadata(content);

    // Should preserve front-matter title even if other fields are malformed
    const expectedResult = `---
title: "Valid Title"
---

# Content Title

Test content.`;

    expect(result).toBe(expectedResult);
  });

  it("should handle Unicode titles correctly", () => {
    const content = `---
title: "Тест с русскими символами"
telegraphUrl: "https://telegra.ph/test-123"
editPath: "/edit/test-123"
username: "testuser"
---

# Заголовок

Содержание на русском языке.`;

    const result = MetadataManager.resetMetadata(content);
    const expectedResult = `---
title: "Тест с русскими символами"
---

# Заголовок

Содержание на русском языке.`;

    expect(result).toBe(expectedResult);
  });

  it("should handle complex nested metadata", () => {
    const content = `---
title: "Test Article"
metadata:
  complex: true
  nested:
    deep: value
    array: [1, 2, 3]
telegraphUrl: "https://telegra.ph/test-123"
editPath: "/edit/test-123"
custom:
  field: value
---

# Content

Test content.`;

    const result = MetadataManager.resetMetadata(content);
    const expectedResult = `---
title: "Test Article"
---

# Content

Test content.`;

    expect(result).toBe(expectedResult);
  });
});

describe("extractFilenameTitle", () => {
  it("should convert filename to readable title", () => {
    // Access private method through any cast for testing
    const extractFilenameTitle = (MetadataManager as any).extractFilenameTitle;

    expect(extractFilenameTitle("/path/to/my-test-article.md")).toBe("My Test Article");
    expect(extractFilenameTitle("hello-world.md")).toBe("Hello World");
    expect(extractFilenameTitle("simple_file_name.md")).toBe("Simple File Name");
    expect(extractFilenameTitle("mixed-format_test.md")).toBe("Mixed Format Test");
  });

  it("should reject numeric or short filenames", () => {
    const extractFilenameTitle = (MetadataManager as any).extractFilenameTitle;

    expect(extractFilenameTitle("123.md")).toBeNull();
    expect(extractFilenameTitle("a.md")).toBeNull();
    expect(extractFilenameTitle("12.md")).toBeNull();
  });
});

describe("extractMarkdownTitle", () => {
  it("should extract first H1 heading", () => {
    const extractMarkdownTitle = (MetadataManager as any).extractMarkdownTitle;

    const content1 = "# First Heading\n\n## Second Heading\n\nContent";
    expect(extractMarkdownTitle(content1)).toBe("First Heading");

    const content2 = "Some text\n\n# Main Title\n\nMore content";
    expect(extractMarkdownTitle(content2)).toBe("Main Title");
  });

  it("should return null when no H1 heading found", () => {
    const extractMarkdownTitle = (MetadataManager as any).extractMarkdownTitle;

    const content1 = "## Only H2\n\nContent";
    expect(extractMarkdownTitle(content1)).toBeNull();

    const content2 = "No headings here\nJust content";
    expect(extractMarkdownTitle(content2)).toBeNull();
  });

  it("should ignore front-matter when extracting title", () => {
    const extractMarkdownTitle = (MetadataManager as any).extractMarkdownTitle;

    const content = `---
title: "Front-matter title"
---

# Markdown Title

Content`;
    expect(extractMarkdownTitle(content)).toBe("Markdown Title");
  });
});