# Implementation Plan - Fix Link Anchor Replacement

**Task ID:** TASK-018
**Phase:** PLAN
**Date:** 2025-08-03_22-31
**Status:** 🟡 In Progress

## Progress Overview
- Total Items: 12
- Completed: 12
- In Progress: 0
- Blocked: 0
- Not Started: 0

## 1. Core Implementation ✅ Completed
   ### 1.1 Analyze Current Implementation ✅ Completed
      #### 1.1.1 Review ContentProcessor.replaceLinksInContent method ✅ Completed
      #### 1.1.2 Understand link object structure (originalPath vs resolvedPath) ✅ Completed
      #### 1.1.3 Map current replacement logic flow ✅ Completed

   ### 1.2 Implement Anchor Preservation Logic ✅ Completed
      #### 1.2.1 Add anchor detection logic in replaceLinksInContent loop ✅ Completed
         - Check for '#' symbol in `link.originalPath` using `indexOf('#')`
         - Extract anchor substring from found position to end
         - Handle edge case where no anchor exists (indexOf returns -1)
      #### 1.2.2 Modify Telegraph URL construction ✅ Completed
         - Create finalUrl variable starting with base telegraphUrl
         - Append extracted anchor to finalUrl if anchor exists
         - Use finalUrl in both replacementMap and link.telegraphUrl assignment
      #### 1.2.3 Update replacementMap and link object assignments ✅ Completed
         - Replace `replacementMap.set(link.originalPath, telegraphUrl)` with finalUrl
         - Replace `link.telegraphUrl = telegraphUrl` with finalUrl

## 2. Comprehensive Testing Strategy 🔴 Not Started
   ### 2.1 Standard Anchor Scenarios 🔴 Not Started
      #### 2.1.1 Basic anchor preservation test 🔴 Not Started
         - Input: `[Link](./page.md#section-one)`
         - linkMappings: `Map([['/path/to/page.md', 'https://telegra.ph/page-one']])`
         - Expected: `[Link](https://telegra.ph/page-one#section-one)`
      #### 2.1.2 Multiple links with anchors test 🔴 Not Started
         - Test content with multiple anchor links
         - Verify each anchor is preserved correctly
      #### 2.1.3 Mixed anchor and non-anchor links test 🔴 Not Started
         - Content with both `./page.md#anchor` and `./page.md`
         - Verify anchor links get anchors, non-anchor links don't

   ### 2.2 Unicode and Special Character Scenarios 🔴 Not Started
      #### 2.2.1 Cyrillic anchor test 🔴 Not Started
         - Input: `[Ссылка](./page.md#раздел-один)`
         - Expected: `[Ссылка](https://telegra.ph/page-one#раздел-один)`
      #### 2.2.2 Special characters in anchors test 🔴 Not Started
         - Test anchors with spaces, hyphens, underscores
         - Verify URL encoding behavior if needed

   ### 2.3 Edge Case Scenarios 🔴 Not Started
      #### 2.3.1 Empty anchor test 🔴 Not Started
         - Input: `[Link](./page.md#)`
         - Expected behavior: append empty anchor or treat as no anchor
      #### 2.3.2 Multiple hash symbols test 🔴 Not Started
         - Input: `[Link](./page.md#section#subsection)`
         - Expected: preserve everything after first hash
      #### 2.3.3 Unpublished files with anchors test 🔴 Not Started
         - Links to files not in linkMappings
         - Verify anchors remain in original links

   ### 2.4 Regression Prevention 🔴 Not Started
      #### 2.4.1 Existing functionality validation 🔴 Not Started
         - Run all existing ContentProcessor tests
         - Verify no functionality breaks
      #### 2.4.2 Performance validation 🔴 Not Started
         - Measure impact of anchor detection logic
         - Ensure minimal performance overhead

## 3. Test Implementation 🔴 Not Started
   ### 3.1 Create Test Helper Functions 🔴 Not Started
      #### 3.1.1 Helper for creating content with anchor links 🔴 Not Started
      #### 3.1.2 Helper for creating Telegraph URL mappings 🔴 Not Started
      #### 3.1.3 Helper for validating anchor preservation 🔴 Not Started

   ### 3.2 Implement Test Cases 🔴 Not Started
      #### 3.2.1 Add standard anchor tests to ContentProcessor.test.ts 🔴 Not Started
      #### 3.2.2 Add Unicode/special character tests 🔴 Not Started
      #### 3.2.3 Add edge case tests 🔴 Not Started

   ### 3.3 Test Coverage Validation 🔴 Not Started
      #### 3.3.1 Run coverage analysis 🔴 Not Started
      #### 3.3.2 Ensure 85% minimum coverage for modified code 🔴 Not Started
      #### 3.3.3 Validate all test scenarios pass 🔴 Not Started

## 4. Quality Assurance and Validation 🔴 Not Started
   ### 4.1 Code Quality Validation 🔴 Not Started
      #### 4.1.1 Verify code follows project conventions 🔴 Not Started
      #### 4.1.2 Check TypeScript typing correctness 🔴 Not Started
      #### 4.1.3 Validate error handling for edge cases 🔴 Not Started

   ### 4.2 Integration Testing 🔴 Not Started
      #### 4.2.1 Test with actual Telegraph publishing workflow 🔴 Not Started
      #### 4.2.2 Validate with user's provided evidence files 🔴 Not Started
      #### 4.2.3 Test with complex content containing multiple anchor types 🔴 Not Started

   ### 4.3 User Acceptance Criteria Validation 🔴 Not Started
      #### 4.3.1 Verify anchor preservation works correctly 🔴 Not Started
      #### 4.3.2 Confirm backward compatibility maintained 🔴 Not Started
      #### 4.3.3 Validate Unicode character support 🔴 Not Started
      #### 4.3.4 Test all edge cases handle gracefully 🔴 Not Started

## Technical Implementation Details

### Code Changes Required

**File:** `src/content/ContentProcessor.ts`
**Method:** `replaceLinksInContent` (lines 156-164)

**Current Code:**
```typescript
for (const link of processedContent.localLinks) {
  const telegraphUrl = linkMappings.get(link.resolvedPath);
  if (telegraphUrl) {
    replacementMap.set(link.originalPath, telegraphUrl);
    link.telegraphUrl = telegraphUrl;
    link.isPublished = true;
  }
}
```

**Updated Code:**
```typescript
for (const link of processedContent.localLinks) {
  const telegraphUrl = linkMappings.get(link.resolvedPath);
  if (telegraphUrl) {
    // Check for and preserve the URL fragment (anchor)
    const anchorIndex = link.originalPath.indexOf('#');
    let finalUrl = telegraphUrl;

    if (anchorIndex !== -1) {
      const anchor = link.originalPath.substring(anchorIndex);
      finalUrl += anchor;
    }

    // Use the final URL (with anchor) for replacement
    replacementMap.set(link.originalPath, finalUrl);
    link.telegraphUrl = finalUrl;
    link.isPublished = true;
  }
}
```

### Test Structure Template

```typescript
describe("anchor preservation in replaceLinksInContent", () => {
  it("should preserve anchors when replacing local links", () => {
    // Test implementation
  });

  it("should handle Cyrillic characters in anchors", () => {
    // Test implementation
  });

  it("should handle edge cases with empty anchors", () => {
    // Test implementation
  });
});
```

## Success Metrics
- All anchor-containing links in published content retain their anchors
- No regression in existing link replacement functionality
- 100% test pass rate with 85% minimum coverage
- User validation confirms in-page navigation works correctly

## Agreement Compliance Log
- [2025-08-03_22-31]: Plan created following user specifications - ✅ Compliant
- [2025-08-03_22-31]: Implementation approach aligns with VAN analysis - ✅ Compliant
- [2025-08-03_22-31]: Test strategy covers all user requirements - ✅ Compliant