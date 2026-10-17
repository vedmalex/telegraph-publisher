# DA Review — TASK-035 — QA — Iteration 1

- Task: TASK-035
- Phase: QA
- Iteration: 1
- Status: rejected
- Verdict: REVISE
- Source: claude-hook
- Review Mode: subagent
- Gate Authority: authoritative
- Timestamp: 2026-07-17T19:32:44.237Z
- Review Schema: mb3-critic.review/v2
- Lens: Coverage
- UR Refs: UR-002, UR-001
- Follow-up Issues: ISS-035, ISS-036, ISS-037, ISS-038

## Follow-up Issues

- ISS-035
- ISS-036
- ISS-037
- ISS-038

## Report

## DA Report:

- Task: TASK-035
- Phase: QA
- Lens: Coverage
- Verdict: REVISE
- Date: 2026-07-17
- Source: claude-hook

### Executive Summary

UR-002's core DstIO seam and production write-path wiring are real and well-tested (independently verified via grep + direct code read: 19 DST tests, all 4 statuses, byte-for-byte snapshot, clean 56-name regression baseline). REVISE is driven by two MEDIUM findings: (1) qa.md's ISS-030 closure claim about implementation.md is contradicted by the actual materialized artifact (evidence-integrity gap), and (2) handleConfigCommand's own flag-to-extraAssignments glue (githubToken/autoDeps paths) has zero test coverage anywhere, only its downstream applyConfigSet unit is exercised. Both are fixable without touching the sound core design; no CRITICAL architectural issue exists, so BLOCK is not warranted.

### UR-Goal Traceability

| UR-ID | Goal | Status | Evidence |
|---|---|---|---|
| UR-001 | DST-обвязка CLI-хендлеров config --set и status -d: DstIO-шов + детерминированные тесты | COVERED | Superseded by UR-002 per requests.md; goal fully absorbed. |
| UR-002 | Seat status/config --set IO on DstIO seam with deterministic MockDstIO tests; close DST-debt ISS-018 for these handlers (CD-63) | PARTIAL | Core seam + production write path verified reachable and DST-tested (19 tests, 4 statuses, byte-for-byte snapshot, determinism, clean regression baseline). Gaps: handleConfigCommand's own flag-to-extraAssignments glue (githubToken/autoDeps paths) has zero test coverage anywhere; qa.md's ISS-030 closure claim ('implementation.md заполнен') is contradicted by the materialized implementation.md file, which is still an empty stub. |

### Phase-Specific Challenges

- [MEDIUM] implementation.md closure claim contradicted by canonical artifact
  - Challenge: qa.md asserts '[ISS-030 MEDIUM — ЗАКРЫТ] implementation.md заполнен' but the materialized implementation.md on disk is still an empty materialized_stub template; the real content exists only in implementation.jsonl's evidence_added events, never re-materialized to the canonical file.
  - Alternative: Trigger artifact re-materialization (or mb3_artifact get-verify) for implementation.md before asserting ISS-030 closed; downgrade the claim to 'events recorded, materialization pending' until the rendered file matches.
  - Risk: Gate-honesty / SoT-divergence: a REFLECT-phase or external audit sees an empty stub despite QA claiming closure, undermining trust in the rest of qa.md's closure claims (ISS-029/031).
  - Ref: memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/implementation.md; qa.md
- [MEDIUM] handleConfigCommand's flag-to-assignment glue is untested
  - Challenge: No test (DST or cli-fixes) ever invokes handleConfigCommand itself; the DST production-path tests only hand-author extraAssignments for defaultUsername+maxDependencyDepth — githubToken (sensitive-flag path) and autoDeps (boolean-coercion path) are never exercised by any test. The cited manual smoke run covered 2 --set pairs only, no flags.
  - Alternative: Add applyConfigSet DST cases with githubToken/autoDeps extraAssignments, and/or a test that drives handleConfigCommand directly with a combined flag set.
  - Risk: A regression in the flag-to-assignment mapping (sensitive masking, boolean coercion) ships undetected — recurrence of the same 'false confidence DST-debt is closed' pattern already caught once at the write-path layer by IMPLEMENT r01's ISS-029.
  - Ref: src/cli/EnhancedCommands.ts:752-776; src/cli/CliStatusConfigOps.dst.test.ts:264-364
- [LOW] dist directory exclusion untested
  - Challenge: isRecursable excludes node_modules, dot-entries, and dist, but seedTree never seeds a dist/ subdirectory — only 2 of 3 excluded-directory branches are asserted.
  - Alternative: Add a ${ROOT}/dist/skip.md entry to seedTree and assert exclusion under recursive scan.
  - Risk: Low — same boolean-OR condition as the tested node_modules case, but an unverified branch is an unverified branch.
  - Ref: src/cli/CliStatusConfigOps.ts:76-78; src/cli/CliStatusConfigOps.dst.test.ts:84-94
- [LOW] Simultaneous invalid --max-depth + --set ordering untested (carry-forward)
  - Challenge: Already disclosed in implementation.md Key Decisions and flagged LOW by IMPLEMENT r02 DA; still open at QA time — no regression test asserts which validation error wins.
  - Alternative: Add a regression test asserting max-depth range validation throws before parseConfigSet is reached.
  - Risk: Low; behavior is claimed unchanged from legacy but the ordering is unverified against future refactors.
  - Ref: src/cli/EnhancedCommands.ts:763-776

### Verdict

**REVISE**

UR-002's core DstIO seam and production write-path wiring are real and well-tested (independently verified via grep + direct code read: 19 DST tests, all 4 statuses, byte-for-byte snapshot, clean 56-name regression baseline). REVISE is driven by two MEDIUM findings: (1) qa.md's ISS-030 closure claim about implementation.md is contradicted by the actual materialized artifact (evidence-integrity gap), and (2) handleConfigCommand's own flag-to-extraAssignments glue (githubToken/autoDeps paths) has zero test coverage anywhere, only its downstream applyConfigSet unit is exercised. Both are fixable without touching the sound core design; no CRITICAL architectural issue exists, so BLOCK is not warranted.
