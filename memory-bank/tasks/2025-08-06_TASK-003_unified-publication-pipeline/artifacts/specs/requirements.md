# Technical Specification: Unified Publication Pipeline

## 1. Objective

To refactor the publication workflow to ensure a single, unified pipeline is executed for **every** file being published, whether it is the initial target of the command or a dependency discovered during the process. This will guarantee that critical steps, such as link replacement, are consistently applied to all files, resolving the bug where dependencies are published with incorrect, non-updated local links.

## 2. Problem Analysis

### Symptom
When publishing a root file (e.g., `песнь1.md`) that has dependencies (e.g., `01.md`), the links *within* the dependency (`01.md`) are not being replaced with their corresponding Telegraph URLs before publication. However, publishing the dependency file (`01.md`) directly works correctly.

### Root Cause
The method `EnhancedTelegraphPublisher.publishWithMetadata` contains a conditional block that controls link replacement. This block is executed based on the `withDependencies` flag:

```typescript
const processedWithLinks = withDependencies
  ? await this.replaceLinksWithTelegraphUrls(processed, this.cacheManager)
  : processed;
```

The `publishDependencies` method recursively calls `publishWithMetadata` for each dependency, but it correctly sets `withDependencies: false` to prevent infinite recursion. This has the unintended side effect of disabling the link replacement step for all dependencies.

### Consequence
The logic creates two distinct pipelines:
1. **Root File Pipeline:** Process Content -> Publish Dependencies -> **Replace Links** -> Publish to Telegraph. (Correct)
2. **Dependency File Pipeline:** Process Content -> Publish to Telegraph. (**Incorrect - Link Replacement is skipped**)

## 3. Future State Vision

The publication logic will be unified. The `publishWithMetadata` method will become the single, authoritative pipeline for processing any individual file. The decision to replace links will be based on the global project configuration (`replaceLinksInContent`), not on the file's position in the dependency tree.

The new unified pipeline for *any* file will be:
**Process Content -> Replace Links (if configured) -> Publish to Telegraph**

## 4. Technical Implementation

### 4.1 File to be Modified
- `src/publisher/EnhancedTelegraphPublisher.ts`

### 4.2 Code Changes Required

#### In `publishWithMetadata` method:

**Current (Before):**
```typescript
const processedWithLinks = withDependencies
  ? await this.replaceLinksWithTelegraphUrls(processed, this.cacheManager)
  : processed;
```

**New (After):**
```typescript
let processedWithLinks = processed;
// Unified Pipeline: Replace links if configured and if there are links to replace.
// This is no longer dependent on the `withDependencies` recursion flag.
if (this.config.replaceLinksinContent && processed.localLinks.length > 0) {
    processedWithLinks = await this.replaceLinksWithTelegraphUrls(processed, this.cacheManager);
}
```

#### In `editWithMetadata` method:

**Current (Before):**
```typescript
const processedWithLinks = withDependencies
  ? await this.replaceLinksWithTelegraphUrls(processed, this.cacheManager)
  : processed;
```

**New (After):**
```typescript
let processedWithLinks = processed;
// Unified Pipeline: Apply the same logic as in publishWithMetadata for consistency.
if (this.config.replaceLinksinContent && processed.localLinks.length > 0) {
    processedWithLinks = await this.replaceLinksWithTelegraphUrls(processed, this.cacheManager);
}
```

### 4.3 Rationale
This change decouples the link replacement functionality from the recursion control (`withDependencies`) flag. The decision to replace links is now correctly based on the global configuration (`this.config.replaceLinksinContent`). This ensures that every file, whether it's the initial target or a dependency, passes through the exact same processing pipeline.

## 5. Acceptance Criteria & Testing Plan

### Acceptance Criteria
- **AC1: Unified Pipeline:** All files processed via `publishWithMetadata` or `editWithMetadata` must have their links replaced if `replaceLinksinContent` is enabled in the configuration.
- **AC2: Bug Resolution:** Publishing a root file must result in the correct replacement of links within its dependencies.
- **AC3: Regression Prevention:** Publishing a file directly must continue to work as expected. The recursion prevention mechanism must remain intact.

### Testing Plan
1. **Create Test Files:**
   - `./root.md`: Contains a link to `./dependency.md`.
   - `./dependency.md`: Contains a link to `./sub-dependency.md`.
   - `./sub-dependency.md`: No links.

2. **Mock API & Cache:**
   - Mock the `publishNodes`/`editPage` methods to return predictable URLs (e.g., `https://telegra.ph/sub-dependency`).
   - Ensure the `PagesCacheManager` is populated with the URL for `sub-dependency.md` after it is published.

3. **Execution:**
   - Run the `publish` command on `root.md`.

4. **Assertion:**
   - Use a spy or mock on the `editPage`/`publishNodes` method.
   - When the method is called for `dependency.md`, inspect the `nodes` argument (the content).
   - **Verify that the content for `dependency.md` contains the full Telegraph URL `https://telegra.ph/sub-dependency` and NOT the local path `./sub-dependency.md`.** This confirms the fix.

## 6. Creative Solution Design

### Problem Analysis
- **Description**: The link replacement mechanism is currently skipped for all dependency files because it is incorrectly tied to a flag (`withDependencies`) that is used to control recursion.
- **Requirements**: All files must go through the exact same processing pipeline before publication. The solution must be simple and not introduce unnecessary complexity or code duplication.
- **Constraints**: The fix should not break the existing recursion prevention mechanism.

### Solution Options Evaluated
- **Option A: Condition on Global Config:** Change the conditional check for link replacement to use `this.config.replaceLinksinContent && processed.localLinks.length > 0` instead of `withDependencies`.
- **Option B: Add a New Flag:** Introduce a new parameter like `shouldReplaceLinks: true` (adds unnecessary complexity).
- **Option C: Duplicate Logic:** Copy the link replacement logic (poor design choice).

### Selected Solution
**Option A: Condition on Global Config** - This is the cleanest, most correct, and most maintainable solution. It resolves the logical flaw with a minimal code change by using the correct condition for the check, thereby unifying the pipeline for all files without introducing any new complexity.

### Implementation Notes
- The same change must be applied in both `publishWithMetadata` and `editWithMetadata` to ensure consistent behavior for new and existing files.
- An additional check for `processed.localLinks.length > 0` is a good practice to avoid the overhead of the replacement function if there are no links to process. 