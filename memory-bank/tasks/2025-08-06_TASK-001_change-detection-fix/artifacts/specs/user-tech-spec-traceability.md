# User Technical Specification Traceability

## Source Documentation
**User Provided**: Comprehensive technical specification in first message  
**Integration Date**: 2025-08-06_11-23  
**Status**: Fully integrated into all phases

## Direct Mapping: User Spec → Implementation Plan

### **1. Cache Schema Modification**
**User Specification**:
```typescript
interface AnchorCacheEntry {
  contentHash: string;
  anchors: string[];
  mtime: string; // <-- ADD THIS
}
```

**→ Mapped to Implementation**:
- **Plan Task**: 1.1.1 Add mtime field to AnchorCacheEntry interface
- **Creative Pattern**: VersionedCacheAdapter with migration strategy
- **Target File**: `src/cache/AnchorCacheManager.ts`
- **Success Criteria**: FR-004 (Timestamp storage in cache)

### **2. Anchor Cache Validation Logic**
**User Specification**:
```typescript
public getAnchorsIfValid(filePath: string, currentContentHash: string): CacheValidationResult {
  // 1. Timestamp Check (Primary)
  const currentMtime = fs.statSync(filePath).mtime.toISOString();
  if (entry.mtime !== currentMtime) {
    return { valid: false, reason: 'timestamp-changed' };
  }
  // 2. Hash Check (Secondary)
  // 3. Cache is valid
}
```

**→ Mapped to Implementation**:
- **Plan Task**: 1.2.1 Modify getAnchorsIfValid to check mtime first
- **Creative Pattern**: TimestampFirstValidator (two-stage validation)
- **VAN Analysis**: R1 (Timestamp-Based Primary Validation)
- **Performance Target**: <1ms for timestamp check (99% fast path)

### **3. Publication Change Detection**
**User Specification**:
```typescript
// 1. --force OVERRIDE
if (!forceRepublish) {
    // 2. TIMESTAMP CHECK
    const currentMtime = fs.statSync(filePath).mtime.toISOString();
    const lastPublishedTime = existingMetadata.publishedAt;
    
    if (currentMtime > lastPublishedTime) {
        // 3. HASH CHECK (only if timestamp is newer)
        const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);
    }
}
```

**→ Mapped to Implementation**:
- **Plan Task**: 2.1.2 Implement timestamp-first validation logic
- **Plan Task**: 2.1.3 Add conditional hash calculation based on mtime changes
- **Creative Pattern**: TimestampFirstValidator with conditional hash calculation
- **Target Location**: `editWithMetadata` method refactoring
- **Success Criteria**: FR-001 (Двойная проверка изменений)

### **4. Force Flag Propagation**
**User Specification**:
```typescript
// Pseudocode for loop in publishDependencies
for (const fileToProcess of analysis.publishOrder) {
    if (options.force) {
        // If force is enabled, always force republish dependencies.
        const result = await this.publishWithMetadata(fileToProcess, username, 
          { ...options, forceRepublish: true, withDependencies: false });
    } else {
        // Standard mode: let publishWithMetadata/editWithMetadata handle change detection.
        const result = await this.publishWithMetadata(fileToProcess, username, 
          { ...options, withDependencies: false });
    }
}
```

**→ Mapped to Implementation**:
- **Plan Task**: 3.2.2 Implement force flag propagation in publishDependencies loop
- **Creative Pattern**: ForcePropagationChain from CLI to dependencies
- **VAN Analysis**: Problem 2 (Force Flag Not Propagating to Dependencies)
- **Success Criteria**: FR-002 (Корректная работа флага --force)

### **5. Acceptance Criteria → Requirements**
**User AC** → **My FR (Functional Requirements)**:

| User AC | Description | Mapped FR | Implementation |
|---------|-------------|-----------|----------------|
| AC1 | Modified File Detection | FR-001 | TimestampFirstValidator pattern |
| AC2 | Unmodified File Skipping | FR-001 | Fast path optimization |
| AC3 | Forced Republication | FR-002 | ForcePropagationChain pattern |
| AC4 | Dependency-Only Update | FR-003 | ResilientChangeDetector |
| AC5 | Cache Updates | FR-004 | VersionedCacheAdapter migration |

## Code Location Mapping

### **User Specified Files** → **Implementation Targets**:

1. **`src/cache/AnchorCacheManager.ts`**:
   - User: Interface modification + getAnchorsIfValid + updateAnchors
   - Implementation: Plan tasks 1.1.1-1.2.4, VersionedCacheAdapter pattern

2. **`src/publisher/EnhancedTelegraphPublisher.ts`**:
   - User: editWithMetadata change detection + publishDependencies loop
   - Implementation: Plan tasks 2.1.1-2.1.4 + 3.2.1-3.2.3

3. **`src/workflow/PublicationWorkflowManager.ts`**:
   - User: Force flag propagation verification
   - Implementation: Plan task 3.1.1, CLI integration validation

## Message Integration Verification

### **User Logging Specifications** → **Implementation**:
**User Expected Logs**:
```
📄 Content timestamp changed, but hash is identical. Skipping publication
📄 Content unchanged (timestamp check). Skipping publication  
⚙️ --force flag detected. Forcing republication
```

**→ Mapped to UX Requirements**:
- UX-001: Informative Logging in requirements.md
- Creative Decision: Clear user feedback patterns
- Plan validation through integration tests 4.2.1-4.2.4

### **Performance Expectations** → **Technical Requirements**:
**User Expectation**: Fast timestamp check, conditional hash calculation  
**→ Mapped to TR-001**: <1ms timestamp validation, 99% fast path optimization

## Quality Assurance Alignment

### **User AC** → **Test Strategy**:
- **AC1-AC2**: Unit tests 4.1.1, 4.1.2 (timestamp + hash validation)
- **AC3**: Unit tests 4.1.3, 4.1.4 (force flag propagation)  
- **AC4**: Integration tests 4.2.1, 4.2.3 (dependency validation)
- **AC5**: Integration test 4.2.2 (cache update verification)

### **Comprehensive Coverage**:
- **64 test scenarios** from BehaviorMatrix pattern covering all user AC
- **Regression protection** ensuring no existing functionality breaks
- **Performance validation** confirming <1ms timestamp targets

## Implementation Readiness Confirmation

✅ **All user specification elements captured**  
✅ **Direct code location mapping established**  
✅ **Performance expectations translated to technical requirements**  
✅ **Quality criteria mapped to comprehensive test strategy**  
✅ **Logging specifications integrated into UX requirements**

**User Technical Specification Status**: **FULLY INTEGRATED** across VAN → PLAN → CREATIVE phases

---

*This document demonstrates complete integration of the user's technical specification into the Memory Bank 2.0 workflow, ensuring no requirements or implementation details were missed.* 