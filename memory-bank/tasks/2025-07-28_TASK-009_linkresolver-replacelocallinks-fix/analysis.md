# VAN Analysis - LinkResolver.replaceLocalLinks TypeError Fix

## Vision Analysis

### Problem Statement
The application fails with `TypeError: LinkResolver.replaceLocalLinks is not a function` when attempting to replace local Markdown links with Telegraph URLs during the publication process.

### Error Context
- **Error Location**: `dist/cli.js:4123:68` within `replaceLinksInContent` (from ContentProcessor.ts)
- **Called From**: `ContentProcessor.replaceLinksInContent` method
- **Function Purpose**: Replace local Markdown links (`[text](path)`) in content with their corresponding Telegraph URLs.
- **Previous Context**:
    - TASK-007: `findLocalLinks` method implemented successfully.
    - TASK-008: `filterMarkdownLinks` and `getUniqueFilePaths` methods implemented successfully.
- **Current Issue**: `replaceLocalLinks` method is missing or incorrectly defined.

## Analysis Deep Dive

### Usage in ContentProcessor.ts: Line 188
```typescript
  static replaceLinksInContent(
    processedContent: ProcessedContent,
    linkMappings: Map<string, string>
  ): ProcessedContent {
    // Create mapping from original paths to Telegraph URLs
    const replacementMap = new Map<string, string>();

    for (const link of processedContent.localLinks) {
      const telegraphUrl = linkMappings.get(link.resolvedPath);
      if (telegraphUrl) {
        replacementMap.set(link.originalPath, telegraphUrl);
        // Update link object
        link.telegraphUrl = telegraphUrl;
        link.isPublished = true;
      }
    }

    // Replace links in content
    const contentWithReplacedLinks = LinkResolver.replaceLocalLinks(
      processedContent.contentWithoutMetadata,
      replacementMap
    );

    return {
      ...processedContent,
      contentWithReplacedLinks,
      hasChanges: replacementMap.size > 0
    };
  }
```
**Key Observation**: `ContentProcessor.replaceLinksInContent` constructs a `replacementMap` where the key is `link.originalPath` and the value is `telegraphUrl`. This `replacementMap` is then passed to `LinkResolver.replaceLocalLinks`. Therefore, `replaceLocalLinks` must use the `originalPath` for lookup in the `linkMappings` map, not `resolvedPath`.

### Method Signature Requirements
Based on usage, the `replaceLocalLinks` method should have the following signature:
`static replaceLocalLinks(content: string, linkMappings: Map<string, string>): string`

### Functionality Requirements
1.  **Input**: Takes a string `content` (Markdown content) and a `Map<string, string>` `linkMappings`.
2.  **Replacement Logic**: Iterates through the `content` to find Markdown link patterns (`[text](path)`).
3.  **Map Lookup**: For each found link, it uses the `path` (from `[text](path)`) as a key to look up a replacement URL in `linkMappings`.
4.  **Substitution**: If a replacement URL is found, the original `path` in the Markdown link is replaced with the new URL.
5.  **Output**: Returns the modified `content` string.
6.  **Edge Cases**: Should handle cases where `content` is empty, `linkMappings` is empty, or links are not found in the map.

### Markdown Link Pattern
The regex for matching markdown links used in `findLocalLinks` (`/\[([^\]]*)\]\(([^)]+)\)/g`) should be reused to ensure consistency in parsing. The captured group for the path (`match[2]`) will be the `originalPath` that needs to be looked up in `linkMappings`.

## Needs Assessment

### Critical Requirements
1.  **`replaceLocalLinks` Method Implementation**: The core of this task.
2.  **Accurate Link Parsing**: Reuse robust regex for Markdown link detection.
3.  **Correct Map Lookup**: Use the extracted link path (original path) as the key for `linkMappings`.
4.  **Efficient Replacement**: Replace links in the content string effectively.
5.  **Type Safety**: Full TypeScript compliance for parameters and return values.
6.  **Static Method**: Must be implemented as a static method.

### Implementation Strategy
1.  Add `replaceLocalLinks` static method to `LinkResolver.ts`.
2.  Implement input validation for `content` and `linkMappings`.
3.  Use the `linkRegex` to find all Markdown links in the `content`.
4.  For each match, extract the original link path (`match[2]`).
5.  Look up the extracted path in `linkMappings`. If a match is found, replace the entire link `fullMatch` (`match[0]`) with a new Markdown link `[text](telegraphUrl)`. This requires careful handling of string manipulation, possibly building a new string or using `String.prototype.replace` with a callback.
6.  Handle edge cases (empty inputs, links not found in map) gracefully.

### Integration Points
-   `ContentProcessor.replaceLinksInContent`: This is the primary caller; its functionality depends on this fix.
-   Build System: Must compile without TypeScript errors.
-   CLI Execution: The `telegraph-publisher publish` command should now execute further without `replaceLocalLinks` errors.

## Dependencies and Constraints

### Dependencies
-   Relies on the `LinkResolver` class structure.
-   Requires understanding of how `ContentProcessor` passes `linkMappings`.

### Constraints
-   Must be a static method.
-   Should not introduce new TypeErrors or regressions.
-   Must handle empty inputs gracefully.
-   Performance should be reasonable for typical content sizes.

## Risk Assessment
-   **Low Risk**: The method is a straightforward string replacement task. The regex is already proven from `findLocalLinks`.
-   **Minimal Impact**: Changes are localized to adding a new method.
-   **High Confidence**: Clear requirements and existing patterns provide strong guidance.

## Success Criteria

### Primary Success Criteria
1.  ✅ `LinkResolver.replaceLocalLinks` method exists and functions correctly.
2.  ✅ Method correctly replaces local Markdown links with provided Telegraph URLs.
3.  ✅ Method handles cases where links are not found in `linkMappings` (leaves them unchanged).
4.  ✅ TypeScript compilation completes without errors.
5.  ✅ `telegraph-publisher` command executes without `TypeError` for `replaceLocalLinks`.
6.  ✅ Command completes intended operation beyond the current error point (e.g., successful dry run publication).

### Validation Methods
-   **Unit Testing**: Create test cases for various link replacement scenarios (including no links, multiple links, links not in map).
-   **Integration Testing**: Verify `ContentProcessor.replaceLinksInContent` works as expected by running the CLI command.
-   **TypeScript Check**: Ensure `bun run build` completes cleanly.

## Analysis Completion
This analysis provides a complete understanding of:
-   ✅ The missing `replaceLocalLinks` method and its requirements.
-   ✅ Its usage context and expected behavior.
-   ✅ Input/output specifications.
-   ✅ Integration points and dependencies.
-   ✅ Implementation strategy and constraints.

**Ready for PLAN phase** to design the detailed implementation approach.

## Analysis Date
2025-07-28_09-47