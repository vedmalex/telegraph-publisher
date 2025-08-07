# Task Definition: Link Parsing and Metadata Preservation Fix

**Task ID:** 2025-08-07_TASK-010_link-parsing-metadata-preservation-fix
**Created:** 2025-08-07_15-58
**Status:** 🔴 Not Started
**Priority:** High
**Complexity:** Medium

## Description

Fix two critical issues in the `telegraph-publisher` utility:

1. **Incorrect Markdown link parsing** that captures extra text and creates malformed Telegraph nodes
2. **Unintended deletion of dependency metadata** (`publishedDependencies`) from front-matter when publishing with `--no-with-dependencies` flag

## Objectives

### Part 1: Markdown Link Parsing Correction
- Fix greedy regex pattern in `src/markdownConverter.ts` that incorrectly captures text following closing link brackets
- Replace current regex with robust pattern from `src/links/LinkScanner.ts` for consistency
- Ensure precise boundary detection for link text and href

### Part 2: Preserve publishedDependencies Metadata
- Modify `src/publisher/EnhancedTelegraphPublisher.ts` to preserve existing `publishedDependencies` when `--no-with-dependencies` is used
- Update both `publishWithMetadata()` and `editWithMetadata()` functions
- Ensure metadata is only updated when dependency processing is enabled

## Success Criteria

### Link Parsing Fix
- Links in Markdown (including examples from `02.md`) parse correctly without capturing extra text
- Link text and href are determined precisely
- All existing tests pass, especially `markdownConverter.parentheses-bug.test.ts` and `LinkScanner.regex-fix.test.ts`

### Metadata Preservation Fix
- Running `publish --no-with-dependencies` on files with existing `publishedDependencies` preserves the field unchanged
- Running `publish --with-dependencies` correctly updates `publishedDependencies` with new data
- Behavior is identical for both new publications (`publishWithMetadata`) and existing edits (`editWithMetadata`)

## Testing Requirements

1. **Unit Test for Link Parser:**
   - Create `src/markdownConverter.link-parsing.test.ts`
   - Test content from `02.md` produces correct `TelegraphNode` structure
   - Verify proper `children` and `href` without extra text capture

2. **Integration Test for Metadata Preservation:**
   - Create `src/integration/metadata-preservation.integration.test.ts`
   - Test scenario 1: `withDependencies: false` preserves existing `publishedDependencies`
   - Test scenario 2: `withDependencies: true` correctly updates `publishedDependencies`

3. **Regression Testing:**
   - 100% test success rate
   - Minimum 85% code coverage
   - No existing functionality broken

## Files to Modify

### Primary Files
- `src/markdownConverter.ts` - Fix link parsing regex
- `src/publisher/EnhancedTelegraphPublisher.ts` - Preserve metadata logic

### Test Files to Create
- `src/markdownConverter.link-parsing.test.ts`
- `src/integration/metadata-preservation.integration.test.ts`

## Technical Details

### Link Parsing Regex Change
```typescript
// Current (problematic):
{ regex: /\[(.*?)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, tag: "a", isLink: true }

// Fixed (from LinkScanner.ts):
{ regex: /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, tag: "a", isLink: true }
```

### Metadata Preservation Logic
- Save original `publishedDependencies` from `existingMetadata`
- Use original dependencies when `withDependencies = false`
- Use new dependencies when `withDependencies = true`
- Apply same logic to both `publishWithMetadata` and `editWithMetadata`

## Dependencies
- Requires understanding of existing Markdown conversion logic
- Needs access to Telegraph publisher metadata management
- Must maintain compatibility with existing dependency resolution system

## Estimated Effort
- Analysis: 1 hour
- Implementation: 3-4 hours  
- Testing: 2-3 hours
- Total: 6-8 hours
