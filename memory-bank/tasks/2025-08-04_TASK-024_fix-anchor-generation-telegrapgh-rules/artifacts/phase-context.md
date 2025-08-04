# Integrated Phase Context - Fix Anchor Generation According to Telegra.ph Rules

## User Specifications Summary
- Source: User-provided detailed analysis and technical specification `FIX-ANCHOR-GENERATION-002`
- Key Requirements: 
  - Fix `generateSlug` method in `LinkVerifier.ts` to match Telegra.ph behavior exactly
  - Remove incorrect markdown cleaning from `getAnchorsForFile`
  - Update `generateTocAside` in `markdownConverter.ts` to use same algorithm
  - Preserve Markdown symbols, character case, and most punctuation
  - Only remove `<>` characters and replace spaces with hyphens
- Constraints: 
  - Must maintain backward compatibility with existing content
  - Algorithm must be identical in both LinkVerifier and markdownConverter
  - Performance should not be significantly impacted

## Previous Phase Results
- VAN Analysis: Comprehensive research conducted using `scripts/research_anchors.ts`
- Research revealed exact mapping between source headings and generated anchors
- Identified that current implementation incorrectly removes Markdown and changes case
- Confirmed that Telegra.ph preserves most symbols and only transforms spaces and removes `<>`

## Current Phase Objectives
- Phase: IMPLEMENT
- Goals: 
  - Implement correct `generateSlug` algorithm in `LinkVerifier.ts`
  - Remove `cleanMarkdownString` call from `getAnchorsForFile`
  - Update anchor generation in `generateTocAside` method
  - Update all related tests to reflect new behavior
  - Verify all research test cases pass validation
- Success Criteria: 
  - All test cases from research pass validation
  - No false "broken link" errors for valid anchors
  - TOC generates correct anchor links with proper formatting
  - All existing tests updated and passing

## Implementation Strategy
1. **Phase 1**: Update `LinkVerifier.ts`
   - Replace `generateSlug` implementation
   - Remove markdown cleaning from `getAnchorsForFile`
   - Update related unit tests

2. **Phase 2**: Update `markdownConverter.ts`
   - Update anchor generation in `generateTocAside`
   - Add `processInlineMarkdown` for TOC link text formatting
   - Update related unit tests

3. **Phase 3**: Integration Testing
   - Run research validation script
   - Test with real content files
   - Verify no regressions in existing functionality

4. **Phase 4**: Documentation
   - Update `src/doc/anchors.md` with correct algorithm
   - Document research methodology and findings
   - Update inline code comments

## Risk Mitigation
- Comprehensive test coverage to prevent regressions
- Gradual implementation with validation at each step
- Preserve existing test structure while updating expected results