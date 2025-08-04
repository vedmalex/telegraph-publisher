# Implementation Plan - Content Hash Backfilling for Published Dependencies

**Task ID:** 2025-08-04_TASK-025_hash-backfill-published-deps
**Phase:** PLAN
**Date:** 2025-08-04_13-06
**Status:** ✅ Completed

## Progress Overview
- **Total Items:** 24
- **Completed:** 0
- **In Progress:** 0  
- **Not Started:** 24
- **Blocked:** 0

## 1. Core Implementation [🔴 Not Started]

### 1.1 Modify publishDependencies Method [🔴 Not Started]
**File:** `src/publisher/EnhancedTelegraphPublisher.ts`
**Lines:** 439-497
**Objective:** Replace filtered iteration with comprehensive status checking

#### 1.1.1 Remove getFilesToPublish dependency [🔴 Not Started]
- **Current:** `const filesToPublish = this.dependencyManager.getFilesToPublish(dependencyTree);` (line 459)
- **Action:** Remove this line as we'll process all files directly
- **Impact:** Eliminates filtering that excludes published files
- **Validation:** Ensure no other parts of method depend on `filesToPublish` variable

#### 1.1.2 Replace iteration logic [🔴 Not Started]
- **Current:** `if (filesToPublish.includes(fileToPublish) && fileToPublish !== filePath)` (line 469)
- **New:** Direct iteration through `analysis.publishOrder` with status checking
- **Code Structure:**
  ```typescript
  for (const fileToProcess of analysis.publishOrder) {
    if (fileToProcess === filePath) continue; // Skip root file
    
    const status = MetadataManager.getPublicationStatus(fileToProcess);
    // Status-based processing logic here
  }
  ```
- **Validation:** Maintain same order of processing, preserve root file exclusion

#### 1.1.3 Implement status-based processing [🔴 Not Started]
- **NOT_PUBLISHED branch:** Preserve existing `publishWithMetadata` logic
- **PUBLISHED branch:** Add new contentHash checking and backfill logic
- **Other statuses:** Handle METADATA_CORRUPTED and METADATA_MISSING appropriately
- **Code Structure:**
  ```typescript
  if (status === PublicationStatus.NOT_PUBLISHED) {
    // Existing publishWithMetadata logic
  } else if (status === PublicationStatus.PUBLISHED) {
    // New backfill logic
  } else {
    // Handle corrupted/missing metadata cases
  }
  ```

### 1.2 Implement Content Hash Backfill Logic [🔴 Not Started]

#### 1.2.1 Add metadata validation check [🔴 Not Started]
- **Action:** Call `MetadataManager.getPublicationInfo(fileToProcess)`
- **Validation:** Check if metadata exists and lacks `contentHash` field
- **Code:** `if (metadata && !metadata.contentHash)`
- **Error Handling:** Handle case where metadata is corrupted/unreadable

#### 1.2.2 Add progress indication [🔴 Not Started]
- **Action:** Call `ProgressIndicator.showStatus()` for user feedback
- **Message:** `"Updating ${basename(fileToProcess)} to add content hash..."`
- **Type:** "info" level for non-critical operational feedback
- **Import:** Ensure `basename` is imported from "node:path"

#### 1.2.3 Execute forced edit operation [🔴 Not Started]
- **Method:** `this.editWithMetadata(fileToProcess, username, options)`
- **Options:** 
  - `withDependencies: false` (prevent infinite recursion)
  - `dryRun: dryRun` (respect calling function's dry-run setting)
  - `forceRepublish: true` (bypass normal hash comparison)
- **Error Handling:** Capture and propagate edit failures with detailed error messages

#### 1.2.4 Track backfilled files [🔴 Not Started]
- **Action:** Add successful backfills to `publishedFiles` array
- **Rationale:** Inform caller about files that were updated in this run
- **Code:** `publishedFiles.push(fileToProcess);`

### 1.3 Error Handling and Edge Cases [🔴 Not Started]

#### 1.3.1 Network and API error handling [🔴 Not Started]
- **Scope:** Handle failures in `editWithMetadata` calls
- **Action:** Return detailed error with file context
- **Format:** `"Failed to update dependency ${fileToProcess} with hash: ${result.error}"`
- **Behavior:** Stop processing and return failure state with partial results

#### 1.3.2 Metadata corruption handling [🔴 Not Started]
- **Scope:** Handle `PublicationStatus.METADATA_CORRUPTED` files
- **Strategy:** Log warning but continue processing (don't block entire operation)
- **Code:** Add warning log and skip to next file
- **Future Enhancement:** Could trigger metadata repair in future versions

#### 1.3.3 Dry-run mode support [🔴 Not Started]
- **Requirement:** Ensure backfill operations respect dry-run mode
- **Validation:** Verify `editWithMetadata` properly handles dry-run parameter
- **Testing:** Add specific test cases for dry-run backfill scenarios

## 2. Testing Strategy [🔴 Not Started]

### 2.1 Unit Test Infrastructure [🔴 Not Started]
**File:** `src/publisher/EnhancedTelegraphPublisher.test.ts`

#### 2.1.1 Extend existing test setup [🔴 Not Started]
- **Action:** Add new describe block: "publishDependencies with content hash backfilling"
- **Setup:** Use existing mock patterns for MetadataManager and API calls
- **Mocks Needed:**
  - `MetadataManager.getPublicationStatus`
  - `MetadataManager.getPublicationInfo`
  - `publisher.editWithMetadata`
  - `publisher.publishWithMetadata`

#### 2.1.2 Create comprehensive test scenarios [🔴 Not Started]
- **Test 1:** Published file without contentHash → Should trigger editWithMetadata
- **Test 2:** Published file with contentHash → Should be skipped
- **Test 3:** Unpublished file → Should use existing publishWithMetadata logic
- **Test 4:** Mixed dependency tree with all scenarios
- **Test 5:** Error handling for failed backfill operations
- **Test 6:** Dry-run mode with backfill scenarios

### 2.2 Mock Strategy [🔴 Not Started]

#### 2.2.1 MetadataManager mocks [🔴 Not Started]
```typescript
// Mock getPublicationStatus to return different statuses per file
jest.spyOn(MetadataManager, 'getPublicationStatus').mockImplementation((filePath) => {
  if (filePath.includes('published-no-hash')) return PublicationStatus.PUBLISHED;
  if (filePath.includes('published-with-hash')) return PublicationStatus.PUBLISHED;
  return PublicationStatus.NOT_PUBLISHED;
});

// Mock getPublicationInfo to return metadata with/without contentHash
jest.spyOn(MetadataManager, 'getPublicationInfo').mockImplementation((filePath) => {
  if (filePath.includes('no-hash')) return { telegraphUrl: '...', editPath: '...' }; // No contentHash
  if (filePath.includes('with-hash')) return { telegraphUrl: '...', contentHash: 'abc123' };
  return null;
});
```

#### 2.2.2 Publisher method mocks [🔴 Not Started]
```typescript
// Mock editWithMetadata to track calls and simulate success/failure
const editWithMetadataSpy = jest.spyOn(publisher, 'editWithMetadata')
  .mockResolvedValue({ success: true, url: 'test-url', path: 'test-path' });

// Mock publishWithMetadata for unpublished files
const publishWithMetadataSpy = jest.spyOn(publisher, 'publishWithMetadata')
  .mockResolvedValue({ success: true, url: 'test-url', path: 'test-path' });
```

### 2.3 Test Scenario Implementation [🔴 Not Started]

#### 2.3.1 Basic backfill scenario test [🔴 Not Started]
```typescript
it('should backfill contentHash for published files missing it', async () => {
  // Setup: Create dependency tree with published file lacking contentHash
  // Execute: Call publishDependencies
  // Assert: editWithMetadata called with forceRepublish: true
  // Assert: File included in publishedFiles result
});
```

#### 2.3.2 Skip scenario test [🔴 Not Started]
```typescript
it('should skip published files that already have contentHash', async () => {
  // Setup: Create file with existing contentHash
  // Execute: Call publishDependencies  
  // Assert: editWithMetadata NOT called for this file
  // Assert: File NOT included in publishedFiles result
});
```

#### 2.3.3 Mixed scenario integration test [🔴 Not Started]
```typescript
it('should handle mixed dependency tree correctly', async () => {
  // Setup: Tree with unpublished, published+hash, published+no-hash files
  // Execute: Call publishDependencies
  // Assert: Correct method called for each file type
  // Assert: All appropriate files in publishedFiles result
});
```

## 3. Quality Assurance [🔴 Not Started]

### 3.1 Code Coverage Requirements [🔴 Not Started]

#### 3.1.1 Target coverage metrics [🔴 Not Started]
- **Minimum:** 85% code coverage for modified publishDependencies method
- **Target:** 90%+ coverage including all new branches and error paths
- **Measurement:** Use existing jest coverage tools
- **Validation:** Ensure all new conditional branches are tested

#### 3.1.2 Coverage validation points [🔴 Not Started]
- ✅ NEW: PUBLISHED status branch with missing contentHash
- ✅ NEW: PUBLISHED status branch with existing contentHash  
- ✅ NEW: editWithMetadata call with forceRepublish
- ✅ NEW: Error handling for failed backfill operations
- ✅ EXISTING: NOT_PUBLISHED status branch (preserve coverage)
- ✅ EXISTING: Error handling for regular publish failures

### 3.2 Integration Testing [🔴 Not Started]

#### 3.2.1 End-to-end workflow validation [🔴 Not Started]
- **Test:** Complete publish workflow with mixed dependency types
- **Validation:** Verify no regression in existing functionality
- **Scope:** Test with real file system operations (not just mocks)
- **Focus:** Ensure metadata is actually written with contentHash

#### 3.2.2 Performance impact assessment [🔴 Not Started]
- **Measurement:** Compare execution time before/after changes
- **Acceptable Impact:** < 10% performance degradation for normal cases
- **Optimization:** Metadata reads are cached, should have minimal impact
- **Validation:** Test with larger dependency trees (10+ files)

## 4. Integration and Deployment [🔴 Not Started]

### 4.1 Backward Compatibility Validation [🔴 Not Started]

#### 4.1.1 Existing test suite validation [🔴 Not Started]
- **Action:** Run complete existing test suite without modifications
- **Requirement:** 100% pass rate for all existing tests
- **Focus:** Ensure no breaking changes to existing publish workflows
- **Scope:** All tests in EnhancedTelegraphPublisher.test.ts and related files

#### 4.1.2 API contract preservation [🔴 Not Started]
- **Method Signature:** No changes to publishDependencies parameters or return type
- **Return Format:** Same structure with potential additional files in publishedFiles
- **Error Handling:** Same error format and propagation patterns
- **Behavior:** Same external behavior for files that were working before

### 4.2 Documentation Updates [🔴 Not Started]

#### 4.2.1 Code documentation [🔴 Not Started]
- **Method Comments:** Update publishDependencies JSDoc to document new behavior
- **Inline Comments:** Add comments explaining backfill logic
- **Examples:** Add code examples showing contentHash backfill scenarios

#### 4.2.2 Error message clarity [🔴 Not Started]
- **Backfill Progress:** Clear messages about what files are being updated
- **Error Context:** Detailed error messages that help diagnose backfill failures
- **User Guidance:** Helpful messages about why backfill operations are happening

## Agreement Compliance Log
- **2025-08-04_13-06:** Plan created based on integrated context from VAN analysis and user specifications - ✅ Compliant
- **2025-08-04_13-06:** All plan items mapped to requirements in traceability matrix - ✅ Compliant
- **2025-08-04_13-06:** Error handling strategy aligned with existing patterns - ✅ Compliant
- **2025-08-04_13-06:** Testing strategy comprehensive with mocking approach - ✅ Compliant

## Plan Structure Validation
- ✅ **Hierarchical Organization:** 4 main objectives with sub-tasks
- ✅ **Clear Dependencies:** Implementation → Testing → QA → Integration
- ✅ **Measurable Tasks:** Each task has specific validation criteria
- ✅ **Resource Allocation:** Uses existing infrastructure and patterns
- ✅ **Risk Mitigation:** Comprehensive testing and backward compatibility validation

## Next Phase: CREATIVE
**Requirements for Creative Phase:**
- **Architecture Decisions:** Determine optimal error handling patterns
- **Design Patterns:** Choose best approach for status-based processing
- **User Experience:** Design clear progress indication and error messaging
- **Performance Optimization:** Evaluate caching strategies for metadata operations