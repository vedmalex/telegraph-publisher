# Integrated Phase Context - Fix Link Anchor Replacement

## User Specifications Summary
- **Source:** User-provided comprehensive technical specification with evidence files
- **Key Requirements:**
  - Preserve URL fragments (anchors) during link replacement in ContentProcessor.ts
  - Maintain backward compatibility for links without anchors
  - Support Unicode/Cyrillic characters in anchors
  - Comprehensive test coverage (85% minimum)
- **Constraints:**
  - Must not break existing functionality
  - Performance should not be significantly impacted
  - Implementation must follow project coding conventions
- **Evidence Quality:** Excellent - user provided actual bug examples and precise root cause analysis

## VAN Phase Results Summary
- **Problem Location Confirmed:** `src/content/ContentProcessor.ts` method `replaceLinksInContent` lines 156-164
- **Root Cause Validated:** Line 159 `replacementMap.set(link.originalPath, telegraphUrl)` loses anchor
- **Solution Approach:** Extract anchor from `originalPath`, append to `telegraphUrl` before setting in map
- **Risk Assessment:** Low risk - changes localized to single method
- **Current Test Gap:** No tests for anchor preservation scenarios

## Current Phase Objectives
- **Phase:** PLAN
- **Goals:**
  - Create detailed implementation plan for anchor preservation logic
  - Define comprehensive test strategy covering all anchor scenarios
  - Plan validation methodology to ensure no regressions
  - Establish clear success metrics and acceptance criteria
- **Success Criteria:**
  - Complete implementation plan ready for execution
  - All test cases defined with clear expected results
  - Validation strategy confirmed
  - Plan aligns with user specifications and VAN analysis

## Technical Context
**Current Logic Flow:**
1. `processedContent.localLinks` contains links with `originalPath` (includes anchors) and `resolvedPath` (file only)
2. `linkMappings.get(link.resolvedPath)` gets base Telegraph URL for file
3. `replacementMap.set(link.originalPath, telegraphUrl)` replaces full path+anchor with base URL
4. **ANCHOR IS LOST HERE**

**Required Logic Enhancement:**
1. Extract anchor from `link.originalPath` using `indexOf('#')`
2. If anchor exists, append to `telegraphUrl`
3. Use enhanced URL in `replacementMap` and `link.telegraphUrl`

## Evidence Integration
- **BUG/index.md** demonstrates original content with proper anchor links
- **BUG/index.json.md** shows final output missing anchors in Telegraph URLs
- **BUG/.telegraph-pages-cache.json** shows URL mappings used in replacement process
- **Analysis confirms:** Issue is systematic, affects all anchor links

## Next Phase Requirements
**PLAN Phase must deliver:**
1. **Detailed Code Changes:** Exact implementation for anchor preservation logic
2. **Test Strategy:** Comprehensive test cases covering all scenarios
3. **Integration Plan:** Approach for testing with existing functionality
4. **Validation Plan:** How to confirm fix works correctly without regressions