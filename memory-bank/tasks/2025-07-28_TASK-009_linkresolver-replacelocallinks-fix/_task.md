# Task: LinkResolver.replaceLocalLinks TypeError Fix

## Task ID
2025-07-28_TASK-009_linkresolver-replacelocallinks-fix

## Status
🟡 IN PROGRESS - IMPLEMENT Phase

## Priority
🔴 High - Critical Error Fix (Continuation of TASK-008)

## Description
Fix TypeError: LinkResolver.replaceLocalLinks is not a function in telegraph-publisher application. The error occurs at `dist/cli.js:4123:68` within `replaceLinksInContent` (from ContentProcessor.ts) when attempting to call LinkResolver.replaceLocalLinks.

This is a continuation of the systematic missing method issues in LinkResolver, following TASK-007 (findLocalLinks) and TASK-008 (filterMarkdownLinks, getUniqueFilePaths).

## Problem Analysis
The error indicates that the `replaceLocalLinks` method is missing or incorrectly defined in the `LinkResolver` class. This method is crucial for updating local Markdown links with their corresponding Telegraph URLs after publication.

## Error Details
```
TypeError: LinkResolver.replaceLocalLinks is not a function. (In 'LinkResolver.replaceLocalLinks(processedContent.contentWithoutMetadata, replacementMap)', 'LinkResolver.replaceLocalLinks' is undefined)
      at replaceLinksInContent (/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/dist/cli.js:4123:68)
      at replaceLinksWithTelegraphUrls (/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/dist/cli.js:5485:41)
      at publishWithMetadata (/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/dist/cli.js:5318:93)
```

## Implementation Scope
### Target
- **`replaceLocalLinks` method**: Replace local Markdown links in content with Telegraph URLs.

## Technical Context
- **Project**: telegraph-publisher (external to cursor-memory-bank)
- **Error Location**: `dist/cli.js:4123:68` in `ContentProcessor.replaceLinksInContent`
- **Usage**: Used to replace local Markdown links with Telegraph URLs in content after publication
- **Previous Fixes**:
  - TASK-007: `findLocalLinks` implemented
  - TASK-008: `filterMarkdownLinks` and `getUniqueFilePaths` implemented
- **Current Resolution**: `replaceLocalLinks` method implementation
- **Language**: JavaScript/TypeScript
- **Build System**: Node.js-based (bun/npm/yarn)
- **Module System**: ES Modules

## Acceptance Criteria
1. LinkResolver class must have a static `replaceLocalLinks` method.
2. Method should accept string content and a `Map<string, string>` (originalPath -> telegraphUrl) as input.
3. Method should replace all occurrences of local Markdown links in content with their corresponding Telegraph URLs from the provided map.
4. Method should return the modified content string.
5. LinkResolver should remain properly exported using named exports.
6. Project successfully rebuilds without errors.
7. `telegraph-publisher` command executes without `TypeError` for `replaceLocalLinks`.
8. Command completes intended operation beyond the current error point (e.g., successful dry run publication).

## Implementation Strategy
1. **Method Design**: Add `replaceLocalLinks` static method to `LinkResolver.ts`.
2. **Input Validation**: Implement input validation for `content` and `linkMappings`.
3. **Link Parsing**: Reuse the Markdown link regex `/\[([^\]]*)\]\(([^)]+)\)/g`.
4. **Replacement Logic**: Use `String.prototype.replace` with a callback to replace links based on `linkMappings`.
5. **Type Safety**: Ensure full TypeScript compliance and proper JSDoc documentation.

## Current Phase
⚙️ IMPLEMENT - Implementation Phase

## Phase Progress
- ✅ VAN Analysis: Completed
- ✅ PLAN: Completed
- 🟡 IMPLEMENT: In Progress
- 🔴 QA: Not Started
- 🔴 REFLECT: Not Started

## Created
2025-07-28_09-47

## Dependencies
- Builds upon TASK-007 and TASK-008 (LinkResolver method fixes)
- Requires understanding of Markdown link syntax and LocalLink structure
- Must maintain compatibility with `ContentProcessor.replaceLinksInContent` usage