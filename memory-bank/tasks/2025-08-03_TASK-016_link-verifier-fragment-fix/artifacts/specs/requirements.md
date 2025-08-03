# Technical Specification: Correct Handling of Local Links with URL Fragments (Anchors)

**Task ID:** `FIX-LINK-VERIFIER-001`
**Date:** `2025-08-03`
**Author:** `External Agent (Technical Specs)`
**Status:** `Ready for Implementation`

## 1. Problem Statement

The link verification module incorrectly identifies valid local links containing URL fragments (e.g., `./page.md#section-one`) as "broken." This prevents the publication of files that rely on in-document navigation and offers incorrect auto-repair suggestions that remove the fragment, breaking the link's intended functionality.

## 2. Root Cause Analysis

The issue originates in the `verifyLinks` method of the `LinkVerifier` class (`src/links/LinkVerifier.ts`). The current implementation takes the full `link.href` string, including the fragment, and attempts to resolve it as a file path on the disk.

The Node.js `fs.existsSync` function is then called on this resolved path. Since a file named `page.md#section-one` does not exist on the file system, the check fails, and the link is incorrectly flagged as broken.

**Problematic Code Logic:**
```typescript
// in src/links/LinkVerifier.ts -> verifyLinks method

for (const link of scanResult.localLinks) {
  try {
    // Here, link.href contains the fragment (e.g., "./file.md#anchor")
    const resolvedPath = this.resolveLinkPath(link.href, scanResult.filePath);

    // existsSync fails because the path includes the fragment
    if (!existsSync(resolvedPath)) {
      brokenLinks.push({ /* ... */ });
    }
  } catch (error) {
    // ...
  }
}
```

## 3. Proposed Solution

The logic must be updated to separate the file path from the URL fragment *before* checking for the file's existence. The verification should only concern itself with the file path part of the href.

## 4. Implementation Details

**File to Modify:** `src/links/LinkVerifier.ts`
**Method to Modify:** `verifyLinks`

The logic inside the `for` loop of the `verifyLinks` method needs to be adjusted.

**A. Strip the Fragment from the Href**

Before resolving the path, split the `link.href` string by the `#` character and take the first part. This will give you the clean file path.

**Code - Before Changes:**
```typescript
// in src/links/LinkVerifier.ts

async verifyLinks(scanResult: FileScanResult): Promise<FileScanResult> {
  const brokenLinks: BrokenLink[] = [];

  for (const link of scanResult.localLinks) {
    try {
      const resolvedPath = this.resolveLinkPath(link.href, scanResult.filePath);

      if (!existsSync(resolvedPath)) {
        brokenLinks.push({
          // ... (broken link details)
        });
      }
    } catch (error) {
      // ... (error handling)
    }
  }
  // ...
}
```

**Code - After Changes:**
```typescript
// in src/links/LinkVerifier.ts

async verifyLinks(scanResult: FileScanResult): Promise<FileScanResult> {
  const brokenLinks: BrokenLink[] = [];

  for (const link of scanResult.localLinks) {
    try {
      // NEW: Strip the fragment from the href before resolving the path
      const pathWithoutFragment = link.href.split('#')[0];

      // NEW: Ensure there's a file path to check (handles hrefs that are only a fragment)
      if (pathWithoutFragment) {
        const resolvedPath = this.resolveLinkPath(pathWithoutFragment, scanResult.filePath);

        if (!existsSync(resolvedPath)) {
          brokenLinks.push({
            filePath: scanResult.filePath,
            link,
            suggestions: [],
            canAutoFix: false
          });
        }
      }
    } catch (error) {
      // The original error handling for unresolvable paths remains valid
      brokenLinks.push({
        filePath: scanResult.filePath,
        link,
        suggestions: [],
        canAutoFix: false
      });
    }
  }

  return {
    ...scanResult,
    brokenLinks
  };
}
```

## 5. Acceptance Criteria

1. A local link with a fragment (e.g., `./class004.structured.md#some-heading`) must be considered **valid** if the file (`class004.structured.md`) exists at the specified path.
2. A local link with a fragment pointing to a non-existent file (e.g., `./non-existent-file.md#some-heading`) must still be correctly identified as **broken**.
3. Standard local links without fragments must continue to be verified correctly.
4. Running `telegraph-publisher publish` or `telegraph-publisher check-links` on the user-provided `index.md` file should complete successfully without reporting any broken links.

## 6. Testing Plan

1. **Add a new unit test** to `src/links/LinkVerifier.test.ts`.
2. **Test Case 1 (Valid link with fragment):**
   - Create `source.md` and `target.md`.
   - In `source.md`, add a link `[link](./target.md#section)`.
   - Run `verifier.verifyLinks` on `source.md`.
   - **Assert:** The `brokenLinks` array must be empty.
3. **Test Case 2 (Invalid link with fragment):**
   - Create `source.md`.
   - In `source.md`, add a link `[link](./non-existent.md#section)`.
   - Run `verifier.verifyLinks` on `source.md`.
   - **Assert:** The `brokenLinks` array must contain one entry for `./non-existent.md#section`.
4. **Regression Test:**
   - Re-run existing tests to ensure that links without fragments are still handled correctly.