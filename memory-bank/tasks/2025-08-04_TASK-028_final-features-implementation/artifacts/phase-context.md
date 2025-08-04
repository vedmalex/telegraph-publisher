# Integrated Phase Context - Final Features Implementation (UPDATED)

## User Specifications Summary
- **Source**: `artifacts/specs/requirements.md` + **User Bug Report**
- **Key Requirements**: 
  1. ✅ Enhanced ToC generation with proper heading-link anchor handling
  2. 🔴 **CRITICAL BUG**: ToC creates nested links for heading-links (user-reported)
  3. ✅ Content hash backfill system for previously published dependencies  
  4. ✅ CLI control via `--[no-]aside` options
  5. ✅ Backward compatibility maintenance
- **Constraints**: 
  - Must maintain existing functionality
  - English-only code and comments
  - Comprehensive test coverage required
  - Follow project architecture patterns

## User Bug Report Analysis
**Evidence Files**: `BUG/index.json`, `BUG/index.md`, `BUG/sample_index.htm`

### Critical Issue Discovered
For heading `## [Аналогии](./аналогии.md)`, ToC incorrectly generates:
```json
{
  "tag": "a", "attrs": { "href": "#Аналогии" },
  "children": [
    {
      "tag": "a",  // ❌ NESTED LINK BUG
      "attrs": { "href": "https://telegra.ph/..." },
      "children": ["Аналогии"]
    }
  ]
}
```

**Root Cause**: `markdownConverter.ts:218` uses `processInlineMarkdown()` which processes links in ToC text.

**Required Fix**: Use plain text instead of processed Markdown for ToC children.

## VAN Analysis Results (CORRECTED)
- **Key Finding**: **FEAT-ASIDE-ENHANCEMENT-001 has critical bug** ❌
- **ToC Enhancement**: Partial implementation with **nested link bug**
- **Hash Backfill**: Complete implementation verified ✅
- **CLI Integration**: Both `--aside` and `--no-aside` options fully functional ✅
- **Test Coverage**: Existing tests don't catch the nested link bug ❌

## Current Phase Objectives
- **Phase**: PLAN
- **Goals**: Design fix for ToC nested link bug and create comprehensive test strategy
- **Success Criteria**: 
  1. Fix ToC text processing to use plain text only
  2. Ensure ToC contains only anchor links, no nested external links
  3. Validate fix against user's specific examples
  4. Maintain backward compatibility for normal headings

## Implementation Status Assessment (UPDATED)

### Feature 1: Enhanced ToC Generation
**Status**: 🔴 **CRITICAL BUG NEEDS FIXING**
- CLI options: `--aside`, `--no-aside` ✅
- Option propagation: CLI → Workflow → Publisher → Converter ✅
- Core logic: Link-heading processing **partially working** ❌
  - Anchor generation: ✅ Correct
  - Text processing: ❌ **Creates nested links**
- Test coverage: ❌ **Missing nested link test cases**

### Feature 2: Content Hash Backfill
**Status**: ✅ **IMPLEMENTED**  
- Dependency iteration: Full `publishOrder` processing ✅
- Status handling: `handlePublishedFile` with hash checking ✅
- Backfill logic: Force edit with `forceRepublish: true` ✅
- Test coverage: `EnhancedTelegraphPublisher.test.ts` ✅

## Implementation Requirements (UPDATED)

### Priority 1: Fix ToC Nested Link Bug
**File**: `src/markdownConverter.ts`
**Function**: `generateTocAside`
**Line**: 218

**Current (Broken)**:
```typescript
children: [...processInlineMarkdown(heading.displayText)]
```

**Required (Fixed)**:
```typescript
children: [heading.textForAnchor] // Use plain text only
```

### Priority 2: Add Comprehensive Tests
**Test Requirements**:
- Test ToC generation for heading-links
- Verify no nested `<a>` tags in ToC structure
- Validate against user's specific examples
- Ensure regression prevention

### Priority 3: Validate User Examples
**Test Cases from Bug Report**:
- `## [Аналогии](./аналогии.md)` → ToC with plain text "Аналогии"
- `## [Домашнее задание](./задание.md)` → ToC with plain text "Домашнее задание"
- Verify HTML output matches expected structure

## Edge Case Considerations
1. **Mixed Headings**: Documents with both link and non-link headings
2. **Complex Links**: Headings with formatted text inside links
3. **Multiple Link Formats**: Different link syntax variations
4. **Backward Compatibility**: Ensure normal headings still work

## Next Phase: PLAN
- Design exact implementation approach for ToC fix
- Create comprehensive test strategy including user examples
- Plan validation workflow against bug report evidence
- Define rollback strategy if needed
- Design performance impact assessment