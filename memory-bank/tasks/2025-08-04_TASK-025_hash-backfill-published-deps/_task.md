# Task Definition - Content Hash Backfilling for Published Dependencies

**Task ID:** 2025-08-04_TASK-025_hash-backfill-published-deps
**Created:** 2025-08-04_13-06
**Status:** 🟡 Active - VAN Phase
**Priority:** High
**Category:** Enhancement

## Task Overview
Implement automatic content hash backfilling for already published dependencies that lack contentHash metadata. This addresses a critical gap where published files without contentHash are "stuck" and never get the hash needed for smart republishing functionality.

## Problem Statement
During the dependency publishing process, files that are already published but do not have a `contentHash` in their metadata are ignored. This prevents them from being updated with a hash, effectively disabling the change-detection mechanism for those files in all future publications.

## User's Goal
The system must identify any published dependency that is missing a `contentHash` and trigger a one-time "edit" operation to update its content and, most importantly, add the `contentHash` to its metadata.

## Root Cause Analysis
The logic in `EnhancedTelegraphPublisher.ts`, specifically within the `publishDependencies` method, focuses primarily on identifying and publishing *unpublished* files. It does not have a specific check for published files that need a metadata upgrade (i.e., adding the `contentHash`).

## Success Criteria
1. ✅ System automatically detects published dependencies missing contentHash
2. ✅ `publishDependencies` method processes ALL files in dependency tree, not just unpublished ones
3. ✅ Published files without contentHash trigger automatic `editWithMetadata` call
4. ✅ Files with existing contentHash and unchanged content are skipped
5. ✅ New unpublished dependencies continue to work as before
6. ✅ Comprehensive test coverage for new backfilling logic
7. ✅ 85% minimum code coverage maintained
8. ✅ 100% test success rate

## Technical Requirements
- **File to Modify:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Method to Modify:** `publishDependencies`
- **Core Logic:** Change iteration from `filesToPublish` to `analysis.publishOrder`
- **New Condition:** Check published files for missing contentHash
- **Force Update:** Use `editWithMetadata` with `forceRepublish: true`

## Acceptance Test Scenario
1. Create `root.md` (unpublished) that references `dep1.md` and `dep2.md`
2. `dep1.md` is published but lacks contentHash in metadata
3. `dep2.md` is published with contentHash and unchanged content
4. Running `publish` on `root.md` should:
   - Automatically update `dep1.md` with contentHash via `editWithMetadata`
   - Skip `dep2.md` (unchanged)
   - Publish `root.md` normally

## Dependencies
- Current `EnhancedTelegraphPublisher.ts` implementation
- `MetadataManager` for status and metadata checks
- Existing `editWithMetadata` and `publishWithMetadata` methods

## Estimated Complexity
**Medium-High** - Requires careful modification of core publishing logic with comprehensive testing

## Quality Standards
- English code and comments only
- 2-space indentation
- Comprehensive error handling
- Unit tests with mocking for API calls
- Integration with existing metadata system