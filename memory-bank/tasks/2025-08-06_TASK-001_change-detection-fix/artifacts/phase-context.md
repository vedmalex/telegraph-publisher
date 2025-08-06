# Integrated Phase Context - Change Detection System Fix

## Task Overview
**Task ID**: 2025-08-06_TASK-001_change-detection-fix  
**Context Created**: 2025-08-06_11-23  
**Current Phase**: CREATIVE → IMPLEMENT (Ready for Implementation)

## User Specifications Summary
**Source**: User logs and problem description, captured in `artifacts/specs/requirements.md`

### Key User Requirements:
1. **Двойная проверка**: timestamp (mtime) + content hash для точной детекции изменений
2. **Хранение дат**: дата создания и обновления должны храниться в кэшах
3. **Корректный --force**: флаг должен применяться ко всем файлам в цепочке зависимостей
4. **Полная валидация**: в обычном режиме проверять все связанные файлы
5. **Селективное обновление**: обновлять только действительно изменённые файлы

### Critical User Pain Points:
- Изменённые файлы показывают "(content hash already present)" и пропускаются
- Флаг `--force` не работает для зависимостей  
- Отсутствует первичная проверка времени модификации файла

## Previous Phase Results

### VAN Analysis Key Findings:
**Source**: `analysis.md` 
- **Root Cause**: Inadequate change detection в `editWithMetadata` (строки 396-414)
- **Force Issue**: Hardcoded `forceRepublish: true` в `handlePublishedFile` (строки 940-948)
- **Missing Timestamp Cache**: AnchorCacheEntry не содержит mtime field
- **Complexity**: Medium, standard workflow recommended

### PLAN Phase Key Decisions:
**Source**: `plan.md`
- **24 hierarchical tasks** across 4 main areas: Cache Enhancement, Core Refactoring, Force Fix, Testing
- **Phased approach**: Foundation → Core Implementation → Integration → Validation
- **Risk mitigation**: Incremental implementation with rollback capability
- **Dependencies mapped**: Clear execution order established

### CREATIVE Phase Key Decisions:
**Source**: `creative.md`

#### Design Pattern 1: TimestampFirstValidator
- **Pattern**: Two-Stage Validation Pipeline (Strategy + Performance Optimization)
- **Performance**: 99% fast path (timestamp only), 1% slow path (hash calculation)
- **API**: `validateChangeStatus(filePath, metadata): ValidationResult`

#### Design Pattern 2: ForcePropagationChain  
- **Pattern**: Chain of Responsibility + Command Pattern
- **Context**: Rich force context with origin tracking (`user-cli`, `system-backfill`, `dependency-cascade`)
- **API**: `fromCliFlag(force) → propagateToChild(file) → shouldBypassValidation()`

#### Design Pattern 3: VersionedCacheAdapter
- **Pattern**: Adapter + Versioned Migration
- **Migration**: V1.0 → V1.1 with mtime field addition
- **Guarantee**: Zero data loss, automatic upgrade, fallback safety

#### Design Pattern 4: ResilientChangeDetector
- **Pattern**: Circuit Breaker + Graceful Degradation  
- **Fallbacks**: Timestamp → Hash → Conservative republish
- **Recovery**: <100ms fallback time for failed operations

#### Design Pattern 5: BehaviorMatrix Test Suite
- **Pattern**: Matrix Testing (4×4×4 = 64 scenarios)
- **Dimensions**: File states × Force contexts × Cache states
- **Execution**: Parallel test execution for quick feedback

## Current Phase Objectives

### IMPLEMENT Phase Goals:
1. **Implement TimestampFirstValidator**: Two-stage validation with performance optimization
2. **Implement ForcePropagationChain**: Correct force flag propagation through dependency chain
3. **Enhance AnchorCacheManager**: Add mtime field with backward compatibility
4. **Fix editWithMetadata logic**: Replace hash-only check with timestamp-first approach
5. **Create comprehensive tests**: 85% coverage with behavior matrix testing

### Success Criteria for Implementation:
- ✅ All 24 plan items implemented with creative design patterns
- ✅ User requirements FR-001 through FR-004 fully satisfied
- ✅ Technical requirements TR-001 through TR-003 implemented
- ✅ Quality requirements QR-001 through QR-003 achieved
- ✅ Zero regression: all existing functionality preserved

## Resolved Conflicts

### Conflict 1: Performance vs Accuracy
**Issue**: Hash calculation is expensive but necessary for accuracy
**Resolution**: Two-stage validation - timestamp first (fast), hash second (accurate)
**Implementation**: TimestampFirstValidator with conditional hash calculation

### Conflict 2: Force Flag Scope  
**Issue**: Unclear whether force should apply to dependencies or just root file
**Resolution**: Force flag applies to entire dependency chain when user specifies --force
**Implementation**: ForcePropagationChain with clear origin tracking

### Conflict 3: Cache Compatibility
**Issue**: Adding mtime field breaks existing cache files
**Resolution**: Versioned migration with automatic upgrade and fallback
**Implementation**: VersionedCacheAdapter with graceful degradation

## Implementation Context for IMPLEMENT Phase

### Priority Files to Modify:
1. **`src/cache/AnchorCacheManager.ts`** - Add mtime field and migration logic  
2. **`src/publisher/EnhancedTelegraphPublisher.ts`** - Replace change detection logic
3. **Test files** - Comprehensive behavior matrix test suite
4. **Type definitions** - Enhance interfaces for new functionality

### Key Implementation Principles:
- **Backward Compatibility**: All existing cache files must continue working
- **Performance First**: Optimize for the common case (unchanged files)  
- **Error Resilience**: Graceful fallbacks for all failure scenarios
- **Clear Logging**: Transparent user feedback for all decisions
- **Type Safety**: Strong TypeScript typing for all new APIs

### Traceability to User Requirements:
- **FR-001** → TimestampFirstValidator implementation
- **FR-002** → ForcePropagationChain implementation  
- **FR-003** → Enhanced dependency validation in publishDependencies
- **FR-004** → AnchorCacheManager mtime field addition

### Integration Points:
- **CLI Integration**: Force flag propagation from command line
- **Cache Integration**: Enhanced cache with timestamp support
- **Publisher Integration**: New change detection logic in editWithMetadata
- **Error Integration**: Resilient error handling throughout

## Ready for Implementation

**All prerequisites completed**:
✅ User requirements fully captured and analyzed  
✅ Technical analysis completed with root cause identification
✅ Comprehensive implementation plan with 24 specific tasks
✅ Creative architecture designed with proven patterns
✅ Conflicts resolved with clear implementation guidance
✅ Success criteria defined with measurable outcomes

**Next Steps**:
1. Begin Phase 1: Cache Infrastructure Enhancement (Tasks 1.1-1.2)
2. Proceed to Phase 2: Core Change Detection Refactoring (Tasks 2.1-2.2)  
3. Implement Phase 3: Force Flag Propagation Fix (Tasks 3.1-3.2)
4. Complete Phase 4: Comprehensive Testing Strategy (Tasks 4.1-4.2) 