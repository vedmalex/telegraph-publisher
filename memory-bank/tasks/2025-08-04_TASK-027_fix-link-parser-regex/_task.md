# Task: Fix Link Parser Regex

**Task ID:** 2025-08-04_TASK-027_fix-link-parser-regex
**Created:** 2025-08-04_16-37
**Status:** 🟢 COMPLETED - EXTENDED SCOPE
**Phase:** IMPLEMENT
**Priority:** High

## Problem Statement - EXTENDED SCOPE

**Original Issue (✅ RESOLVED):** The core link extraction mechanism in `LinkScanner.ts` used a regex that failed to parse Markdown links with balanced parentheses in URLs.

**NEW DISCOVERY:** While `LinkScanner.ts` now correctly extracts links, the **Markdown-to-Telegraph conversion process** still incorrectly processes these links during JSON generation. The closing parenthesis `)` is being stripped from the `href` attribute and left as a separate text node in the Telegraph JSON output.

**Evidence of Remaining Issue:**
- **Input:** `[1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)](./аналогии.md#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4))`
- **Expected Telegraph JSON:** `"href": "...#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)"`
- **Actual Telegraph JSON:** `"href": "...#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4"` + separate text node `")"`

## Evidence

- **Input Markdown:** `[Text](./file.md#anchor-(with-parens))`
- **Current Incorrect Parsing:** The link's `href` becomes `./file.md#anchor-(with-parens` (missing the final `)`).
- **Issue:** The closing parenthesis `)` is left behind as a separate, plain text node in the JSON output.

## Root Cause

The bug is located exclusively in the `extractLinks` static method of the `LinkScanner` class (`src/links/LinkScanner.ts`). The regular expression used to find links is too "greedy" and does not account for the possibility of balanced parentheses within the URL part of the link.

## Root Cause Analysis Required

The issue spans multiple components of the Markdown-to-Telegraph conversion pipeline:

1. ✅ **LinkScanner.ts** - Link extraction works correctly (validated by tests)
2. 🔍 **Markdown Converter** - Likely source of Telegraph JSON generation issue
3. 🔍 **Telegraph Publisher** - May have additional link processing

**Investigation Needed:**
- Identify where in the conversion pipeline the parentheses are being stripped
- Determine if the issue is in regex processing, JSON generation, or Telegraph API formatting
- Locate the specific code responsible for converting Markdown links to Telegraph JSON format

**Potential Files to Investigate:**
- `src/markdownConverter.ts` - Main Markdown to Telegraph JSON conversion
- `src/telegraphPublisher.ts` - Telegraph API interaction and formatting
- Any regex patterns used during JSON generation process

## Extended Success Criteria

### Phase 1: Link Extraction (✅ COMPLETED)
1. ✅ LinkScanner correctly extracts links with balanced parentheses
2. ✅ All regex tests pass (29/29)
3. ✅ No regression in existing functionality

### Phase 2: Telegraph JSON Generation (🔍 NEW SCOPE)
1. **Telegraph JSON href completeness:** `"href"` attribute in Telegraph JSON should contain complete URL including all parentheses
2. **No orphaned text nodes:** Telegraph JSON should **not** contain separate text nodes with stray `")"` characters
3. **End-to-end validation:** Complete Markdown-to-Telegraph conversion should preserve parentheses in anchor links
4. **Real user content test:** The provided user content should convert to correct Telegraph JSON format

### Expected Telegraph JSON Output
```json
{
  "tag": "a",
  "attrs": {
    "href": "https://telegra.ph/...#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)"
  },
  "children": ["1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)"]
}
```

**NOT:**
```json
{
  "tag": "a", 
  "attrs": {
    "href": "https://telegra.ph/...#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4"
  },
  "children": ["1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)"]
},
")"
```

## Extended Plan

### Phase 1: Link Extraction (✅ COMPLETED)
1. 🟢 **Completed** - Examine current LinkScanner.ts implementation
2. 🟢 **Completed** - Replace faulty regex with corrected version (Already fixed)
3. 🟢 **Completed** - Create comprehensive test suite (Already exists)
4. 🟢 **Completed** - Run tests to validate fix (12/12 tests pass)
5. 🟢 **Completed** - Verify no regression in existing functionality (17/17 tests pass)

### Phase 2: Telegraph JSON Generation Investigation (✅ COMPLETED)
6. 🟢 **Completed** - Investigate markdownConverter.ts for link processing logic
7. 🟢 **Completed** - Identify where Telegraph JSON href attributes are generated (`processInlineMarkdown` function)
8. 🟢 **Completed** - Locate regex patterns responsible for Telegraph JSON link formatting (line 611: `/\[(.*?)\]\((.*?)\)/g`)
9. 🟢 **Completed** - Create test case with user-provided content to reproduce issue (`markdownConverter.parentheses-bug.test.ts`)
10. 🟢 **Completed** - Fix Telegraph JSON generation to preserve complete href values (regex updated to support balanced parentheses)
11. 🟢 **Completed** - Validate end-to-end Markdown-to-Telegraph conversion (tests confirm fix works)
12. 🟢 **Completed** - Create regression tests for Telegraph JSON generation (both specific bug test and regression test)