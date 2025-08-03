# Task Definition: Content Hashing for Change Detection

**Task ID:** TASK-020
**Created:** 2025-08-03_22-58
**Status:** Complete  
**Phase:** QA (Complete)
**Priority:** High

## Overview
Implement a content hashing mechanism to prevent re-publication of unchanged files, optimizing API usage and improving publication efficiency.

## Success Criteria
- [x] FileMetadata interface includes contentHash field
- [x] SHA-256 content hashing implemented for content without YAML front-matter
- [x] Hash comparison prevents republication of unchanged files
- [x] Force republish flag bypasses hash check when needed
- [x] Hash values updated after successful publication/edit operations
- [x] Clear console feedback when skipping unchanged files

## Task Scope
- **Files to Modify:**
  - `src/types/metadata.ts` (FileMetadata interface)
  - `src/metadata/MetadataManager.ts` (serialization/parsing)
  - `src/publisher/EnhancedTelegraphPublisher.ts` (hash logic)
- **Algorithm:** SHA-256 using Node.js crypto module
- **Testing Required:** Unit tests for hashing and skip logic
- **Performance Impact:** Reduced API calls for unchanged content

## Acceptance Criteria
1. After file published first time, YAML front-matter contains `contentHash` field
2. Running `publish` again on unchanged file shows "Skipping" message with no API call
3. Changes only to YAML front-matter still skip publication (content hash unchanged)
4. Markdown content changes trigger publication and update `contentHash`
5. `--force-republish` flag bypasses hash check and always publishes
6. 85% test coverage for new hashing functionality
7. All tests pass with 100% success rate

## Dependencies
- Existing metadata management system
- FileMetadata interface structure
- EnhancedTelegraphPublisher workflow
- Node.js crypto module for SHA-256

## Estimated Complexity
**Medium** - Requires interface changes and integration across multiple components