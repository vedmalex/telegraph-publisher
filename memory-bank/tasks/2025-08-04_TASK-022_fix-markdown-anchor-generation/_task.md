# Task 022: Fix Markdown Anchor Generation

**Task ID:** 2025-08-04_TASK-022_fix-markdown-anchor-generation
**Created:** 2025-08-04_00-54
**Status:** 🟡 Active
**Current Phase:** VAN
**Priority:** High

## Task Description
Fix critical bug in LinkVerifier where anchor generation includes Markdown formatting symbols (**, *, etc.) in generated slugs, causing valid links to be reported as broken.

## Problem Statement
The `getAnchorsForFile` method in `LinkVerifier.ts` extracts heading text with Markdown formatting intact and passes it to `generateSlug`, resulting in anchors that include symbols like `**` and `*`. This causes mismatches with properly formatted link anchors that don't include these symbols.

## Expected Outcome
- Links to headings with Markdown formatting should validate correctly
- Anchor generation should strip all Markdown formatting before slug creation
- All existing tests should continue to pass
- 85% code coverage maintained

## Technical Requirements
- Modify `src/links/LinkVerifier.ts`
- Use existing `cleanMarkdownString` from `src/clean_mr.ts`
- Add comprehensive unit tests
- Update documentation if needed

## Acceptance Criteria
1. Heading `## **Bold Title**` generates anchor `Bold-Title`
2. Link `[link](./file.md#Bold-Title)` validates correctly
3. All broken link false positives are resolved
4. No regression in existing functionality

## Context
This fix addresses user-reported issues where valid internal links are incorrectly flagged as broken due to Markdown formatting in headings.