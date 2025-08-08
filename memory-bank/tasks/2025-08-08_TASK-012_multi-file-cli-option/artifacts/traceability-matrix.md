# Traceability Matrix - Multi-file `--file` Option

## Specification to Implementation Mapping
| Spec ID | Requirement | VAN Reference | Plan Item | Creative Decision | Implementation | Test Coverage | Status |
| ------- | ----------- | ------------- | --------- | ----------------- | -------------- | ------------- | ------ |
| REQ-001 | Variadic `--file` | analysis.md | plan.md#1.1 | - | src/cli/EnhancedCommands.ts (addPublishCommand) | MultiFileOption.integration.test.ts | 🟡 In Progress |
| REQ-002 | Repeated flags support | analysis.md | plan.md#1.1 | - | Commander variadic accumulation | MultiFileOption.integration.test.ts | 🟡 In Progress |
| REQ-003 | Per-file hierarchical config | analysis.md | plan.md#2.2 | - | src/cli/EnhancedCommands.ts (handleUnifiedPublishCommand) | MultiFileOption.integration.test.ts | 🔴 Not Started |
| REQ-004 | Apply all flags per file | analysis.md | plan.md#2.3 | - | src/cli/EnhancedCommands.ts | MultiFileOption.integration.test.ts | 🔴 Not Started |
| REQ-005 | Token handling per file | analysis.md | plan.md#2.2 | - | src/cli/EnhancedCommands.ts | MultiFileOption.integration.test.ts | 🔴 Not Started |
| REQ-006 | Sequential order preserved | analysis.md | plan.md#3.1 | - | src/cli/EnhancedCommands.ts | MultiFileOption.integration.test.ts | 🔴 Not Started |

## Phase Decision Cross-References
- REQ-001 → Option parsing → EnhancedCommands.addPublishCommand
- REQ-006 → Loop order → PublicationWorkflowManager.publish calls
