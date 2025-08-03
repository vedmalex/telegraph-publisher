# Technical Specification: Fix Link Anchor Replacement

**Task ID:** TASK-018
**Date:** 2025-08-03
**Priority:** HIGH
**Status:** Ready for Implementation

## Problem Statement

The link replacement mechanism in `ContentProcessor.ts` fails to preserve URL fragments (anchors) when converting local Markdown links to their published Telegraph URLs. This causes links intended for in-page navigation to point only to the top of the page, breaking their functionality.

### Evidence from User Files

**Example from BUG/index.json.md line 113:**
```json
{
  "tag": "a",
  "attrs": {
    "href": "https://telegra.ph/Zanyatie-4-Glava-1-Voprosy-mudrecov-08-02"
  },
  "children": [
    "Вопрос 3: Что наиболее важного для себя Вы видите в стихах 4–5?"
  ]
}
```

**Corresponding original from BUG/index.md line 19:**
```markdown
- [Вопрос 3: Что наиболее важного для себя Вы видите в стихах 4–5?](./class004.structured.md)
```

**Expected behavior:** The link should have included the fragment/anchor from the original link to maintain proper in-page navigation.

## Current Incorrect Behavior
- **Original Link:** `[Go to Section](./page.md#section-heading)`
- **Current Incorrect Replacement:** `[Go to Section](https://telegra.ph/page-url)` (anchor lost)
- **Expected Correct Replacement:** `[Go to Section](https://telegra.ph/page-url#section-heading)`

## Root Cause Analysis

The bug is located in the `replaceLinksInContent` method within `src/content/ContentProcessor.ts`. The current implementation:
1. Successfully fetches the base Telegraph URL for a linked file
2. Fails to inspect the `link.originalPath` for a fragment to append to the final URL
3. Results in anchor loss during replacement

## Technical Requirements

### Primary Requirements
1. **Anchor Preservation**: When replacing local links with Telegraph URLs, preserve any URL fragments (anchors) from the original link
2. **Fragment Detection**: Detect presence of `#` symbol in original paths and extract everything after it
3. **URL Construction**: Append extracted fragments to the base Telegraph URL
4. **Backward Compatibility**: Ensure links without anchors continue to work correctly

### Quality Requirements
1. **Test Coverage**: 85% minimum code coverage for modified functionality
2. **Unicode Support**: Handle Cyrillic and other non-ASCII characters in anchors
3. **Regression Prevention**: Ensure existing functionality remains intact

## Acceptance Criteria

1. ✅ A local link with an anchor (e.g., `[link](./file.md#anchor)`) must be correctly replaced with its full published URL, including the anchor (e.g., `[link](https://telegra.ph/file-url#anchor)`)
2. ✅ A local link without an anchor must continue to be replaced correctly with its base published URL (regression check)
3. ✅ Links to unpublished files (with or without anchors) must remain unchanged
4. ✅ The functionality must work correctly for anchors containing non-ASCII characters (e.g., Cyrillic)
5. ✅ All existing tests must continue to pass
6. ✅ New comprehensive test coverage for anchor preservation scenarios

## Testing Requirements

### Test Cases to Implement
1. **Standard Anchor Test**: `[Link](./page.md#section-one)` → `[Link](https://telegra.ph/page-one#section-one)`
2. **No Anchor Test**: `[Link](./page.md)` → `[Link](https://telegra.ph/page-one)`
3. **Cyrillic Anchor Test**: `[Ссылка](./page.md#раздел-один)` → `[Ссылка](https://telegra.ph/page-one#раздел-один)`
4. **Mixed Links Test**: Content with mix of links (with/without anchors, published/unpublished)
5. **Edge Cases**: Empty anchors, multiple hash symbols, special characters

## Implementation Scope

### Files to Modify
- **Primary**: `src/content/ContentProcessor.ts` - `replaceLinksInContent` method
- **Tests**: `src/content/ContentProcessor.test.ts` - Add comprehensive test cases

### Expected Code Changes
- Modify the loop in `replaceLinksInContent` that populates `replacementMap`
- Add logic to detect and extract URL fragments from `link.originalPath`
- Append extracted fragments to Telegraph URLs before setting in replacement map
- Ensure both `replacementMap` and `link.telegraphUrl` use the complete URL with anchor

## Success Metrics
- All anchor-containing links in published content retain their anchors
- No regression in existing link replacement functionality
- 100% test pass rate with 85% minimum coverage
- User validation confirms in-page navigation works correctly