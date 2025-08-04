# Technical Specifications - Final Features Implementation

## Specification 1: Enhanced Table of Contents (aside) Generation

### ID: FEAT-ASIDE-ENHANCEMENT-001
### Date: 2025-08-04
### Status: Ready for Implementation

#### Problem Description
The Table of Contents (aside) generation function has two critical issues:
1. **Incorrect anchors for heading-links**: When a heading is itself a link (e.g., `## [Text](./file.md)`), the current logic incorrectly generates an anchor from the entire Markdown string (`#[Text](./file.md)`), resulting in broken links in the ToC.
2. **Lack of user control**: Users cannot disable automatic ToC generation.

#### Proposed Solution
1. Modify the `generateTocAside` logic in `markdownConverter.ts` to correctly extract the text portion from heading-links for anchor generation.
2. Add `--[no-]aside` option to the `publish` command for ToC generation control.

#### Implementation Requirements

**A. CLI Option Addition**
- File: `src/cli/EnhancedCommands.ts`
- Method: `addPublishCommand`
- Add new options:
  ```typescript
  .option("--aside", "Automatically generate a Table of Contents (aside block) at the start of the article (default: true)")
  .option("--no-aside", "Disable automatic generation of the Table of Contents")
  ```

**B. Option Propagation Through Application Layers**
1. **PublicationWorkflowManager.ts**: Pass option value in `publisher.publishWithMetadata` call
2. **EnhancedTelegraphPublisher.ts**: Add `generateAside` to options and pass to `convertMarkdownToTelegraphNodes`

**C. Core Fix in markdownConverter.ts**
1. Update `convertMarkdownToTelegraphNodes` to accept `options` with `generateToc` flag
2. Update `generateTocAside` to handle heading-links properly

#### Acceptance Criteria
1. Publishing heading `## [Structure](./file.md)` should create ToC link with `href="#Structure"`
2. Running `publish` without `--no-aside` flag should generate ToC (default behavior)
3. Running `publish --no-aside` should not include `<aside>` in final article

---

## Specification 2: Content Hash Backfill for Dependencies

### ID: FEAT-HASH-BACKFILL-001
### Date: 2025-08-04
### Status: Ready for Implementation

#### Problem Description
The dependency publication system only processes unpublished files. If a dependency was published before the `contentHash` system implementation, it will never receive this hash, and the "skip unchanged files" functionality won't work for it.

#### Proposed Solution
Modify `publishDependencies` logic to iterate through **all** files in the dependency tree. For each published file, check for `contentHash` presence. If hash is missing, force run the editing process (`editWithMetadata`) for that file to "backfill" the hash.

#### Implementation Requirements

**File to Modify**: `src/publisher/EnhancedTelegraphPublisher.ts`
**Method to Modify**: `publishDependencies`

**Logic Changes**:
- Modify the loop to iterate over `analysis.publishOrder`
- Add new branch for handling already published files
- Check for missing `contentHash` and force update if needed

#### Core Implementation Logic
```typescript
// Iterate over ALL files in correct order
for (const fileToProcess of analysis.publishOrder) {
  if (fileToProcess === filePath) continue; // Skip root file

  const status = MetadataManager.getPublicationStatus(fileToProcess);

  if (status === PublicationStatus.NOT_PUBLISHED) {
    // EXISTING LOGIC: Publish new files
    // ... existing code ...
  } else if (status === PublicationStatus.PUBLISHED) {
    // NEW LOGIC: Check for missing contentHash and update if necessary
    const metadata = MetadataManager.getPublicationInfo(fileToProcess);
    if (metadata && !metadata.contentHash) {
      // Force edit to backfill hash
      const result = await this.editWithMetadata(fileToProcess, username, {
        withDependencies: false,
        dryRun,
        forceRepublish: true,
        generateAside
      });
      // Handle result...
    }
  }
}
```

#### Acceptance Criteria
1. When running `publish` for file `A.md` that references file `B.md`
2. File `B.md` is already published but lacks `contentHash` in metadata
3. System should automatically run `editWithMetadata` for file `B.md`
4. After completion, file `B.md` should have `contentHash` field
5. If file `B.md` already has `contentHash`, it should be skipped (if content unchanged)

## Technical Constraints
- Maintain backward compatibility with existing functionality
- Ensure all changes follow project coding standards
- Implement comprehensive test coverage
- Use English for all code and comments
- Follow existing project architecture patterns