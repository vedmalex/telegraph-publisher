# Content Hashing for Change Detection - Requirements

## Problem Statement
The current workflow re-publishes a file every time the `publish` command is run, even if its content has not changed. This is inefficient, consumes API rate limits, and clutters publication history.

## Root Cause Analysis
There is no mechanism to track the state of the file's content at the time of its last publication.

## Functional Requirements

### REQ-001: Content Hash Field Addition
- A new field, `contentHash`, must be added to the `FileMetadata` interface
- This hash will be a cryptographic hash (SHA-256) of the file's content, **excluding** the YAML front-matter
- Hash must be stored and retrieved through existing metadata management system

### REQ-002: Publication Skip Logic
- Before publishing (specifically in the "edit" flow), the system will calculate the hash of the current content and compare it to the `contentHash` stored in the metadata
- If the hashes match and the `--force-republish` flag is not set, the publication for that file will be skipped
- Clear user feedback must be provided when publication is skipped

### REQ-003: Hash Update After Publication
- After a successful new publication or edit, the new content hash must be calculated and stored in the updated metadata
- Hash update must be atomic with metadata update to prevent inconsistent state
- Hash calculation must be performed on the same content used for publication

### REQ-004: Force Republish Override
- `--force-republish` flag must bypass the hash check completely
- When force flag is used, publication proceeds regardless of hash comparison
- Hash must still be updated after forced publication

## Technical Requirements

### TECH-001: Hashing Algorithm
- Use SHA-256 algorithm, available in Node.js `crypto` module
- Hash calculation must be performed on content excluding YAML front-matter
- Hash output must be hex-encoded string for storage in YAML

### TECH-002: Interface Updates
- Update `FileMetadata` interface to include optional `contentHash?: string` field
- Update `MetadataManager.createMetadata` to accept contentHash parameter
- Update serialization/parsing methods to handle new field

### TECH-003: Publisher Integration
- Add private method `calculateContentHash(content: string): string` to EnhancedTelegraphPublisher
- Modify `editWithMetadata` method to perform hash check before API calls
- Modify both `publishWithMetadata` and `editWithMetadata` to update hash after success
- Ensure hash check respects `forceRepublish` option

### TECH-004: Performance Considerations
- Hash calculation should be efficient for large files
- Skip logic should minimize file I/O operations
- Metadata updates should be atomic to prevent corruption

## Implementation Details

### FileMetadata Interface Update
```typescript
export interface FileMetadata {
  // ... existing fields
  title?: string;
  description?: string;
  contentHash?: string; // NEW: Add content hash
}
```

### MetadataManager Updates
- `serializeMetadata`: Add contentHash to YAML output
- `createMetadata`: Accept contentHash parameter
- `parseYamlMetadata`: Parse contentHash from YAML

### EnhancedTelegraphPublisher Updates
- Add `calculateContentHash` private method using crypto.createHash('sha256')
- Enhance `editWithMetadata` with hash comparison logic
- Update both publication methods to calculate and store new hash
- Implement skip logic with user feedback

## Acceptance Criteria

1. **Initial Publication**: After a file is published for the first time, its YAML front-matter must contain a `contentHash` field
2. **Skip Unchanged Files**: If `publish` is run again on an unchanged file, the console should output a "Skipping" message, and no API call should be made
3. **YAML-Only Changes**: If only the YAML front-matter of a file is changed (e.g., by another tool), `publish` should still skip it, as the content hash remains the same
4. **Content Changes**: If the Markdown content of the file is changed, `publish` must proceed with the edit and update the `contentHash` in the front-matter to the new value
5. **Force Override**: Using the `--force-republish` flag must bypass the hash check and always trigger a publication
6. **Test Coverage**: Implementation must achieve 85% minimum test coverage
7. **Test Success**: All tests must pass with 100% success rate

## Dependencies
- Existing metadata management infrastructure
- FileMetadata interface and serialization system
- EnhancedTelegraphPublisher publication workflow
- Node.js crypto module availability

## Success Metrics
- Reduced API calls for unchanged content
- Improved publication efficiency
- Maintained data integrity through hash verification
- Enhanced user experience with skip feedback
- Preserved ability to force republication when needed