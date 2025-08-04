# Implementation Plan - Unify Anchor Generation

**Task:** 2025-08-04_TASK-030_unify-anchor-generation  
**Phase:** PLAN Phase  
**Date:** 2025-08-04 21:05  
**Complexity:** 🟡 Medium (4-6 hours estimated)

## Progress Overview
- Total Items: 23
- Completed: 0
- In Progress: 0  
- Blocked: 0
- Not Started: 23

## 1. Foundation Setup [🔴 Not Started]

### 1.1 Create AnchorGenerator Utility Module [🔴 Not Started]
   #### 1.1.1 Create `src/utils/AnchorGenerator.ts` [🔴 Not Started]
   #### 1.1.2 Define HeadingInfo interface [🔴 Not Started]
   #### 1.1.3 Define AnchorGenerator class structure [🔴 Not Started]
   #### 1.1.4 Add TypeScript type exports [🔴 Not Started]

### 1.2 Extract Logic from generateTocAside [🔴 Not Started]
   #### 1.2.1 Extract heading parsing regex and logic [🔴 Not Started]
   #### 1.2.2 Extract link-in-heading detection logic [🔴 Not Started]
   #### 1.2.3 Extract H5/H6 prefix generation logic [🔴 Not Started]
   #### 1.2.4 Extract final anchor generation algorithm [🔴 Not Started]

## 2. AnchorGenerator Implementation [🔴 Not Started]

### 2.1 Core Methods Implementation [🔴 Not Started]
   #### 2.1.1 Implement `extractHeadingInfo(headingMatch: RegExpMatchArray): HeadingInfo` [🔴 Not Started]
   #### 2.1.2 Implement `generateAnchor(headingInfo: HeadingInfo): string` [🔴 Not Started]
   #### 2.1.3 Implement `parseHeadingsFromContent(content: string): HeadingInfo[]` [🔴 Not Started]

### 2.2 Edge Case Handling [🔴 Not Started]
   #### 2.2.1 Handle link extraction from headings `[text](url)` [🔴 Not Started]
   #### 2.2.2 Handle H5/H6 prefix generation (`>`, `>>`) [🔴 Not Started]
   #### 2.2.3 Handle edge cases (levels > 6) [🔴 Not Started]
   #### 2.2.4 Handle empty/malformed headings [🔴 Not Started]

## 3. Integration with Existing Systems [🔴 Not Started]

### 3.1 Update TOC Generation [🔴 Not Started]
   #### 3.1.1 Refactor `generateTocAside` to use `AnchorGenerator` [🔴 Not Started]
   #### 3.1.2 Replace inline logic with `AnchorGenerator.extractHeadingInfo` [🔴 Not Started]
   #### 3.1.3 Replace anchor generation with `AnchorGenerator.generateAnchor` [🔴 Not Started]
   #### 3.1.4 Ensure backward compatibility with existing TOC behavior [🔴 Not Started]

### 3.2 Update LinkVerifier [🔴 Not Started]
   #### 3.2.1 Import AnchorGenerator in LinkVerifier [🔴 Not Started]
   #### 3.2.2 Replace `parseAnchorsFromContent` logic with `AnchorGenerator.parseHeadingsFromContent` [🔴 Not Started]
   #### 3.2.3 Remove old `generateSlug` method [🔴 Not Started]
   #### 3.2.4 Update anchor extraction to use unified logic [🔴 Not Started]

## 4. Testing and Validation [🔴 Not Started]

### 4.1 Unit Tests for AnchorGenerator [🔴 Not Started]
   #### 4.1.1 Create `src/utils/AnchorGenerator.test.ts` [🔴 Not Started]
   #### 4.1.2 Test regular headings (H1-H4) [🔴 Not Started]
   #### 4.1.3 Test H5/H6 headings with prefixes [🔴 Not Started]
   #### 4.1.4 Test link-in-heading scenarios [🔴 Not Started]
   #### 4.1.5 Test edge cases (empty, malformed, Unicode) [🔴 Not Started]

### 4.2 Integration Tests [🔴 Not Started]
   #### 4.2.1 Create TOC ↔ LinkVerifier consistency test [🔴 Not Started]
   #### 4.2.2 Test H5/H6 anchor generation consistency [🔴 Not Started]
   #### 4.2.3 Test complex heading scenarios [🔴 Not Started]

### 4.3 Regression Testing [🔴 Not Started]
   #### 4.3.1 Run existing markdownConverter tests [🔴 Not Started]
   #### 4.3.2 Run existing LinkVerifier tests [🔴 Not Started]
   #### 4.3.3 Update tests to reflect unified behavior [🔴 Not Started]

## 5. Cache Management and Finalization [🔴 Not Started]

### 5.1 Cache Version Management [🔴 Not Started]
   #### 5.1.1 Increment cache version in AnchorCacheManager [🔴 Not Started]
   #### 5.1.2 Add cache migration/invalidation logic [🔴 Not Started]
   #### 5.1.3 Document cache version change [🔴 Not Started]

### 5.2 Documentation and Cleanup [🔴 Not Started]
   #### 5.2.1 Add JSDoc documentation to AnchorGenerator [🔴 Not Started]
   #### 5.2.2 Update README with anchor generation details [🔴 Not Started]
   #### 5.2.3 Clean up unused code and imports [🔴 Not Started]

## Agreement Compliance Log
- [2025-08-04 21:05]: Plan created based on VAN analysis requirements - ✅ Compliant
- [2025-08-04 21:05]: Implementation strategy focuses on extracting proven TOC logic - ✅ Aligned with user requirements
- [2025-08-04 21:05]: Maintains backward compatibility and performance requirements - ✅ Compliant

## Technical Specifications

### AnchorGenerator API Design

```typescript
// src/utils/AnchorGenerator.ts
export interface HeadingInfo {
  level: number;          // 1-6+ (heading level)
  originalText: string;   // Raw heading text from markdown
  displayText: string;    // Text with level prefixes (>, >>)
  textForAnchor: string;  // Processed text for anchor generation
}

export class AnchorGenerator {
  /**
   * Extract heading information from regex match
   * @param headingMatch RegExp match from heading detection
   * @returns HeadingInfo object with all processed variants
   */
  static extractHeadingInfo(headingMatch: RegExpMatchArray): HeadingInfo;

  /**
   * Generate Telegraph-compatible anchor from heading info
   * @param headingInfo Processed heading information
   * @returns URL-safe anchor string
   */
  static generateAnchor(headingInfo: HeadingInfo): string;

  /**
   * Parse all headings from markdown content
   * @param content Raw markdown content
   * @returns Array of HeadingInfo objects
   */
  static parseHeadingsFromContent(content: string): HeadingInfo[];

  /**
   * Extract anchors from content (convenience method for LinkVerifier)
   * @param content Raw markdown content
   * @returns Set of anchor strings
   */
  static extractAnchors(content: string): Set<string>;
}
```

### Integration Changes

#### markdownConverter.ts Changes
```typescript
// Before (current)
function generateTocAside(markdown: string): TelegraphNode | null {
  // ... existing logic with inline anchor generation
}

// After (refactored)
function generateTocAside(markdown: string): TelegraphNode | null {
  const headings = AnchorGenerator.parseHeadingsFromContent(markdown);
  
  if (headings.length < 2) return null;
  
  const listItems: TelegraphNode[] = headings.map(heading => ({
    tag: 'li',
    children: [{
      tag: 'a',
      attrs: { href: `#${AnchorGenerator.generateAnchor(heading)}` },
      children: createTocChildren(heading)
    }]
  }));
  
  return { tag: 'aside', children: [{ tag: 'ul', children: listItems }] };
}
```

#### LinkVerifier.ts Changes
```typescript
// Before (current)
private parseAnchorsFromContent(content: string): Set<string> {
  const headingRegex = /^(#{1,6})\s+(.*)/gm;
  const anchors = new Set<string>();
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const headingText = match[2]?.trim();
    if (headingText) {
      anchors.add(this.generateSlug(headingText));
    }
  }
  return anchors;
}

// After (unified)
private parseAnchorsFromContent(content: string): Set<string> {
  return AnchorGenerator.extractAnchors(content);
}
```

### Cache Version Management

#### Current Version: 1.0.0 → New Version: 1.1.0

**Changes Required**:
1. Update `AnchorCacheManager.CACHE_VERSION` to "1.1.0"
2. Add backward compatibility check in `loadCache()`
3. Auto-invalidate 1.0.0 caches (they contain incorrect H5/H6 anchors)

### Performance Considerations

1. **No Performance Regression**: New logic extracted from existing performant code
2. **Cache Benefits Maintained**: Anchor extraction still cached with content hash
3. **Memory Efficiency**: Single implementation reduces code duplication
4. **Computational Complexity**: O(n) where n = number of headings (unchanged)

### Risk Mitigation

1. **Backward Compatibility**: Extensive testing of existing functionality
2. **Gradual Rollout**: Can be tested with existing cache invalidation
3. **Rollback Plan**: Keep old implementation temporarily for quick rollback
4. **Comprehensive Testing**: Unit + integration + regression tests

### Critical Success Factors

1. **100% TOC Consistency**: All TOC anchors must match LinkVerifier anchors
2. **No Functional Regression**: All existing features must work identically
3. **Performance Maintenance**: No measurable performance degradation
4. **Edge Case Coverage**: H5/H6, links in headings, Unicode, special characters
5. **Cache Invalidation**: Clean transition from old to new anchor format

### Validation Checklist

**Before Implementation**:
- [ ] Verify all test cases pass with current implementation
- [ ] Document current anchor generation behavior
- [ ] Identify all integration points

**During Implementation**:
- [ ] Validate each component against specifications
- [ ] Test edge cases continuously
- [ ] Monitor performance metrics

**After Implementation**:
- [ ] Run full test suite
- [ ] Performance regression testing
- [ ] Manual testing of H5/H6 scenarios
- [ ] Cache invalidation testing

### Dependencies

**Internal**:
- `src/markdownConverter.ts` (TOC generation)
- `src/links/LinkVerifier.ts` (anchor validation)
- `src/cache/AnchorCacheManager.ts` (cache version)

**External**:
- No new external dependencies required
- Uses existing Node.js and TypeScript features

**Test Dependencies**:
- Existing test framework (Bun test)
- Existing test utilities (TestHelpers)

This plan ensures systematic implementation of unified anchor generation while maintaining all existing functionality and performance characteristics.