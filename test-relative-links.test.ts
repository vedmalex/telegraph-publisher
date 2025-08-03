import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { PagesCacheManager } from "./src/cache/PagesCacheManager";
import { LinkResolver } from "./src/links/LinkResolver";

describe("Relative Links in Nested Folders", () => {
  const testBaseDir = join(__dirname, "test-nested-links");

  test("should resolve relative links correctly from nested folders", () => {
    // Test file: test-nested-links/section1/page1.md
    const filePath = join(testBaseDir, "section1", "page1.md");
    const content = `
# Page 1 in Section 1

## Links to same directory
- [Page 2 in same section](page2.md)

## Links to parent directory
- [Main Index](../index.md)

## Links to sibling directory
- [Page 1 in Section 2](../section2/page1.md)
- [Page 2 in Section 2](../section2/page2.md)

## Links with complex paths
- [Complex path link](../section2/../section1/page2.md)
`;

    const links = LinkResolver.findLocalLinks(content, filePath);

    console.log("Found links:");
    links.forEach(link => {
      console.log(`  Original: ${link.originalPath}`);
      console.log(`  Resolved: ${link.resolvedPath}`);
      console.log(`  Text: ${link.text}`);
      console.log("---");
    });

    // Verify all links are resolved correctly
    expect(links).toHaveLength(5);

    // Same directory link
    const sameDirLink = links.find(l => l.originalPath === "page2.md");
    expect(sameDirLink?.resolvedPath).toBe(join(testBaseDir, "section1", "page2.md"));

    // Parent directory link
    const parentLink = links.find(l => l.originalPath === "../index.md");
    expect(parentLink?.resolvedPath).toBe(join(testBaseDir, "index.md"));

    // Sibling directory links
    const siblingLink1 = links.find(l => l.originalPath === "../section2/page1.md");
    expect(siblingLink1?.resolvedPath).toBe(join(testBaseDir, "section2", "page1.md"));

    const siblingLink2 = links.find(l => l.originalPath === "../section2/page2.md");
    expect(siblingLink2?.resolvedPath).toBe(join(testBaseDir, "section2", "page2.md"));

    // Complex path link
    const complexLink = links.find(l => l.originalPath === "../section2/../section1/page2.md");
    expect(complexLink?.resolvedPath).toBe(join(testBaseDir, "section1", "page2.md"));
  });

  test("should handle cache mapping with nested folder structures", () => {
    const accessToken = "test-token";
    const baseDir = testBaseDir;

    // Create cache manager for the test directory
    const cacheManager = new PagesCacheManager(baseDir, accessToken);

    // Add some pages to cache with nested paths
    const page1Path = join(baseDir, "section1", "page1.md");
    const page2Path = join(baseDir, "section2", "page1.md");

    cacheManager.addPage({
      telegraphUrl: "https://telegra.ph/page1",
      editPath: "page1",
      title: "Page 1 Title",
      authorName: "Test Author",
      publishedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      views: 0,
      localFilePath: page1Path
    });
    cacheManager.addPage({
      telegraphUrl: "https://telegra.ph/page2",
      editPath: "page2",
      title: "Page 2 Title",
      authorName: "Test Author",
      publishedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      views: 0,
      localFilePath: page2Path
    });

    // Test retrieval by local paths
    const cachedPage1 = cacheManager.getPageByLocalPath(page1Path);
    const cachedPage2 = cacheManager.getPageByLocalPath(page2Path);

    expect(cachedPage1).toBeDefined();
    expect(cachedPage1?.telegraphUrl).toBe("https://telegra.ph/page1");
    expect(cachedPage1?.localFilePath).toBe(page1Path);

    expect(cachedPage2).toBeDefined();
    expect(cachedPage2?.telegraphUrl).toBe("https://telegra.ph/page2");
    expect(cachedPage2?.localFilePath).toBe(page2Path);

    // Test URL lookup
    const url1 = cacheManager.getTelegraphUrl(page1Path);
    const url2 = cacheManager.getTelegraphUrl(page2Path);

    expect(url1).toBe("https://telegra.ph/page1");
    expect(url2).toBe("https://telegra.ph/page2");
  });
});