# Implementation Plan: Metadata Restore Access Token Fix

**Phase:** PLAN (Hierarchical Planning)
**Date:** 2025-08-07_01-38
**Status:** 🔄 Active Planning

## Plan Overview

### Strategic Objectives:
1. **Eliminate PAGE_ACCESS_DENIED errors** для cached files
2. **Complete cache system integration** с accessToken functionality
3. **Maintain backward compatibility** с предыдущей версией behavior
4. **Ensure robust fallback mechanisms** для legacy cache entries

### Implementation Phases: **6 phases, 19 items total**

## Progress Overview
- **Total Items:** 19
- **Completed:** 0
- **In Progress:** 0 
- **Blocked:** 0
- **Not Started:** 19

---

## 1. Data Model Foundation [🔴 Not Started]

### 1.1 PublishedPageInfo Interface Enhancement [🔴 Not Started]
**Requirement:** R1 - Critical
**Risk Level:** Low
**Dependencies:** None

#### 1.1.1 Add accessToken field to PublishedPageInfo [🔴 Not Started]
- **File:** `src/types/metadata.ts`
- **Action:** Добавить `accessToken?: string` в interface definition
- **Validation:** TypeScript compilation success
- **Notes:** Optional field для backward compatibility

#### 1.1.2 Update cache version number [🔴 Not Started]  
- **File:** `src/types/metadata.ts`
- **Action:** Increment cache version для explicit compatibility
- **Validation:** Version number increased
- **Notes:** Clear migration path documentation

#### 1.1.3 Validate interface backward compatibility [🔴 Not Started]
- **Action:** Ensure existing cache files remain functional
- **Validation:** All existing tests pass
- **Notes:** Optional field должно не break existing code

---

## 2. Configuration Integration [🔴 Not Started]

### 2.1 Directory Config Token Support [🔴 Not Started]
**Requirement:** R7 - High
**Risk Level:** Low
**Dependencies:** 1.1 (Data Model)

#### 2.1.1 Analyze existing ConfigManager functionality [🔴 Not Started]
- **Action:** Review `ConfigManager.loadAccessToken(directory)` implementation
- **Validation:** Understand current directory config loading logic
- **Notes:** ✅ Infrastructure already exists

#### 2.1.2 Design token resolution hierarchy [🔴 Not Started]
- **Priority Order:** Cache accessToken → Directory config → Global config
- **Validation:** Clear fallback logic documented
- **Notes:** Match предыдущая версия behavior

#### 2.1.3 Implement getEffectiveAccessToken helper [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Create method для token resolution с fallback
- **Signature:** `private getEffectiveAccessToken(filePath: string, cacheToken?: string): string`
- **Validation:** Returns correct token based on hierarchy

---

## 3. Cache System Enhancement [🔴 Not Started]

### 3.1 Cache Population Logic Update [🔴 Not Started]
**Requirement:** R2 - Critical  
**Risk Level:** Medium
**Dependencies:** 2.1 (Config Integration)

#### 3.1.1 Modify addPage method signature [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts` (lines 126-135)
- **Action:** Include accessToken parameter в pageInfo creation
- **Validation:** All addPage calls updated correctly
- **Notes:** Pass current accessToken to cache

#### 3.1.2 Update pageInfo creation logic [🔴 Not Started]
- **Action:** Add `accessToken: this.currentAccessToken` в pageInfo object
- **Validation:** Cache entries include accessToken field
- **Notes:** Future cache entries будут complete

#### 3.1.3 Validate cache storage functionality [🔴 Not Started]
- **Action:** Test that new cache entries contain accessToken
- **Validation:** Cache file inspection shows accessToken field
- **Notes:** Verify storage and retrieval work correctly

---

## 4. Restore Logic Enhancement [🔴 Not Started]

### 4.1 Core Restore Logic [🔴 Not Started]
**Requirement:** R3 - Critical
**Risk Level:** High  
**Dependencies:** 3.1 (Cache Enhancement)

#### 4.1.1 Analyze current restore logic [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts` (lines 208-216)
- **Action:** Review current restoredMetadata creation
- **Validation:** Understand current field mapping
- **Notes:** Identify accessToken addition point

#### 4.1.2 Implement cache accessToken extraction [🔴 Not Started]
- **Action:** Extract `cacheInfo.accessToken` if available
- **Validation:** Cache token correctly retrieved
- **Notes:** Handle undefined gracefully

#### 4.1.3 Add accessToken to restoredMetadata [🔴 Not Started]
- **Action:** Include accessToken field в restoredMetadata object
- **Validation:** Restored metadata contains accessToken
- **Notes:** Core restore functionality enhanced

### 4.2 Fallback Strategy Implementation [🔴 Not Started]
**Requirement:** R4 - High
**Risk Level:** Medium
**Dependencies:** 4.1 (Core Restore), 2.1 (Config Integration)

#### 4.2.1 Implement legacy cache handling [🔴 Not Started]
- **Action:** Detect cache entries без accessToken
- **Validation:** Legacy detection logic works
- **Notes:** Graceful handling старых cache entries

#### 4.2.2 Integrate directory config fallback [🔴 Not Started]
- **Action:** Use `getEffectiveAccessToken()` для fallback token resolution
- **Validation:** Directory config token используется correctly
- **Notes:** Предыдущая версия compatibility

### 4.3 Token Backfill Implementation [🔴 Not Started]
**Requirement:** R8 - Critical
**Risk Level:** Medium  
**Dependencies:** 4.2 (Fallback Strategy)

#### 4.3.1 Design token backfill pattern [🔴 Not Started]
- **Action:** Define logic для saving fallback token в file metadata
- **Validation:** Clear backfill strategy documented
- **Notes:** Ensure future edits use correct token

#### 4.3.2 Implement token backfill logic [🔴 Not Started]
- **Action:** Save fallback token в restored metadata when cache missing accessToken
- **Validation:** File metadata contains correct token after restore
- **Notes:** Complete cycle - restore → backfill → future edits

#### 4.3.3 Validate token persistence [🔴 Not Started]
- **Action:** Test that backfilled tokens persist correctly
- **Validation:** Subsequent operations use file metadata token
- **Notes:** No repeated config lookups needed

---

## 5. Diagnostics & Monitoring [🔴 Not Started]

### 5.1 Enhanced Logging [🔴 Not Started]
**Requirement:** R5 - Medium
**Risk Level:** Low
**Dependencies:** 4.3 (Token Backfill)

#### 5.1.1 Design logging strategy [🔴 Not Started]
- **Action:** Define log messages для token resolution path
- **Validation:** Clear logging hierarchy documented
- **Notes:** Cache → Directory → Global → Backfill visibility

#### 5.1.2 Implement token source logging [🔴 Not Started]
- **Action:** Add console.log statements для token resolution
- **Format:** `🔑 Token source: [cache|directory|global] for file: [filename]`
- **Validation:** Logs show clear token provenance
- **Notes:** Debugging и monitoring support

### 5.2 Error Diagnostics Enhancement [🔴 Not Started]
**Requirement:** R6 - Medium
**Risk Level:** Low
**Dependencies:** 5.1 (Enhanced Logging)

#### 5.2.1 Enhance PAGE_ACCESS_DENIED error messages [🔴 Not Started]
- **Action:** Add context о token source в error messages
- **Validation:** Error messages provide actionable information
- **Notes:** Better troubleshooting для users

#### 5.2.2 Implement token mismatch detection [🔴 Not Started]
- **Action:** Detect и report token inconsistencies
- **Validation:** Clear indication когда tokens don't match
- **Notes:** Proactive issue identification

---

## 6. Quality Assurance [🔴 Not Started]

### 6.1 Comprehensive Testing [🔴 Not Started]
**Requirement:** R9 - High
**Risk Level:** Medium
**Dependencies:** All previous phases

#### 6.1.1 Create cache restore test scenarios [🔴 Not Started]
- **Action:** Design test cases для all cache restore scenarios
- **Scenarios:** Cache with/without accessToken, directory/global fallback, token backfill
- **Validation:** Complete test coverage documented
- **Notes:** Edge cases и error conditions included

#### 6.1.2 Implement unit tests [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.metadata-restore-fix.test.ts`
- **Action:** Create comprehensive test suite
- **Validation:** All tests pass, 95%+ coverage
- **Notes:** Mock cache entries, config scenarios

#### 6.1.3 Create integration tests [🔴 Not Started]
- **Action:** Test end-to-end cache restore workflow
- **Validation:** Production scenario simulation successful
- **Notes:** PAGE_ACCESS_DENIED elimination confirmed

#### 6.1.4 Validate backward compatibility [🔴 Not Started]
- **Action:** Test с existing cache files и configurations
- **Validation:** No regressions в existing functionality
- **Notes:** Smooth migration path confirmed

---

## Technical Constraints

### Performance Requirements:
- **Token Resolution:** < 5ms additional overhead per restore operation
- **Cache Compatibility:** 100% backward compatibility с existing cache files
- **Memory Usage:** Minimal increase (single string field per cache entry)

### Error Handling Strategy:
- **Graceful Degradation:** Always fallback к available token source
- **Clear Error Messages:** Actionable diagnostics для troubleshooting
- **Robust Recovery:** No operation should fail due to missing accessToken

### Integration Requirements:
- **ConfigManager Integration:** Leverage existing directory config functionality ✅
- **MetadataManager Compatibility:** Use existing YAML handling ✅  
- **Cache Manager Integration:** Extend без breaking changes
- **Publisher Integration:** Seamless integration с existing workflow

## Success Criteria

### Primary Success Metrics:
1. **Zero PAGE_ACCESS_DENIED errors** для files restored from cache
2. **100% cache restore success rate** with proper token resolution
3. **Complete token backfill** для legacy cache entries

### Secondary Success Metrics:
1. **Enhanced logging coverage** showing token resolution path
2. **Improved debugging experience** для token-related issues
3. **Maintained backward compatibility** с all existing functionality

### Quality Gates:
- **All unit tests pass** (95%+ coverage target)
- **Integration tests successful** (production scenario simulation)
- **No performance degradation** (< 5ms overhead)
- **Backward compatibility validated** (existing cache files work)

## Risk Assessment & Mitigation

### High Risk Items:
- **4.1.3 Core Restore Logic**: Critical for eliminating PAGE_ACCESS_DENIED
  - **Mitigation**: Comprehensive testing, incremental implementation
- **4.3.2 Token Backfill**: Complex logic with persistence requirements
  - **Mitigation**: Clear pattern design, validation at each step

### Medium Risk Items:
- **3.1.1 Cache Population**: Multiple call sites need updating
  - **Mitigation**: Systematic review, comprehensive testing
- **4.2.1 Legacy Handling**: Edge cases with old cache formats
  - **Mitigation**: Thorough testing с various cache versions

### Low Risk Items:
- **1.1.1 Interface Changes**: Straightforward type additions
- **5.1.2 Logging**: Non-functional enhancements

## Dependencies & Sequencing

### Critical Path:
**1.1** → **2.1** → **3.1** → **4.1** → **4.2** → **4.3** → **5.1** → **5.2** → **6.1**

### Parallel Execution Opportunities:
- **1.1.2** (Cache version) can be done parallel с **1.1.1** (Interface)
- **5.1** (Logging) can start after **4.1** (Core restore)
- **6.1.1** (Test design) can start early для preparation

### Blocking Dependencies:
- **Token Backfill (4.3)** requires **Fallback Strategy (4.2)**
- **Integration Tests (6.1.3)** require all implementation phases complete
- **Error Diagnostics (5.2)** depends on **Enhanced Logging (5.1)**

**PLAN COMPLETE - READY FOR CREATIVE PHASE** ✅ 