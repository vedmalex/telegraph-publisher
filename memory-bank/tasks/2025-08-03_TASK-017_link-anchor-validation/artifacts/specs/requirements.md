# Technical Specification: Add Anchor Validation to Link Verifier

**Task ID:** `FEAT-LINK-ANCHOR-VALIDATION-001`
**Date:** `2025-08-03`
**Author:** `External Agent (Technical Specs)`
**Status:** `Ready for Implementation`

## 1. Problem Statement

The link verification module (`LinkVerifier.ts`) does not validate the existence of URL fragments (anchors) in local links. This allows links like `./page.md#non-existent-section` to pass verification as long as `page.md` exists, leading to a poor user experience with broken in-page navigation.

## 2. Proposed Solution

The `LinkVerifier` class will be enhanced to read the content of target Markdown files, parse their headings to generate a list of valid anchors, and validate the fragment part of each link against this list. A caching layer will be introduced to optimize performance by avoiding redundant file parsing.

## 3. Implementation Details

**File to Modify:** `src/links/LinkVerifier.ts`

### A. Add New Private Members to `LinkVerifier` Class

A new private member variable for caching anchors is required.

```typescript
// in src/links/LinkVerifier.ts

export class LinkVerifier {
  private pathResolver: PathResolver;
  // NEW: Add a cache for file anchors to avoid re-reading and re-parsing files.
  private anchorCache: Map<string, Set<string>> = new Map();

  constructor(pathResolver: PathResolver) {
    // ... constructor remains the same
  }

  // ... other methods ...
}
```

### B. Create New Private Helper Methods

Two new helper methods should be added inside the `LinkVerifier` class.

1. **`generateSlug(text: string): string`**: Converts heading text into a URL-friendly slug.
2. **`getAnchorsForFile(filePath: string): Set<string>`**: Reads a file, extracts headings, generates slugs, and caches the result.

```typescript
// in src/links/LinkVerifier.ts

// ... after constructor ...

  /**
   * Generates a URL-friendly slug from a heading text.
   * This mimics the behavior of most Markdown parsers.
   * @param text The heading text.
   * @returns A lower-case, hyphenated slug.
   */
  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/[^\p{L}\p{N}\s-]/gu, '') // Remove special characters except letters, numbers, spaces, and hyphens
      .replace(/\s+/g, '-'); // Replace spaces with hyphens
  }

  /**
   * Extracts all valid anchors (from headings) from a Markdown file.
   * Results are cached to improve performance.
   * @param filePath The absolute path to the Markdown file.
   * @returns A Set containing all valid anchor slugs for the file.
   */
  private getAnchorsForFile(filePath: string): Set<string> {
    if (this.anchorCache.has(filePath)) {
      return this.anchorCache.get(filePath)!;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const headingRegex = /^(#{1,6})\s+(.*)/gm;
      const anchors = new Set<string>();

      let match;
      while ((match = headingRegex.exec(content)) !== null) {
        const headingText = match[2]?.trim();
        if (headingText) {
          anchors.add(this.generateSlug(headingText));
        }
      }

      this.anchorCache.set(filePath, anchors);
      return anchors;
    } catch (error) {
      // If the file can't be read, return an empty set.
      // The file existence check will handle the "broken link" error.
      return new Set<string>();
    }
  }
```

### C. Update the `verifyLinks` Method

The core logic of `verifyLinks` must be modified to include the anchor check.

**Code - Before Changes (Simplified):**
```typescript
// in src/links/LinkVerifier.ts -> verifyLinks method
async verifyLinks(scanResult: FileScanResult): Promise<FileScanResult> {
  const brokenLinks: BrokenLink[] = [];
  for (const link of scanResult.localLinks) {
    try {
      const pathWithoutFragment = link.href.split('#')[0];
      if (pathWithoutFragment) {
        const resolvedPath = this.resolveLinkPath(pathWithoutFragment, scanResult.filePath);
        if (!existsSync(resolvedPath)) {
          brokenLinks.push({ /* ... */ });
        }
      }
    } catch (error) { /* ... */ }
  }
  return { ...scanResult, brokenLinks };
}
```

**Code - After Changes:**
```typescript
// in src/links/LinkVerifier.ts -> verifyLinks method
async verifyLinks(scanResult: FileScanResult): Promise<FileScanResult> {
  const brokenLinks: BrokenLink[] = [];

  for (const link of scanResult.localLinks) {
    try {
      const [pathPart, ...fragmentParts] = link.href.split('#');
      const fragment = fragmentParts.join('#');

      if (pathPart) {
        const resolvedPath = this.resolveLinkPath(pathPart, scanResult.filePath);

        // 1. Verify file existence (existing logic)
        if (!existsSync(resolvedPath)) {
          brokenLinks.push({
            filePath: scanResult.filePath,
            link,
            suggestions: [],
            canAutoFix: false,
          });
          continue; // Don't check anchor if file is missing
        }

        // 2. NEW: Verify anchor existence if a fragment is present
        if (fragment) {
          const targetAnchors = this.getAnchorsForFile(resolvedPath);
          // Decode URI component for non-latin characters and slugify it for comparison
          const requestedAnchor = this.generateSlug(decodeURIComponent(fragment));

          if (!targetAnchors.has(requestedAnchor)) {
            brokenLinks.push({
              filePath: scanResult.filePath,
              link,
              suggestions: [], // Suggestions for anchors are out of scope for now
              canAutoFix: false,
            });
          }
        }
      }
    } catch (error) {
      brokenLinks.push({ /* ... error handling ... */ });
    }
  }

  return { ...scanResult, brokenLinks };
}
```

## 4. Acceptance Criteria

1. A link like `./page.md#valid-section` must be considered **VALID** if `page.md` exists and contains a heading (e.g., `## Valid Section`).
2. A link like `./page.md#invalid-section` must be marked as **BROKEN** if `page.md` exists but does not contain a heading that slugs to `invalid-section`.
3. A link like `./page.md` (with no anchor) must still be considered **VALID** if the file exists.
4. The anchor validation must be case-insensitive and handle spaces/special characters correctly by converting both the link's fragment and the file's headings to a consistent slug format.
5. The validation must correctly handle Unicode, including Cyrillic characters, in both links and headings (e.g., `./file.md#вопросы-мудрецов`).

## 5. Testing Plan

The test suite in `src/links/LinkVerifier.test.ts` must be expanded with the following cases:

1. **Create a new test file** (`target-with-anchors.md`) containing various headings:
   * `# Simple Heading`
   * `## Heading With Spaces`
   * `### Заголовок на кириллице`

2. **Test Case 1 (Valid Anchor):**
   * Create a link `[link](./target-with-anchors.md#simple-heading)`.
   * **Assert:** The link is NOT marked as broken.

3. **Test Case 2 (Valid Anchor with Spaces):**
   * Create a link `[link](./target-with-anchors.md#heading-with-spaces)`.
   * **Assert:** The link is NOT marked as broken.

4. **Test Case 3 (Valid Cyrillic Anchor):**
   * Create a link `[link](./target-with-anchors.md#заголовок-на-кириллице)`.
   * **Assert:** The link is NOT marked as broken.

5. **Test Case 4 (Invalid Anchor):**
   * Create a link `[link](./target-with-anchors.md#this-does-not-exist)`.
   * **Assert:** The link IS marked as broken.

6. **Regression Test:**
   * Ensure that a link to a valid file *without* an anchor (`./target-with-anchors.md`) is still considered valid.
   * Ensure that a link to a non-existent file (`./no-file.md#some-anchor`) is still marked as broken.

## 6. Performance Considerations

- Implement file content caching to avoid re-reading and re-parsing files
- Use efficient regex patterns for heading extraction
- Consider lazy loading of anchor caches only when needed
- Handle large files gracefully without memory issues

## 7. Error Handling

- Gracefully handle files that cannot be read
- Handle malformed URLs and fragments
- Properly decode URI components for international characters
- Log appropriate error messages for debugging

## 8. Additional Requirements

- Maintain backward compatibility with existing functionality
- Ensure thread safety for concurrent operations
- Add appropriate TypeScript type definitions
- Follow existing code style and patterns in the project