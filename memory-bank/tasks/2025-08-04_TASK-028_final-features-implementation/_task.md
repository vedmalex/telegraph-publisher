# Task Definition - Final Features Implementation (UPDATED)

**Task ID:** TASK-028
**Created:** 2025-08-04_17-05
**Last Updated:** 2025-08-04_17-15
**Status:** 🔴 Critical Bug - Implementation Required
**Phase:** PLAN

## Objective (UPDATED)
Fix critical bug in Telegraph Publisher ToC generation and implement missing hash backfill validation:
1. **🔴 CRITICAL**: Fix nested link bug in Table of Contents generation for heading-links
2. **✅ VALIDATE**: Confirm content hash backfill system functionality

## User Bug Report
**Evidence**: `BUG/index.json`, `BUG/index.md`, `BUG/sample_index.htm`
**Issue**: ToC for `## [Аналогии](./аналогии.md)` creates nested links instead of plain text

## Updated Specifications Summary
**FEAT-ASIDE-ENHANCEMENT-001**: 🔴 **CRITICAL BUG FOUND**
- Root cause: `markdownConverter.ts:218` uses `processInlineMarkdown()` for ToC text
- Impact: Creates nested `<a>` tags in ToC for heading-links
- Required fix: Use plain text extraction instead of Markdown processing

**FEAT-HASH-BACKFILL-001**: ✅ **CONFIRMED IMPLEMENTED**
- System correctly backfills contentHash for dependencies
- No changes required, validation only

## Success Criteria (UPDATED)
1. **ToC Fix**: Heading `## [Structure](./file.md)` should generate ToC with plain text "Structure" and anchor `#Structure`
2. **No Nested Links**: ToC must never contain nested `<a>` tags
3. **CLI Control**: `publish --[no-]aside` options must work correctly
4. **Backward Compatibility**: Normal headings continue to work
5. **User Examples**: Fix must work for specific examples in bug report
6. **Hash Backfill**: Validation only - confirm existing functionality

## Current Phase: PLAN
- [x] Analyze user bug report evidence
- [x] Identify root cause in `markdownConverter.ts`
- [x] Update task scope and requirements
- [ ] Design exact fix implementation
- [ ] Create comprehensive test strategy
- [ ] Plan validation against user examples

## Critical Priority
**Bug Severity**: HIGH - Affects user navigation experience
**Implementation Urgency**: Immediate - Clear fix required
**Risk Level**: LOW - Simple, well-defined change

## Dependencies
- Existing Telegraph Publisher system ✅
- CLI command structure ✅
- Metadata management system ✅
- Markdown converter functionality 🔴 **NEEDS FIX**