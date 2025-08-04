# Task Definition - Fix Anchor Generation According to Telegra.ph Rules

**Task ID:** `TASK-024`
**Creation Date:** `2025-08-04_12-00`
**Type:** `Implementation`
**Priority:** `High`
**Status:** `✅ COMPLETED - All phases complete`

## Task Summary

Implement correct anchor generation algorithm based on detailed research findings. Fix `generateSlug` in `LinkVerifier.ts` and anchor generation in `markdownConverter.ts` to match actual Telegra.ph behavior.

## Problem Statement

Current anchor generation mechanisms (`generateSlug` in `LinkVerifier.ts` and `generateTocAside` in `markdownConverter.ts`) don't match Telegra.ph's real behavior, causing false "broken link" errors and creating non-functional table of contents.

## Research Findings

Detailed analysis revealed the exact rules for Telegra.ph anchor generation:
1. **Preserve Markdown:** Formatting symbols (`*`, `_`, `[`, `]`, `(`, `)`) are not removed
2. **Preserve case:** Character case is not changed
3. **Replace spaces:** Only spaces are replaced with hyphens (`-`)
4. **Remove specific symbols:** Only `<` and `>` characters are removed
5. **Preserve other symbols:** All other symbols (Cyrillic, punctuation, special chars) remain unchanged

## Expected Outcome

- Heading `## **Bold Title**` generates anchor `**Bold-Title**`
- Link `[link](./target.md#**Bold-Title**)` passes validation as correct
- TOC generates links with proper anchors and formatted text
- All existing "broken link" errors from research log are resolved

## Acceptance Criteria

1. ✅ `generateSlug` implementation matches Telegra.ph rules exactly
2. ✅ `getAnchorsForFile` uses raw heading text without cleaning
3. ✅ `generateTocAside` uses same anchor generation algorithm
4. ✅ All tests updated to reflect new logic and pass
5. ✅ Research test cases validate correctly

## Dependencies

- Research results from `scripts/research_anchors.ts`
- Technical specification `FIX-ANCHOR-GENERATION-002`

## Estimated Effort

- **Analysis:** ✅ Completed
- **Implementation:** 2-3 hours
- **Testing:** 1 hour
- **Documentation:** 30 minutes

**Total:** ~4 hours