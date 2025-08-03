# Traceability Matrix - Content Hashing for Change Detection

## Specification to Implementation Mapping

| Spec ID  | Requirement                   | VAN Reference                       | Plan Item       | Implementation                                               | Test Coverage | Status        |
| -------- | ----------------------------- | ----------------------------------- | --------------- | ------------------------------------------------------------ | ------------- | ------------- |
| REQ-001  | Content hash field addition   | analysis.md#content-hash-strategy   | plan.md#1.1     | src/types/metadata.ts#FileMetadata:59                        | MetadataManager.test.ts | ✅ Complete |
| REQ-002  | SHA-256 content hashing       | analysis.md#hash-calculation        | plan.md#2.1     | src/publisher/EnhancedTelegraphPublisher.ts:667-679          | EnhancedTelegraphPublisher.test.ts | ✅ Complete |
| REQ-003  | Hash comparison skip logic    | analysis.md#hash-check-integration  | plan.md#4.1     | src/publisher/EnhancedTelegraphPublisher.ts:309-326          | EnhancedTelegraphPublisher.test.ts | ✅ Complete |
| REQ-004  | Force republish override      | analysis.md#force-flag-handling     | plan.md#4.2     | src/publisher/EnhancedTelegraphPublisher.ts:309              | EnhancedTelegraphPublisher.test.ts | ✅ Complete |
| REQ-005  | Hash update after publication | analysis.md#integration-points      | plan.md#4.1.2   | src/publisher/EnhancedTelegraphPublisher.ts:387-394          | EnhancedTelegraphPublisher.test.ts | ✅ Complete |
| TECH-001 | calculateContentHash method   | analysis.md#implementation-strategy | plan.md#2.1.1   | src/publisher/EnhancedTelegraphPublisher.ts:667-679          | EnhancedTelegraphPublisher.test.ts | ✅ Complete |
| TECH-002 | MetadataManager updates       | analysis.md#metadata-integration    | plan.md#3.1-3.2 | src/metadata/MetadataManager.ts:328-346,370-371,91-93       | MetadataManager.test.ts | ✅ Complete |
| TECH-003 | Console feedback enhancement  | analysis.md#user-experience         | plan.md#6.1     | src/publisher/EnhancedTelegraphPublisher.ts:313-315          | EnhancedTelegraphPublisher.test.ts | ✅ Complete |

## VAN Analysis Cross-References

### Current Infrastructure → Requirements Mapping
- **Existing FileMetadata interface** → REQ-001 (Content hash field)
- **Existing MetadataManager serialization** → REQ-002 (Hash storage)
- **Existing editWithMetadata workflow** → REQ-003 (Skip logic integration)
- **Existing options handling** → REQ-004 (Force republish flag)

### VAN Findings → Implementation Strategy
- **Analysis: SHA-256 algorithm selection** → TECH-001 (calculateContentHash implementation)
- **Analysis: MetadataManager integration points** → TECH-002 (Parsing/serialization updates)
- **Analysis: User experience enhancement** → TECH-003 (Console feedback implementation)
- **Analysis: Zero breaking changes** → All implementations (Compatibility requirement)

## Phase Decision Evolution

### VAN Phase Decisions → PLAN Phase Items
1. **Hash Algorithm**: SHA-256 selection → Implementation planning for calculateContentHash
2. **Integration Strategy**: Enhance existing methods → Detailed modification plan needed
3. **Performance Approach**: Minimal overhead design → Hash calculation optimization planning
4. **Error Handling**: Fail-safe fallback → Comprehensive error handling planning

## Current Implementation Status

### Existing Infrastructure (from VAN analysis)
- ✅ **FileMetadata Interface**: Well-structured with extensible design (lines 43-58)
- ✅ **MetadataManager**: Robust parsing and serialization (lines 348-366)
- ✅ **EnhancedTelegraphPublisher**: Clear integration points (lines 304-354)
- ✅ **Content Processing**: ContentProcessor provides content without metadata

### Pending Implementation (identified in VAN)
- 🔴 **calculateContentHash method**: SHA-256 hash calculation
- 🔴 **FileMetadata enhancement**: Add optional contentHash field
- 🔴 **MetadataManager updates**: Parse and serialize contentHash
- 🔴 **Skip logic integration**: Hash comparison in editWithMetadata
- 🔴 **Force republish handling**: Bypass hash check when requested
- 🔴 **Console feedback**: User-friendly skip notifications

## Test Coverage Mapping

### Required Test Categories
- 🔴 **Hash calculation tests**: Various content types and edge cases
- 🔴 **Skip logic tests**: Unchanged content handling
- 🔴 **Force republish tests**: Hash bypass functionality
- 🔴 **Integration tests**: Full publication workflow with hashing
- 🔴 **Metadata tests**: Parsing and serialization of contentHash
- 🔴 **Performance tests**: Hash calculation overhead measurement

### Integration Points Testing
- 🔴 **editWithMetadata**: Hash check integration testing
- 🔴 **publishWithMetadata**: Hash storage testing
- 🔴 **MetadataManager**: contentHash field handling
- 🔴 **Error scenarios**: Hash calculation failure handling

## Acceptance Criteria Traceability

| Acceptance Criteria                                          | VAN Analysis Reference             | Implementation Plan               | Test Plan                              |
| ------------------------------------------------------------ | ---------------------------------- | --------------------------------- | -------------------------------------- |
| After file published first time, YAML contains contentHash   | analysis.md#metadata-integration   | plan.md#3.2.1 (serializeMetadata) | plan.md#7.2.1 (workflow tests)         |
| Running publish on unchanged file shows "Skipping" message   | analysis.md#user-experience        | plan.md#6.1.1 (console feedback)  | plan.md#7.1.2 (skip logic tests)       |
| YAML-only changes still skip publication                     | analysis.md#hash-target            | plan.md#4.1.1 (hash check logic)  | plan.md#7.2.1 (integration tests)      |
| Markdown content changes trigger publication and update hash | analysis.md#hash-check-integration | plan.md#4.1.2 (hash update)       | plan.md#7.2.1 (workflow tests)         |
| --force-republish flag bypasses hash check                   | analysis.md#force-flag-handling    | plan.md#4.2.1 (force republish)   | plan.md#7.1.2 (force flag tests)       |
| 85% test coverage for new functionality                      | analysis.md#success-metrics        | plan.md#8.1 (quality assurance)   | plan.md#7.1-7.2 (all test categories)  |
| 100% test success rate maintained                            | analysis.md#success-metrics        | plan.md#8.2.1 (compatibility)     | plan.md#8.2 (compatibility validation) |

## Dependencies and Integration Points

### Internal Dependencies (from VAN analysis)
- **Node.js crypto module**: SHA-256 hash calculation (crypto.createHash)
- **FileMetadata interface**: Extensible structure ready for enhancement
- **MetadataManager**: Established parsing and serialization infrastructure
- **EnhancedTelegraphPublisher**: Clear integration points in publication workflow

### External Dependencies
- **Node.js crypto**: Available in standard library - No additional dependencies
- **Test framework**: bun:test - Already configured

## Risk Mitigation Mapping

| Risk (from VAN)                | Mitigation Strategy                                 | Implementation Consideration              |
| ------------------------------ | --------------------------------------------------- | ----------------------------------------- |
| Force flag handling complexity | Clear boolean check before hash comparison          | Implement early in method flow            |
| Content processing consistency | Use same processed content for hash and publication | Hash after ContentProcessor.processFile() |
| Hash calculation failures      | Graceful fallback to publication with warning       | Try-catch around hash calculation         |
| Backward compatibility         | Optional field addition with fallback behavior      | Treat missing hash as "needs publication" |

## Future Enhancement Hooks

### Planned Extensions
- **Configurable hash algorithms**: Support for different hashing methods
- **Content change metrics**: Track change frequency and patterns
- **Incremental publishing**: Smart dependency republication based on changes
- **Hash verification**: Integrity checks for published content

### Architecture Considerations
- **Hash algorithm abstraction**: Strategy pattern for future algorithm support
- **Change detection events**: Hook points for change notification systems
- **Performance monitoring**: Hash calculation time tracking and optimization
- **Content fingerprinting**: Extended change detection beyond simple hash comparison