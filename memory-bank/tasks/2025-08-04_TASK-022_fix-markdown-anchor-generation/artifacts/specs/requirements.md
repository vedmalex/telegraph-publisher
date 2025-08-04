# Technical Specification: Fix Markdown Anchor Generation

**ID:** FIX-ANCHOR-GENERATION-001
**Date:** 2025-08-04
**Status:** Ready for Implementation

## Problem Description

The `LinkVerifier` system incorrectly generates anchors (slugs) from headings that contain Markdown formatting. The system includes Markdown syntax symbols (`**`, `*`, `_`, etc.) in the generated anchors, causing mismatches with properly formatted link references and resulting in false positive "broken link" errors.

## Root Cause Analysis

The issue is located in the `getAnchorsForFile` method of the `LinkVerifier` class (`src/links/LinkVerifier.ts`). The current implementation:

1. Extracts heading text using regex `^(#{1,6})\s+(.*)`
2. Captures the entire remaining line content including Markdown formatting
3. Passes the "dirty" text directly to `generateSlug`
4. Results in anchors like `**Bold-Title**` instead of `Bold-Title`

**Current problematic flow:**
```
Heading: "## **Bold Title**"
↓ (regex capture)
headingText: "**Bold Title**"
↓ (generateSlug)
anchor: "**Bold-Title**"
```

**Expected correct flow:**
```
Heading: "## **Bold Title**"
↓ (regex capture)
headingText: "**Bold Title**"
↓ (cleanMarkdownString)
cleanedText: "Bold Title"
↓ (generateSlug)
anchor: "Bold-Title"
```

## Solution Requirements

### 1. Import cleanMarkdownString Function
Add import for the existing `cleanMarkdownString` function from `src/clean_mr.ts`:

```typescript
import { cleanMarkdownString } from '../clean_mr';
```

### 2. Modify getAnchorsForFile Method
Update the anchor generation logic to clean Markdown formatting before slug generation:

**Before:**
```typescript
while ((match = headingRegex.exec(content)) !== null) {
  const headingText = match[2]?.trim();
  if (headingText) {
    anchors.add(this.generateSlug(headingText));
  }
}
```

**After:**
```typescript
while ((match = headingRegex.exec(content)) !== null) {
  const headingText = match[2]?.trim();
  if (headingText) {
    const cleanedText = cleanMarkdownString(headingText);
    anchors.add(this.generateSlug(cleanedText));
  }
}
```

## Test Cases

### Unit Test Requirements
Add test case in `src/links/LinkVerifier.test.ts` to verify:

1. **Bold formatting:** `# **Bold Title**` → anchor: `Bold-Title`
2. **Italic formatting:** `## *Italic Title*` → anchor: `Italic-Title`
3. **Link formatting:** `### [Link Title](url)` → anchor: `Link-Title`
4. **Mixed formatting:** `#### **Bold** and *Italic*` → anchor: `Bold-and-Italic`
5. **Complex formatting:** `##### **Bold _nested_ text**` → anchor: `Bold-nested-text`

### Integration Test
Create test scenario with:
- Target file containing headings with Markdown formatting
- Source file with links using clean anchor references
- Verify `verifyLinks` returns empty `brokenLinks` array

## Acceptance Criteria

1. ✅ All headings with Markdown formatting generate clean anchors
2. ✅ Links to formatted headings validate as correct
3. ✅ No false positive broken link errors for valid formatted heading references
4. ✅ Existing functionality remains unchanged
5. ✅ 85% code coverage maintained
6. ✅ All existing tests continue to pass

## Impact Assessment

**Files Modified:**
- `src/links/LinkVerifier.ts` (primary change)
- `src/links/LinkVerifier.test.ts` (test additions)

**Risk Level:** Low
- Uses existing, tested `cleanMarkdownString` function
- Minimal code change with clear, isolated impact
- No changes to public API or method signatures

## Performance Considerations

- Minimal performance impact: `cleanMarkdownString` adds one additional function call per heading
- Anchor caching mechanism remains intact
- No changes to file I/O or regex operations

## Validation Steps

1. Run existing test suite to ensure no regressions
2. Test with sample files containing various Markdown formatting in headings
3. Verify link verification accuracy improves
4. Confirm no impact on anchor generation for plain text headings