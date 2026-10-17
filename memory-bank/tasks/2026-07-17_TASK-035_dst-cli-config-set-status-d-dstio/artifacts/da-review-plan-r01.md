# DA Review — TASK-035 — PLAN — Iteration 1

- Task: TASK-035
- Phase: PLAN
- Iteration: 1
- Status: rejected
- Verdict: REVISE
- Source: claude-hook
- Review Mode: subagent
- Gate Authority: authoritative
- Timestamp: 2026-07-17T14:17:53.559Z
- Review Schema: mb3-critic.review/v2
- Lens: PLAN / Completeness
- UR Refs: UR-001, UR-002
- Follow-up Issues: ISS-019, ISS-020, ISS-021, ISS-022, ISS-023

## Follow-up Issues

- ISS-019
- ISS-020
- ISS-021
- ISS-022
- ISS-023

## Report

## DA Report:

- Task: TASK-035
- Phase: PLAN
- Lens: PLAN / Completeness
- Verdict: REVISE
- Date: 2026-07-17
- Source: claude-hook

### Executive Summary

Scope boundaries and the overall DstIO-seam shape are sound and precedented (DependencyManager pattern), and readdir determinism is genuinely handled (sort at both MockDstIO.readdir and findMarkdownFiles' final accumulation). However, two HIGH findings show the plan's stated regression-safety net ('19 tests stay green') does not actually cover the handler-level behavior being refactored (config-file write path, console messaging, merge semantics reuse vs IntelligentConfigMerger), which is a gate-honesty risk given CD-63/CD-40. Two MEDIUM findings flag unacknowledged duplication debt and a stale parity claim between the -d and -f status paths. Per the S3 matrix, HIGH/MEDIUM findings require REVISE before TECH_SPEC/IMPLEMENT proceeds; none are architectural showstoppers (no BLOCK).

### UR-Goal Traceability

| UR-ID | Goal | Status | Evidence |
|---|---|---|---|
| UR-001 | DST-обвязка CLI-хендлеров config --set и status -d: DstIO-шов + детерминированные тесты | COVERED | requests.md marks UR-001 as superseded by UR-002; its full goal text is re-expressed and addressed by UR-002, which the plan targets directly. |
| UR-002 | DstIO-шов (паттерн DependencyManager) для config --set и status -d/--recursive, детерминированные MockDstIO-тесты, закрытие DST-debt из TASK-034/ISS-018 для этих хендлеров (CD-63) | COVERED | plan.md sections 1-3 explicitly design an extraction module (CliStatusConfigOps), a DstIO-optional seam matching DependencyManager's pattern, and a seeded MockDstIO DST test suite covering status/config/determinism. Goal is addressed in the plan text; design-quality gaps are captured as findings below (F1-F4), not goal absence. |

### Phase-Specific Challenges

- [HIGH] Regression criterion ('19 tests stay green') does not cover the handler-level behavior being refactored
  - Challenge: All 19 existing tests in EnhancedCommands.cli-fixes.test.ts exercise either the pure parseConfigSet function or findMarkdownFiles/computeFileStatus directly — none exercise handleConfigCommand's actual config-file write path or handleStatusCommand's -d console/summary output. 'Green tests' therefore cannot detect a refactor that silently drops a console message, changes merge semantics, or alters the file actually written.
  - Alternative: Add characterization/integration tests for handleConfigCommand's real write behavior (resulting file content + the ConfigManager success log) and for handleStatusCommand -d's console summary, BEFORE the refactor lands, so the stated regression gate is real rather than a no-op.
  - Risk: A genuine behavioral regression (e.g. dropped confirmation message, changed merge output) could ship while the QA/DA gate reports 'all green.'
  - Ref: src/cli/EnhancedCommands.cli-fixes.test.ts:1-177; memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/plan.md:33
- [HIGH] applyConfigSet(dir, pairs, io?) bypasses ConfigManager's existing read/merge/write and messaging rather than reusing it
  - Challenge: ConfigManager.saveConfig/loadConfig use unconditional node:fs with no DstIO awareness, so the plan has applyConfigSet do its own io-based read/merge/write. This duplicates IntelligentConfigMerger.deepMerge (already the canonical merge utility) with a new 'чистую функцию' merge, and risks silently dropping ConfigManager.saveConfig's user-facing '✅ Configuration saved to X' console message unless explicitly replicated — which the plan does not mention.
  - Alternative: Reuse IntelligentConfigMerger.deepMerge inside applyConfigSet instead of authoring a new merge function, and explicitly preserve/test the existing success/error console messaging currently emitted by ConfigManager.saveConfig.
  - Risk: Two divergent config-merge implementations plus a silently dropped confirmation message, in a path with zero current test coverage (compounds F-PLAN-1).
  - Ref: src/config/ConfigManager.ts:149-198; src/config/IntelligentConfigMerger.ts:19; memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/plan.md:32
- [MEDIUM] Third parallel re-implementation of 'read+parse+validate -> PublicationStatus' logic is not acknowledged as accepted debt
  - Challenge: MetadataManager.getPublicationStatus/getPublicationInfo already implement this mapping; DependencyManager.createNode's dstIO branch already duplicates a slice of it instead of calling MetadataManager. The plan's new computeFileStatus(path, io?) will be a third independent copy. Given the 'MetadataManager НЕ рефакторится' boundary this is a reasonable precedented tradeoff, but the plan's Risks section does not mention it.
  - Alternative: Add one line to the plan's Risks section naming this as accepted debt, and/or file a follow-up ISS for eventual consolidation into a single canonical content->PublicationStatus helper.
  - Risk: Maintainability/drift risk across three now-independent implementations of the same status-mapping logic.
  - Ref: src/metadata/MetadataManager.ts:345-436; src/dependencies/DependencyManager.ts:255-269; memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/plan.md:42
- [MEDIUM] computeFileStatus docstring parity claim will go stale; decode/lstat edge-case parity with the -f branch is unaddressed
  - Challenge: EnhancedCommands.ts documents computeFileStatus as using 'the exact same resolution path as the single-file branch,' which still calls MetadataManager.getPublicationStatus directly (including its lstat-directory-guard and decodeURIComponent retry). If the -d path is rerouted through a new io.readFile + parseMetadata/validateMetadata implementation without replicating those edge cases, the documented parity claim becomes false and edge-case behavior (e.g. URL-encoded filenames) can diverge undetected — the existing 'non-existent file' test only exercises the outer try/catch, not the decode-retry path.
  - Alternative: Either preserve the decode-retry/lstat-guard in the new implementation with a dedicated test, or update the docstring to state the two branches now intentionally differ.
  - Risk: Edge-case behavioral drift plus stale in-code documentation.
  - Ref: src/cli/EnhancedCommands.ts:818-836,878-890
- [LOW] Plan Risk #1 (uncertain MetadataManager parse-from-content API) is already resolved by evidence
  - Challenge: MetadataManager.parseMetadata(content) and validateMetadata(metadata) are confirmed pure, content-based static methods with no fs access, so the hedge in the plan's Risks section was avoidable with a quick source check before writing the plan.
  - Alternative: No design change needed; tighten evidence-gathering before finalizing future plans.
  - Risk: Advisory only — does not affect the current design's feasibility.
  - Ref: src/metadata/MetadataManager.ts:18,316; memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/plan.md:42

### Verdict

**REVISE**

Scope boundaries and the overall DstIO-seam shape are sound and precedented (DependencyManager pattern), and readdir determinism is genuinely handled (sort at both MockDstIO.readdir and findMarkdownFiles' final accumulation). However, two HIGH findings show the plan's stated regression-safety net ('19 tests stay green') does not actually cover the handler-level behavior being refactored (config-file write path, console messaging, merge semantics reuse vs IntelligentConfigMerger), which is a gate-honesty risk given CD-63/CD-40. Two MEDIUM findings flag unacknowledged duplication debt and a stale parity claim between the -d and -f status paths. Per the S3 matrix, HIGH/MEDIUM findings require REVISE before TECH_SPEC/IMPLEMENT proceeds; none are architectural showstoppers (no BLOCK).
