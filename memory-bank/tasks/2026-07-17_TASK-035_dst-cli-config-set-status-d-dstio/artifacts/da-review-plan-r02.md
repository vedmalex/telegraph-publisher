# DA Review — TASK-035 — PLAN — Iteration 2

- Task: TASK-035
- Phase: PLAN
- Iteration: 2
- Status: rejected
- Verdict: REVISE
- Source: mb3_event
- Review Mode: manual
- Gate Authority: advisory
- Timestamp: 2026-07-17T15:21:17Z
- Review Schema: mb3-critic.review/v2
- Lens: Completeness + UR-Goal Traceability
- Previous Review: da_review_plan_r01 (tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/artifacts/da-review-plan-r01.md)
- UR Refs: UR-002, UR-001
- Follow-up Issues: ISS-025, ISS-026, ISS-027, ISS-028

## Follow-up Issues

- ISS-025
- ISS-026
- ISS-027
- ISS-028

## Report

## DA Report:

- Task: TASK-035
- Phase: PLAN
- Lens: Completeness + UR-Goal Traceability
- Verdict: REVISE
- Date: 2026-07-17
- Source: mb3_event

### Executive Summary

UR-002 is fully addressed at the design-intent level (DstIO seam matching the verified DependencyManager precedent, seeded MockDstIO determinism tests, clean TASK-004/005 scope boundaries) — no CRITICAL/BLOCK-level gap. However, three MEDIUM completeness gaps require plan revision before PROCEED per the S3 verdict matrix: (1) a real risk of duplicating the already-existing IntelligentConfigMerger.deepMerge utility, (2) an unaddressed extra consumer of findMarkdownFiles (handleDirectoryReset) plus a signature conflict with existing positional-call regression tests that the plan should resolve by mandating backward-compatible wrapper delegates, and (3) an incomplete DST test matrix missing explicit METADATA_MISSING coverage. A LOW/informational note flags a stale risk hedge that has a ready-made precedent to reuse.

### UR-Goal Traceability

| UR-ID | Goal | Status | Evidence |
|---|---|---|---|
| UR-001 | DST-обвязка CLI-хендлеров config --set и status -d: DstIO-шов + детерминированные тесты | COVERED | Superseded by UR-002 per requests.md; intent fully folded into UR-002. |
| UR-002 | Посадить IO-пути новых CLI-хендлеров TASK-034 (config --set, status -d/--recursive) на DstIO-шов (паттерн DependencyManager), детерминированные тесты на MockDstIO (seed), закрыть DST-debt из TASK-034/ISS-018 для этих хендлеров | COVERED | plan.md explicitly designs the optional-dstIO-with-fallback seam matching the verified DependencyManager precedent, specifies MockDstIO seed=42 deterministic tests including a two-run determinism check, and scopes non-goals cleanly against TASK-004/TASK-005. |

### Phase-Specific Challenges

- [MEDIUM] Missed reuse of existing IntelligentConfigMerger.deepMerge
  - Challenge: Plan step 1.3 proposes extracting a new 'pure merge function' for applyConfigSet's deep merge without evaluating the existing IntelligentConfigMerger.deepMerge (src/config/IntelligentConfigMerger.ts:19-46), already used by ConfigManager.loadHierarchicalConfigSync (ConfigManager.ts:131) for the same class of problem.
  - Alternative: Plan should state explicitly whether applyConfigSet's merge reuses IntelligentConfigMerger.deepMerge, or document why the narrower per-path nested-object construction already in handleConfigCommand (EnhancedCommands.ts:750-763) is sufficient and a generic deep-merge utility is not needed.
  - Risk: A second, subtly different deep-merge implementation ships in the same config subsystem, creating divergent merge semantics (conflict logging, array handling) between two sources of truth.
  - Ref: memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/plan.md; src/config/IntelligentConfigMerger.ts:19-46
- [MEDIUM] findMarkdownFiles has an unaddressed extra consumer + signature conflict
  - Challenge: findMarkdownFiles is also called by handleDirectoryReset (EnhancedCommands.ts:1056) and by two existing tests using the current positional signature (EnhancedCommands.cli-fixes.test.ts:148,155: findMarkdownFiles(tmp, false/true)). Plan's proposed new signature findMarkdownFiles(dir, {recursive}, io?) is an options-object, conflicting with the positional call sites, and the plan never states that EnhancedCommands.findMarkdownFiles/computeFileStatus must remain backward-compatible static wrappers.
  - Alternative: Plan should explicitly require EnhancedCommands.findMarkdownFiles and computeFileStatus to remain as thin, signature-preserving delegates to the new CliStatusConfigOps functions (real-fs default, no io param) so handleDirectoryReset and the existing positional-call tests keep working unmodified.
  - Risk: An implementer who moves rather than wraps the function breaks handleDirectoryReset and/or the 2 positional-call regression tests, silently regressing behavior outside the reviewed status/config code paths.
  - Ref: src/cli/EnhancedCommands.ts:951-985,1056; src/cli/EnhancedCommands.cli-fixes.test.ts:148,155
- [MEDIUM] DST test matrix omits METADATA_MISSING status coverage
  - Challenge: plan.md step 3 bullet 1 names only 'published/not_published/битый front-matter' (3 of 4 tracked statuses) for the status-directory DST test; METADATA_MISSING — one of the 4 counts tracked at EnhancedCommands.ts:855-860 — is not mentioned.
  - Alternative: Add an explicit MockDstIO scenario exercising the METADATA_MISSING path (e.g. a file removed/unreadable between findMarkdownFiles listing and the per-file status read) to the DST test matrix.
  - Risk: A real, counted status branch ships with zero deterministic coverage, narrowing the DST-debt closure UR-002 claims for this handler.
  - Ref: memory-bank/tasks/2026-07-17_TASK-035_dst-cli-config-set-status-d-dstio/plan.md; src/cli/EnhancedCommands.ts:855-860
- [LOW] Stale risk hedge — parse-from-content API already exists
  - Challenge: Plan risk #1 hedges that MetadataManager may lack a parse-from-content API, but MetadataManager.parseMetadata(content) already exists and has a proven precedent for this exact classification problem in DependencyManager.createNode (DependencyManager.ts:255-275).
  - Alternative: Point the implementer directly at DependencyManager.createNode's dstIO-branch classification logic as the template to replicate, rather than re-deriving it.
  - Risk: Low — mainly wasted implementer time re-discovering an already-solved pattern, or a subtly divergent reimplementation if not pointed at the precedent.
  - Ref: src/metadata/MetadataManager.ts:18; src/dependencies/DependencyManager.ts:255-275

### Verdict

**REVISE**

UR-002 is fully addressed at the design-intent level (DstIO seam matching the verified DependencyManager precedent, seeded MockDstIO determinism tests, clean TASK-004/005 scope boundaries) — no CRITICAL/BLOCK-level gap. However, three MEDIUM completeness gaps require plan revision before PROCEED per the S3 verdict matrix: (1) a real risk of duplicating the already-existing IntelligentConfigMerger.deepMerge utility, (2) an unaddressed extra consumer of findMarkdownFiles (handleDirectoryReset) plus a signature conflict with existing positional-call regression tests that the plan should resolve by mandating backward-compatible wrapper delegates, and (3) an incomplete DST test matrix missing explicit METADATA_MISSING coverage. A LOW/informational note flags a stale risk hedge that has a ready-made precedent to reuse.
