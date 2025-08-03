# Enhanced Anchor Validation and Reporting - Requirements

## Problem Statement
When `LinkVerifier` finds a broken link with an anchor (e.g., `./page.md#invalid-section`), it simply reports the file as non-existent. The user gets no information about what anchors *are* available, making debugging difficult.

## Root Cause Analysis
The current `LinkVerifier` checks for file existence and anchor existence separately but does not provide context-aware feedback. It lacks a mechanism to find the "closest" valid anchor if the requested one is not found.

## Functional Requirements

### REQ-001: Anchor Extraction and Slug Generation
- The `LinkVerifier` must be able to read the content of a target file and generate a list of all valid anchor "slugs" from its Markdown headings
- The slug generation must be consistent with how Telegra.ph and common Markdown parsers create anchors (lowercase, hyphenated, special characters removed)
- Implementation must follow standard, robust algorithm as Telegra.ph API doc (`src/doc/api.md`) defines `h3` and `h4` tags but does not specify slug generation

### REQ-002: Efficient Caching Mechanism
- An efficient caching mechanism must be implemented in `LinkVerifier` to store the anchors for each file
- Cache must prevent redundant file reads and parsing during single verification run
- Cache should be cleared appropriately between verification sessions

### REQ-003: String Similarity Algorithm
- When a requested anchor is not found, the system should use a string similarity algorithm to find the closest matching valid anchor
- Minimum similarity threshold should be 0.7 to ensure quality suggestions
- Present closest match as a suggestion in the broken link report

### REQ-004: Enhanced Error Reporting
- Broken anchor links must include suggestions array with full path and corrected anchor
- Console output must clearly state the invalid anchor and the suggested valid anchor
- Error messages must be user-friendly and actionable

## Technical Requirements

### TECH-001: Method Implementation
- Add private helper method `calculateSimilarity(s1: string, s2: string): number`
- Add private helper method `findClosestAnchor(requestedAnchor: string, availableAnchors: Set<string>): string | null`
- Enhance `verifyLinks` method to incorporate new anchor validation logic

### TECH-002: Performance Requirements
- Anchor extraction and caching must not significantly impact verification performance
- String similarity calculations must be efficient for large sets of anchors
- File reading should be optimized to prevent redundant I/O operations

### TECH-003: Integration Requirements
- New functionality must integrate seamlessly with existing LinkVerifier workflow
- Existing BrokenLink interface may need enhancement to support suggestions
- Console output formatting must be consistent with existing error reporting

## Acceptance Criteria

1. **Anchor Detection**: When a link like `./page.md#invalid-sektion` is processed and the target file contains `## Valid Section`, the verifier should identify the link as broken
2. **Suggestion Generation**: The `suggestions` array for the broken link should contain `./page.md#valid-section`
3. **User Feedback**: The console output from `check-links` or `publish` should clearly state the invalid anchor and the suggested valid anchor
4. **Performance**: The anchor cache must be utilized to prevent re-reading the same file multiple times during a single verification run
5. **Test Coverage**: Implementation must achieve 85% minimum test coverage
6. **Test Success**: All tests must pass with 100% success rate

## Dependencies
- Existing `LinkVerifier` infrastructure
- Markdown parsing capabilities
- File system access for content reading
- Console output formatting systems

## Success Metrics
- Reduced user confusion when dealing with broken anchor links
- Improved debugging efficiency through intelligent suggestions
- Maintained or improved verification performance through caching
- High user satisfaction with enhanced error reporting