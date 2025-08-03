# Traceability Matrix - Debug Option Implementation

## Specification to Implementation Mapping

| Spec ID | Requirement                            | Implementation File                               | Method/Function         | Implementation Detail                                                                       | Status      |
| ------- | -------------------------------------- | ------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- | ----------- |
| REQ-001 | Add `--debug` CLI option               | `src/cli/EnhancedCommands.ts`                     | `addPublishCommand()`   | Add `.option("--debug", "Save the generated Telegraph JSON to a file (implies --dry-run)")` | 🟢 Completed |
| REQ-002 | Auto-enable dry-run with debug         | `src/workflow/PublicationWorkflowManager.ts`      | `publish()`             | `if (options.debug) { options.dryRun = true; }`                                             | 🟢 Completed |
| REQ-003 | Pass debug option to publisher         | `src/workflow/PublicationWorkflowManager.ts`      | `publish()`             | Add `debug: options.debug \|\| false` to publishWithMetadata call                           | 🟢 Completed |
| REQ-004 | Add debug param to publishWithMetadata | `src/publisher/EnhancedTelegraphPublisher.ts`     | `publishWithMetadata()` | Add `debug?: boolean` to options interface                                                  | 🟢 Completed |
| REQ-005 | Add debug param to editWithMetadata    | `src/publisher/EnhancedTelegraphPublisher.ts`     | `editWithMetadata()`    | Add `debug?: boolean` to options interface                                                  | 🟢 Completed |
| REQ-006 | JSON saving in publishWithMetadata     | `src/publisher/EnhancedTelegraphPublisher.ts`     | `publishWithMetadata()` | Save JSON after telegraphNodes generation when debug && dryRun                              | 🟢 Completed |
| REQ-007 | JSON saving in editWithMetadata        | `src/publisher/EnhancedTelegraphPublisher.ts`     | `editWithMetadata()`    | Save JSON after telegraphNodes generation when debug && dryRun                              | 🟢 Completed |
| REQ-008 | JSON file naming                       | Both publisher methods                            | JSON save logic         | `filePath.replace(/\.md$/, ".json")` with resolve()                                         | 🟢 Completed |
| REQ-009 | JSON formatting                        | Both publisher methods                            | JSON save logic         | `JSON.stringify(telegraphNodes, null, 2)`                                                   | 🟢 Completed |
| REQ-010 | User feedback                          | Both publisher methods                            | JSON save logic         | ProgressIndicator success/error messages                                                    | 🟢 Completed |
| REQ-011 | Test debug option                      | `src/workflow/PublicationWorkflowManager.test.ts` | New test case           | Test JSON file creation with debug option                                                   | 🟢 Completed |
| REQ-012 | Test auto dry-run                      | `src/workflow/PublicationWorkflowManager.test.ts` | New test case           | Verify dryRun=true when debug=true                                                          | 🟢 Completed |
| REQ-013 | Test no JSON without debug             | `src/workflow/PublicationWorkflowManager.test.ts` | New test case           | Verify no JSON file when debug=false                                                        | 🟢 Completed |

## Phase Decision Cross-References

**VAN Analysis → Implementation:**
- Architecture analysis confirms CLI integration point at line 41 in EnhancedCommands.ts
- Publisher integration points identified at lines 206 and 327 for Telegraph node generation
- Workflow manager integration point at lines 125-129 for option passing

**Specification → Code Locations:**
- CLI Option: `src/cli/EnhancedCommands.ts:41` (after existing --dry-run option)
- Auto Dry-Run Logic: `src/workflow/PublicationWorkflowManager.ts:42` (start of publish method)
- Publisher Options: `src/publisher/EnhancedTelegraphPublisher.ts:108-112` and `257-260`
- JSON Generation Points: `src/publisher/EnhancedTelegraphPublisher.ts:206` and `327`

## Implementation Dependencies

| Component             | Depends On            | Reason                               |
| --------------------- | --------------------- | ------------------------------------ |
| CLI Option            | None                  | Independent addition                 |
| Workflow Logic        | CLI Option            | Receives options from CLI            |
| Publisher Debug Param | Workflow Logic        | Receives debug option from workflow  |
| JSON Saving           | Publisher Debug Param | Requires debug parameter to function |
| Testing               | All Above             | Tests complete implementation        |

## Acceptance Criteria Mapping

| Criteria # | Description                 | Implementation Check               | Test Coverage             |
| ---------- | --------------------------- | ---------------------------------- | ------------------------- |
| AC-001     | No publication with --debug | Workflow auto-enables dry-run      | Test dry-run activation   |
| AC-002     | JSON file creation          | Publisher saves JSON alongside .md | Test file creation        |
| AC-003     | Valid JSON content          | TelegraphNode[] array format       | Test JSON validation      |
| AC-004     | 2-space formatting          | JSON.stringify with null, 2        | Test JSON formatting      |
| AC-005     | Success feedback            | ProgressIndicator messages         | Test console output       |
| AC-006     | No JSON without debug       | Conditional JSON saving            | Test negative case        |
| AC-007     | Directory support           | Works with multiple files          | Test directory publishing |

## Quality Assurance Traceability

**Code Coverage Requirements:**
- All new debug-related code paths must be tested
- Both publishWithMetadata and editWithMetadata debug paths
- CLI option processing and workflow logic
- Error handling for file system operations

**Integration Testing:**
- End-to-end CLI to JSON file creation
- Multiple file processing in directory mode
- Error scenarios and edge cases

## Change Impact Assessment

**Risk Assessment:** LOW
- All changes are additive (no breaking changes)
- Debug mode only works with dry-run (safe operation)
- Existing functionality remains unchanged

**Files Modified:** 4 files
**New Dependencies:** None (uses existing imports)
**Configuration Changes:** None required