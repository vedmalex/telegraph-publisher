# Technical Requirements: Link Parsing and Metadata Preservation Fix

## Problem Statement

The `telegraph-publisher` utility has two critical issues that need immediate resolution:

1. **Markdown Link Parsing Issue**: The current regex pattern in `src/markdownConverter.ts` uses greedy matching that incorrectly captures text following link boundaries, creating malformed Telegraph nodes.

2. **Metadata Loss Issue**: When publishing with `--no-with-dependencies` flag, the system unintentionally removes existing `publishedDependencies` metadata from file front-matter.

## Detailed Requirements

### REQ-001: Fix Markdown Link Parsing Regex

**Priority**: High  
**Component**: `src/markdownConverter.ts`  
**Function**: `processInlineMarkdown(text: string): (string | TelegraphNode)[]`

#### Current Problematic Implementation
```typescript
{ regex: /\[(.*?)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, tag: "a", isLink: true }
```

#### Required Implementation
```typescript
{ regex: /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, tag: "a", isLink: true }
```

#### Acceptance Criteria
- Link text capturing group `([^[\]]*(?:\[[^\]]*\][^[\]]*)*)` correctly handles nested brackets without greedy overflow
- Link boundaries are precisely determined without capturing subsequent text
- Existing functionality for parentheses in URLs is preserved
- All tests in `markdownConverter.parentheses-bug.test.ts` and `LinkScanner.regex-fix.test.ts` pass

### REQ-002: Preserve publishedDependencies Metadata

**Priority**: High  
**Component**: `src/publisher/EnhancedTelegraphPublisher.ts`  
**Functions**: `publishWithMetadata()`, `editWithMetadata()`

#### Current Problematic Behavior
- When `withDependencies = false`, system initializes empty `publishedDependencies: {}`
- This empty object overwrites existing dependency metadata during metadata update
- Results in data loss from file front-matter

#### Required Behavior
- When `withDependencies = false`, preserve existing `publishedDependencies` from `existingMetadata`
- When `withDependencies = true`, update `publishedDependencies` with new dependency data
- Apply preservation logic consistently in both `publishWithMetadata` and `editWithMetadata`

#### Implementation Logic
```typescript
// In both publishWithMetadata and editWithMetadata:
const existingMetadata = MetadataManager.getPublicationInfo(filePath);
const originalDependencies = existingMetadata?.publishedDependencies || {};
let publishedDependencies: Record<string, string> = {};

if (withDependencies) {
  // Process dependencies and get new mappings
  const dependencyResult = await this.publishDependencies(...);
  publishedDependencies = dependencyResult.linkMappings || {};
} else {
  // Preserve existing dependencies
  publishedDependencies = originalDependencies;
}
```

#### Acceptance Criteria
- Publishing with `--no-with-dependencies` on files with existing `publishedDependencies` preserves the field unchanged
- Publishing with `--with-dependencies` correctly updates `publishedDependencies` with new data
- Behavior is identical for new publications and existing edits
- No existing functionality is broken

### REQ-003: Comprehensive Testing Coverage

**Priority**: High  
**Components**: Test files to be created

#### Unit Testing Requirements
**File**: `src/markdownConverter.link-parsing.test.ts`
- Test problematic content from `02.md` file specifically
- Verify `convertMarkdownToTelegraphNodes` produces correct `TelegraphNode` structure
- Validate link `children` and `href` properties are accurate
- Ensure no extra text is captured beyond link boundaries

#### Integration Testing Requirements
**File**: `src/integration/metadata-preservation.integration.test.ts`

**Test Scenario 1**: Metadata Preservation with `withDependencies: false`
1. Create test file with dependencies and non-empty `publishedDependencies` in front-matter
2. Call `workflowManager.publish()` with `withDependencies: false`
3. Verify `publishedDependencies` field is unchanged
4. Verify no data loss occurred

**Test Scenario 2**: Metadata Update with `withDependencies: true`
1. Use same test file from scenario 1
2. Call `workflowManager.publish()` with `withDependencies: true`
3. Verify `publishedDependencies` field is correctly updated with new data
4. Verify old dependencies are replaced as expected

#### Regression Testing Requirements
- All existing tests must pass: 100% success rate
- Code coverage must be maintained: minimum 85%
- No existing functionality can be broken by changes

### REQ-004: Consistency and Standards Compliance

**Priority**: Medium  
**Component**: All modified files

#### Code Quality Requirements
- Use existing patterns from `src/links/LinkScanner.ts` for consistency
- Maintain backward compatibility with existing Telegraph node structure
- Follow project TypeScript coding standards
- Ensure English language for all code and comments

#### Documentation Requirements
- Update any inline comments that reference the modified regex patterns
- Ensure test documentation clearly describes the problem being solved
- Maintain traceability between requirements and implementation

## Technical Constraints

### Performance Requirements
- Link parsing performance must not degrade significantly
- Metadata operations should remain fast for large files
- Memory usage should not increase substantially

### Compatibility Requirements
- Maintain compatibility with existing Telegraph API
- Preserve existing file format and front-matter structure
- Ensure backward compatibility with published content

### Error Handling Requirements
- Graceful handling of malformed markdown links
- Proper error messages for metadata corruption scenarios
- Robust fallback behavior when dependency data is missing

## Success Metrics

### Functional Metrics
- 0 link parsing errors on existing content files
- 100% preservation of metadata when using `--no-with-dependencies`
- 100% correct metadata updates when using `--with-dependencies`

### Quality Metrics
- 100% test success rate after implementation
- 85% minimum code coverage maintained
- 0 regression issues introduced

### Performance Metrics
- Link parsing performance within 5% of current baseline
- Metadata operations complete within existing time constraints
- No memory leaks introduced in dependency processing
