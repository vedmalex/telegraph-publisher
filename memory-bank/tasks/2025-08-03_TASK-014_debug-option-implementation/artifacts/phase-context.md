# Integrated Phase Context - Debug Option Implementation

## User Specifications Summary

**Source:** `artifacts/specs/requirements.md` (comprehensive technical specification)

**Key Requirements:**
- Add `--debug` CLI option to publish command with auto dry-run
- Save generated TelegraphNode[] as formatted JSON file
- Use 2-space indentation and .json extension naming
- Provide user feedback about saved files
- Work for both single files and directory operations
- Update tests to cover new functionality

**Constraints:**
- JSON saving only when both `debug` and `dryRun` are true
- No actual publication when debug mode is active
- Files saved alongside original markdown files
- Error handling for file system operations

## Previous Phase Results

**VAN Analysis Key Findings:**
- Specification assessed as COMPREHENSIVE - ready for fast-track implementation
- All integration points identified in CLI, WorkflowManager, and Publisher
- Low implementation risk with additive-only changes
- Existing `--dry-run` infrastructure can be leveraged
- Two Telegraph node generation points need modification (publish/edit)

## Current Phase Objectives

**Phase:** IMPLEMENT (Fast-tracked from VAN)
**Goals:**
- Implement `--debug` CLI option with auto dry-run activation
- Add JSON saving functionality to both publishWithMetadata and editWithMetadata
- Update option interfaces to include debug parameter
- Provide user feedback for saved debug files

**Success Criteria:**
- All 7 acceptance criteria from specification met
- No JSON files created without `--debug` flag
- Formatted JSON output with 2-space indentation
- Tests updated and passing
- Functionality works for files and directories

## Implementation Context

**Fast-Track Justification:** User specification is comprehensive with detailed implementation steps, specific file modifications, clear acceptance criteria, and testing requirements.

**Enhanced Specification Elements Added:**
- Import requirements (`resolve` from `node:path`)
- Error handling patterns for file operations
- User feedback message format
- Integration with existing dry-run logic

**Implementation Priority Order:**
1. CLI option addition in EnhancedCommands.ts
2. Logic update in PublicationWorkflowManager.ts
3. JSON saving in EnhancedTelegraphPublisher.ts (both methods)
4. Test updates in PublicationWorkflowManager.test.ts

**File Modification Summary:**
- `src/cli/EnhancedCommands.ts`: Add `--debug` option
- `src/workflow/PublicationWorkflowManager.ts`: Pass debug option + auto dry-run
- `src/publisher/EnhancedTelegraphPublisher.ts`: Add debug param + JSON saving
- `src/workflow/PublicationWorkflowManager.test.ts`: Add debug test scenarios

**Key Technical Details:**
- JSON path: `filePath.replace(/\.md$/, ".json")`
- JSON format: `JSON.stringify(telegraphNodes, null, 2)`
- Feedback message: `💾 Debug JSON saved to: ${jsonOutputPath}`
- Error message: `❌ Failed to save debug JSON: ${error.message}`

## Quality Assurance Requirements

**Specification Compliance Validation:**
- Every requirement from original specification must be implemented
- All 7 acceptance criteria must pass testing
- No regression in existing dry-run functionality
- Directory and single file operations both supported

**Testing Requirements:**
- Test debug option creates JSON files
- Test auto dry-run activation with debug
- Test no JSON creation without debug flag
- Test JSON content validity and formatting
- Test user feedback messages

## Traceability Notes

This implementation follows the exact technical specification provided by user, with all implementation details pre-defined. The fast-track approach is justified by the specification's completeness and implementation-readiness.