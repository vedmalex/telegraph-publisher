# Integrated Phase Context - Fix Markdown Anchor Generation

## User Specifications Summary
- **Source:** User-provided detailed VAN analysis and technical specification
- **Key Requirements:** Fix anchor generation in LinkVerifier to handle Markdown formatting correctly
- **Constraints:** Use existing `cleanMarkdownString` function, maintain backward compatibility
- **Technical Focus:** Modify `getAnchorsForFile` method in `src/links/LinkVerifier.ts`

## Problem Context
User identified a critical bug where `LinkVerifier` generates anchors that include Markdown formatting symbols (`**`, `*`, etc.), causing valid links to be reported as broken. The issue affects headings like `## **Bold Title**` which should generate anchor `Bold-Title` but currently generates `**Bold-Title**`.

## Current Phase Objectives
- **Phase:** VAN (Vision & Analysis)
- **Goals:** Complete technical analysis and create implementation-ready specification
- **Success Criteria:** Clear understanding of problem scope, solution approach, and implementation requirements

## Key Decisions
1. **Solution Approach:** Use existing `cleanMarkdownString` function to strip Markdown before slug generation
2. **Target Method:** Focus on `getAnchorsForFile` in `LinkVerifier.ts`
3. **Testing Strategy:** Add comprehensive unit tests for various Markdown formatting scenarios
4. **Risk Assessment:** Low risk change with isolated impact

## Implementation Strategy
1. Import `cleanMarkdownString` from `../clean_mr`
2. Add cleaning step before `generateSlug` call
3. Maintain existing caching and error handling
4. Add comprehensive test coverage

## Next Phase Preparation
Ready to proceed directly to IMPLEMENTATION phase as specification is comprehensive and implementation-ready.