# Implementation Plan - Enhanced Anchor Validation and Reporting

**Task ID:** TASK-019
**Plan Date:** 2025-08-03_22-58
**Phase:** PLAN

## Progress Overview
- Total Items: 15
- Completed: 0
- In Progress: 0
- Blocked: 0
- Not Started: 15

## 1. Core Algorithm Implementation [🔴 Not Started]

### 1.1 String Similarity Algorithm [🔴 Not Started]
#### 1.1.1 Implement calculateSimilarity method [🔴 Not Started]
- **Location**: `src/links/LinkVerifier.ts` (new private method)
- **Specification**: Character-based similarity with optimization for anchor text
- **Algorithm**: Count matching characters divided by longer string length
- **Return**: Number between 0.0 and 1.0
- **Edge Cases**: Handle empty strings, identical strings, special characters

#### 1.1.2 Validate similarity algorithm accuracy [🔴 Not Started]
- **Test Cases**: Various text combinations (English, Cyrillic, mixed)
- **Edge Cases**: Empty strings, identical strings, completely different text
- **Performance**: Verify O(n*m) complexity is acceptable for typical anchor sets
- **Threshold Validation**: Confirm 0.7 threshold produces quality suggestions

### 1.2 Closest Match Finding Logic [🔴 Not Started]
#### 1.2.1 Implement findClosestAnchor method [🔴 Not Started]
- **Location**: `src/links/LinkVerifier.ts` (new private method)
- **Parameters**: `requestedAnchor: string, availableAnchors: Set<string>`
- **Return**: `string | null` (best match or null if below threshold)
- **Logic**: Iterate through available anchors, calculate similarity, return highest score above 0.7
- **Tie Handling**: Return first match in case of identical scores

#### 1.2.2 Handle edge cases in closest match logic [🔴 Not Started]
- **Empty Anchor Set**: Return null gracefully
- **No Matches Above Threshold**: Return null (no poor suggestions)
- **Multiple Equal Scores**: Return first match (deterministic behavior)
- **Unicode Handling**: Ensure proper handling of non-Latin characters

## 2. LinkVerifier Integration [🔴 Not Started]

### 2.1 Enhance verifyLinks Method [🔴 Not Started]
#### 2.1.1 Integrate suggestion logic into anchor validation [🔴 Not Started]
- **Location**: `src/links/LinkVerifier.ts`, lines 54-67 (existing anchor validation)
- **Current State**: `suggestions: []` placeholder (line 63)
- **Enhancement**: Replace empty suggestions with intelligent anchor suggestions
- **Integration Point**: After `!targetAnchors.has(requestedAnchor)` check (line 59)
- **Preserve Behavior**: Maintain all existing validation logic

#### 2.1.2 Populate BrokenLink suggestions with enhanced data [🔴 Not Started]
- **Suggestion Format**: Full path with corrected anchor (e.g., `./page.md#valid-section`)
- **Path Construction**: Combine `pathPart` with suggested anchor from `findClosestAnchor`
- **Multiple Suggestions**: Currently support single best match (future: multiple suggestions)
- **canAutoFix Setting**: Keep `false` for anchor fixes (safety first)

### 2.2 Error Message Enhancement [🔴 Not Started]
#### 2.2.1 Improve console output for broken anchors [🔴 Not Started]
- **Context**: Identify where broken link messages are displayed
- **Enhancement**: Include available anchor information in error messages
- **Format**: "Broken anchor '#invalid-section' - did you mean '#valid-section'?"
- **Integration**: Work with existing reporting systems

#### 2.2.2 Maintain backward compatibility in error reporting [🔴 Not Started]
- **Existing Behavior**: Preserve current error message structure
- **Enhancement Only**: Add suggestion information without changing base message
- **Consumer Impact**: Ensure no breaking changes to error message parsing

## 3. Test Implementation [🔴 Not Started]

### 3.1 Unit Tests for New Methods [🔴 Not Started]
#### 3.1.1 Test calculateSimilarity method [🔴 Not Started]
- **Test File**: `src/links/LinkVerifier.test.ts`
- **Test Cases**:
  - Identical strings → 1.0
  - Completely different strings → 0.0
  - Partial matches → appropriate scores
  - Empty strings → 1.0
  - Unicode text → proper handling
- **Coverage Target**: 100% of new method

#### 3.1.2 Test findClosestAnchor method [🔴 Not Started]
- **Test File**: `src/links/LinkVerifier.test.ts`
- **Test Cases**:
  - Valid match above threshold → return suggestion
  - No match above threshold → return null
  - Multiple equal scores → return first match
  - Empty anchor set → return null
  - Unicode anchors → proper handling
- **Coverage Target**: 100% of new method

### 3.2 Integration Tests for Enhanced Workflow [🔴 Not Started]
#### 3.2.1 Test suggestion generation in verifyLinks [🔴 Not Started]
- **Test Scenario**: Link `./page.md#invalid-sektion` with file containing `## Valid Section`
- **Expected Result**: BrokenLink with suggestion `./page.md#valid-section`
- **Verification**: Check `suggestions` array contains expected suggestion
- **Edge Cases**: No close matches, multiple potential matches

#### 3.2.2 Test complete workflow with real files [🔴 Not Started]
- **Test Setup**: Create realistic Markdown files with various heading structures
- **Test Cases**:
  - Typos in anchor names
  - Case differences
  - Special character variations
  - Unicode heading targets (Cyrillic)
- **Verification**: End-to-end suggestion generation

### 3.3 Performance and Regression Tests [🔴 Not Started]
#### 3.3.1 Verify caching effectiveness [🔴 Not Started]
- **Test**: Multiple links to same file should not re-read file
- **Measurement**: File system access count during verification
- **Expectation**: One read per unique target file
- **Cache State**: Verify anchor cache contains expected entries

#### 3.3.2 Performance impact measurement [🔴 Not Started]
- **Baseline**: Current verification time without suggestions
- **Enhanced**: Verification time with suggestion generation
- **Acceptance**: < 10% performance degradation for typical files
- **Large Files**: Test with files containing 50+ headings

## 4. Documentation and Quality Assurance [🔴 Not Started]

### 4.1 Code Documentation [🔴 Not Started]
#### 4.1.1 Document new methods with JSDoc [🔴 Not Started]
- **calculateSimilarity**: Purpose, parameters, return value, examples
- **findClosestAnchor**: Purpose, threshold explanation, edge cases
- **Enhanced workflow**: Update existing method documentation

#### 4.1.2 Update interface documentation if needed [🔴 Not Started]
- **BrokenLink interface**: Clarify new suggestion format
- **Usage examples**: Show how suggestions are populated and used

### 4.2 Quality Validation [🔴 Not Started]
#### 4.2.1 Code coverage verification [🔴 Not Started]
- **Target**: 85% minimum coverage for new functionality
- **Measurement**: Run coverage analysis on enhanced LinkVerifier
- **Gaps**: Identify any untested code paths
- **Improvement**: Add tests for uncovered scenarios

#### 4.2.2 Final validation against acceptance criteria [🔴 Not Started]
- **REQ-001**: Process `./page.md#invalid-sektion` correctly ✓
- **REQ-002**: Generate `./page.md#valid-section` suggestion ✓
- **REQ-003**: Console output shows invalid and suggested anchor ✓
- **REQ-004**: Anchor cache prevents redundant file reads ✓
- **REQ-005**: 85% test coverage achieved ✓
- **REQ-006**: 100% test success rate maintained ✓

## Agreement Compliance Log
- **2025-08-03_22-58**: Initial plan created based on VAN analysis - ✅ Compliant
- **2025-08-03_22-58**: No external dependencies identified - ✅ Compliant
- **2025-08-03_22-58**: Zero breaking changes planned - ✅ Compliant
- **2025-08-03_22-58**: Existing test coverage preservation confirmed - ✅ Compliant

## Implementation Dependencies

### Internal Dependencies
- ✅ **LinkVerifier class**: Well-structured foundation available
- ✅ **anchorCache system**: Already implemented and working
- ✅ **generateSlug method**: Handles Unicode and special characters
- ✅ **BrokenLink interface**: Has suggestions field ready
- ✅ **Test infrastructure**: Comprehensive test suite with 835 lines

### External Dependencies
- ✅ **Node.js fs module**: Available for file operations
- ✅ **Bun test framework**: Configured and working
- ✅ **TypeScript**: Project configured for TypeScript development

## Risk Mitigation Strategies

### Technical Risks
- **Algorithm Accuracy**: Comprehensive test cases covering various text patterns
- **Performance Impact**: Leverage existing caching, simple algorithm choice
- **Unicode Support**: Build on existing generateSlug Unicode handling

### Quality Risks
- **Regression Prevention**: Run full existing test suite after changes
- **Coverage Gaps**: Systematic test planning for all new code paths
- **Edge Cases**: Explicit testing for empty sets, thresholds, special characters

## Success Metrics Tracking

### Functional Metrics
- [ ] String similarity algorithm implemented and tested
- [ ] Closest anchor finding logic working correctly
- [ ] Suggestions properly integrated into verification workflow
- [ ] Console output enhanced with helpful suggestions

### Quality Metrics
- [ ] 85% minimum test coverage achieved
- [ ] 100% test success rate maintained
- [ ] Zero regressions in existing functionality
- [ ] Performance impact within acceptable limits (< 10% degradation)

### User Experience Metrics
- [ ] Broken anchor errors include actionable suggestions
- [ ] Error messages clear and user-friendly
- [ ] Suggestions accurate and helpful for common typos
- [ ] Unicode and special character support maintained