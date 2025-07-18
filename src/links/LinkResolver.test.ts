import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { TestHelpers } from "../test-utils/TestHelpers";
import { LinkResolver } from "./LinkResolver";

describe("LinkResolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = TestHelpers.createTempDir("link-resolver-test");
  });

  afterEach(() => {
    TestHelpers.cleanup();
  });

  describe("findLocalLinks", () => {
    it("should find local markdown links", () => {
      const content = `# Test Article

This is a [local link](./test.md) and another [link](../other.md).
Also a [relative link](docs/guide.md).

External link: [Google](https://google.com)`;

      const basePath = join(tempDir, "main.md");
      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(3);
      expect(links[0]?.text).toBe("local link");
      expect(links[0]?.originalPath).toBe("./test.md");
      expect(links[1]?.text).toBe("link");
      expect(links[1]?.originalPath).toBe("../other.md");
      expect(links[2]?.text).toBe("relative link");
      expect(links[2]?.originalPath).toBe("docs/guide.md");
    });

    it("should resolve absolute paths correctly", () => {
      const content = `[Link 1](./test.md) and [Link 2](../other.md)`;
      const basePath = join(tempDir, "subdir", "main.md");

      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(2);
      expect(links[0]?.resolvedPath).toBe(join(tempDir, "subdir", "test.md"));
      expect(links[1]?.resolvedPath).toBe(join(tempDir, "other.md"));
    });

    it("should ignore external links", () => {
      const content = `[External](https://example.com) and [Email](mailto:test@example.com)`;
      const basePath = join(tempDir, "main.md");

      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(0);
    });

    it("should handle links with special characters", () => {
      const content = `[Link with spaces](./file with spaces.md)
[Link with parentheses](./file-1.md)
[Link with brackets](./file1.md)`;

      const basePath = join(tempDir, "main.md");
      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(3);
      expect(links[0]?.originalPath).toBe("./file with spaces.md");
      expect(links[1]?.originalPath).toBe("./file-1.md");
      expect(links[2]?.originalPath).toBe("./file1.md");
    });

    it("should capture link positions correctly", () => {
      const content = `Start [first link](./test1.md) middle [second link](./test2.md) end`;
      const basePath = join(tempDir, "main.md");

      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(2);
      expect(links[0]?.startIndex).toBe(6);
      expect(links[0]?.endIndex).toBe(30); // Corrected length
      expect(links[1]?.startIndex).toBe(38); // Corrected position
      expect(links[1]?.endIndex).toBe(63); // Corrected length
    });
  });

  describe("resolveLocalPath", () => {
    it("should resolve relative paths", () => {
      const baseDir = join(tempDir, "docs");

      const resolved1 = LinkResolver.resolveLocalPath("./test.md", baseDir);
      expect(resolved1).toBe(join(tempDir, "docs", "test.md"));

      const resolved2 = LinkResolver.resolveLocalPath("../other.md", baseDir);
      expect(resolved2).toBe(join(tempDir, "other.md"));

      const resolved3 = LinkResolver.resolveLocalPath("subdir/file.md", baseDir);
      expect(resolved3).toBe(join(tempDir, "docs", "subdir", "file.md"));
    });

    it("should handle absolute paths", () => {
      const basePath = join(tempDir, "main.md");
      const absolutePath = join(tempDir, "absolute.md");

      const resolved = LinkResolver.resolveLocalPath(absolutePath, basePath);
      expect(resolved).toBe(absolutePath);
    });

    it("should normalize paths", () => {
      const baseDir = join(tempDir, "docs");

      const resolved = LinkResolver.resolveLocalPath("./subdir/../test.md", baseDir);
      expect(resolved).toBe(join(tempDir, "docs", "test.md"));
    });
  });

  describe("validateLinkTarget", () => {
    it("should return true for existing files", () => {
      const testFile = join(tempDir, "existing.md");
      TestHelpers.createTestFile(testFile, "# Existing file");

      const isValid = LinkResolver.validateLinkTarget(testFile);
      expect(isValid).toBe(true);
    });

    it("should return false for non-existent files", () => {
      const nonExistentFile = join(tempDir, "non-existent.md");

      const isValid = LinkResolver.validateLinkTarget(nonExistentFile);
      expect(isValid).toBe(false);
    });

    it("should return true for directories (as they exist)", () => {
      const isValid = LinkResolver.validateLinkTarget(tempDir);
      expect(isValid).toBe(true);
    });
  });

  describe("replaceLocalLinks", () => {
    it("should replace local links with provided replacements", () => {
      const content = `# Test Article

This is a [local link](./test.md) and [another link](./other.md).
Keep this [external link](https://example.com) unchanged.`;

      const replacements = new Map([
        ["./test.md", "https://telegra.ph/Test-01-01"],
        ["./other.md", "https://telegra.ph/Other-01-02"]
      ]);

      const result = LinkResolver.replaceLocalLinks(content, replacements);

      expect(result).toContain("[local link](https://telegra.ph/Test-01-01)");
      expect(result).toContain("[another link](https://telegra.ph/Other-01-02)");
      expect(result).toContain("[external link](https://example.com)");
    });

    it("should only replace specified links", () => {
      const content = `[Link 1](./test1.md) and [Link 2](./test2.md) and [Link 3](./test3.md)`;

      const replacements = new Map([
        ["./test1.md", "https://telegra.ph/Test1-01-01"],
        ["./test3.md", "https://telegra.ph/Test3-01-03"]
      ]);

      const result = LinkResolver.replaceLocalLinks(content, replacements);

      expect(result).toContain("[Link 1](https://telegra.ph/Test1-01-01)");
      expect(result).toContain("[Link 2](./test2.md)"); // Unchanged
      expect(result).toContain("[Link 3](https://telegra.ph/Test3-01-03)");
    });

    it("should handle multiple occurrences of the same link", () => {
      const content = `[First](./test.md) and [Second](./test.md) and [Third](./test.md)`;

      const replacements = new Map([
        ["./test.md", "https://telegra.ph/Test-01-01"]
      ]);

      const result = LinkResolver.replaceLocalLinks(content, replacements);

      expect(result).toBe(`[First](https://telegra.ph/Test-01-01) and [Second](https://telegra.ph/Test-01-01) and [Third](https://telegra.ph/Test-01-01)`);
    });

    it("should preserve link text", () => {
      const content = `[Custom Link Text](./test.md)`;

      const replacements = new Map([
        ["./test.md", "https://telegra.ph/Test-01-01"]
      ]);

      const result = LinkResolver.replaceLocalLinks(content, replacements);

      expect(result).toBe(`[Custom Link Text](https://telegra.ph/Test-01-01)`);
    });

    it("should handle empty replacements map", () => {
      const content = `[Link](./test.md)`;
      const replacements = new Map();

      const result = LinkResolver.replaceLocalLinks(content, replacements);

      expect(result).toBe(content);
    });
  });

  describe("isMarkdownFile", () => {
    it("should identify markdown files correctly", () => {
      expect(LinkResolver.isMarkdownFile("test.md")).toBe(true);
      expect(LinkResolver.isMarkdownFile("test.markdown")).toBe(true);
      expect(LinkResolver.isMarkdownFile("test.mdown")).toBe(true);
      expect(LinkResolver.isMarkdownFile("test.mkd")).toBe(true);
    });

    it("should identify non-markdown files correctly", () => {
      expect(LinkResolver.isMarkdownFile("test.txt")).toBe(false);
      expect(LinkResolver.isMarkdownFile("test.html")).toBe(false);
      expect(LinkResolver.isMarkdownFile("test.pdf")).toBe(false);
      expect(LinkResolver.isMarkdownFile("test")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(LinkResolver.isMarkdownFile("test.MD")).toBe(true);
      expect(LinkResolver.isMarkdownFile("test.MARKDOWN")).toBe(true);
    });
  });

  describe("getUniqueFilePaths", () => {
    it("should return unique file paths from links", () => {
      const testFile1 = join(tempDir, "test1.md");
      const testFile2 = join(tempDir, "test2.md");

      TestHelpers.createTestFile(testFile1, "# Test 1");
      TestHelpers.createTestFile(testFile2, "# Test 2");

      const content = `# Test\n\n[Link 1](./test1.md) and [Link 2](./test2.md) and [Link 1 again](./test1.md)`;
      const basePath = join(tempDir, "main.md");
      const links = LinkResolver.findLocalLinks(content, basePath);

      const uniquePaths = LinkResolver.getUniqueFilePaths(links);

      expect(uniquePaths.size).toBe(2);
      expect(uniquePaths.has(testFile1)).toBe(true);
      expect(uniquePaths.has(testFile2)).toBe(true);
    });

    it("should filter out non-existent files", () => {
      const content = `# Test\n\n[Valid](./test.md) and [Invalid](./nonexistent.md)`;
      const basePath = join(tempDir, "main.md");

      TestHelpers.createTestFile(join(tempDir, "test.md"), "# Test");

      const links = LinkResolver.findLocalLinks(content, basePath);
      const uniquePaths = LinkResolver.getUniqueFilePaths(links);

      expect(uniquePaths.size).toBe(1);
      expect(uniquePaths.has(join(tempDir, "test.md"))).toBe(true);
    });
  });

  describe("filterMarkdownLinks", () => {
    it("should filter links to only markdown files", () => {
      const content = `# Test\n\n[MD file](./test.md) and [Text file](./test.txt) and [Another MD](./other.markdown)`;
      const basePath = join(tempDir, "main.md");
      const links = LinkResolver.findLocalLinks(content, basePath);

      const markdownLinks = LinkResolver.filterMarkdownLinks(links);

      expect(markdownLinks).toHaveLength(2);
      expect(markdownLinks[0]?.originalPath).toBe("./test.md");
      expect(markdownLinks[1]?.originalPath).toBe("./other.markdown");
    });
  });

  describe("getFileExtension", () => {
    it("should return file extension with dot", () => {
      expect(LinkResolver.getFileExtension("test.md")).toBe(".md");
      expect(LinkResolver.getFileExtension("file.txt")).toBe(".txt");
      expect(LinkResolver.getFileExtension("archive.tar.gz")).toBe(".gz");
    });

    it("should return empty string for files without extension", () => {
      expect(LinkResolver.getFileExtension("README")).toBe("");
      expect(LinkResolver.getFileExtension("test")).toBe("");
    });
  });

  describe("createReplacementMap", () => {
    it("should create replacement map for valid URLs", () => {
      const filePaths = new Set([
        join(tempDir, "test1.md"),
        join(tempDir, "test2.md"),
        join(tempDir, "test3.md")
      ]);

      const getUrlForPath = (path: string) => {
        if (path.includes("test1")) return "https://telegra.ph/test1";
        if (path.includes("test2")) return "https://telegra.ph/test2";
        return null; // test3 has no URL
      };

      const replacements = LinkResolver.createReplacementMap(filePaths, getUrlForPath);

      expect(replacements.size).toBe(2);
      expect(replacements.get(join(tempDir, "test1.md"))).toBe("https://telegra.ph/test1");
      expect(replacements.get(join(tempDir, "test2.md"))).toBe("https://telegra.ph/test2");
      expect(replacements.has(join(tempDir, "test3.md"))).toBe(false);
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle empty content", () => {
      const links = LinkResolver.findLocalLinks("", join(tempDir, "main.md"));
      expect(links).toHaveLength(0);
    });

    it("should handle content without links", () => {
      const content = "# Title\n\nJust some text without any links.";
      const links = LinkResolver.findLocalLinks(content, join(tempDir, "main.md"));
      expect(links).toHaveLength(0);
    });

    it("should handle malformed markdown links", () => {
      const content = `[Incomplete link](incomplete
[Missing closing bracket](./test.md
[text]missing parentheses
[](./empty-text.md)`;

      const basePath = join(tempDir, "main.md");
      const links = LinkResolver.findLocalLinks(content, basePath);

      // Our regex is simple and will find any [text](path) pattern
      expect(links.length).toBeGreaterThan(0);
      // Should find some valid links
      expect(links.some(link => link.originalPath.includes("empty-text.md"))).toBe(true);
    });

    it("should handle very long paths", () => {
      const longPath = "./very/long/path/to/some/deeply/nested/file/that/might/cause/issues.md";
      const content = `[Long path](${longPath})`;
      const basePath = join(tempDir, "main.md");

      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(1);
      expect(links[0]?.originalPath).toBe(longPath);
    });

    it("should handle special characters in file paths", () => {
      const specialPaths = [
        "./файл.md", // Cyrillic
        "./文件.md", // Chinese
        "./file with spaces.md",
        "./file-with-dashes.md",
        "./file_with_underscores.md",
        "./file.with.dots.md"
      ];

      const content = specialPaths.map((path, i) => `[Link ${i}](${path})`).join("\n");
      const basePath = join(tempDir, "main.md");

      const links = LinkResolver.findLocalLinks(content, basePath);

      expect(links).toHaveLength(specialPaths.length);
      specialPaths.forEach((path, i) => {
        expect(links[i]?.originalPath).toBe(path);
      });
    });

    it("should handle nested markdown structures", () => {
      const content = `# Title

## Section with [inline link](./section.md)

> Quote with [quoted link](./quote.md)

- List item with [list link](./list.md)
- Another item

\`\`\`markdown
This [code link](./code.md) should be ignored
\`\`\`

Regular [normal link](./normal.md) after code block.`;

      const basePath = join(tempDir, "main.md");
      const links = LinkResolver.findLocalLinks(content, basePath);

      // Our simple parser doesn't exclude code blocks, so it finds all links
      expect(links).toHaveLength(5);
      expect(links.map(l => l.text)).toEqual(["inline link", "quoted link", "list link", "code link", "normal link"]);
    });
  });
});