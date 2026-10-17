# DA Review — TASK-003 — PLAN — Iteration 1

- Task: TASK-003
- Phase: PLAN
- Iteration: 1
- Status: rejected
- Verdict: REVISE
- Source: claude-hook
- Review Mode: subagent
- Gate Authority: authoritative
- Timestamp: 2026-06-24T17:34:31.683Z
- Review Schema: mb3-critic.review/v2
- Lens: Completeness
- UR Refs: UR-002
- Follow-up Issues: ISS-001, ISS-002, ISS-003, ISS-004, ISS-005, ISS-006, ISS-007, ISS-008

## Follow-up Issues

- ISS-001
- ISS-002
- ISS-003
- ISS-004
- ISS-005
- ISS-006
- ISS-007
- ISS-008

## Report

## DA Report:

- Task: TASK-003
- Phase: PLAN
- Lens: Completeness
- Verdict: REVISE
- Date: 2026-06-24
- Source: claude-hook

### Executive Summary

Two user goals from UR-002 are PARTIALLY covered: pipeline-level deterministic simulation testing (publish/EPUB/link validation) is deferred to Phase 3+ with no follow-up tracking, and pipeline coverage only includes dependency tree. Per DA rules PARTIAL→HIGH→REVISE. Additionally 4 MEDIUM-severity completeness gaps (injection pattern underspecified, vi.mock governance absent, TestHelpers integration missing, no harness integration test) further support REVISE. LOW items are advisory carry-forward.

### UR-Goal Traceability

| UR-ID | Goal | Status | Evidence |
|---|---|---|---|
| UR-002 | Create DST harness for telegraph-publisher | COVERED | Step 4: DstHarness class in plan.md wires MockDstIO into pipeline under test |
| UR-002 | File I/O interception | COVERED | Step 2: MockDstIO virtual FS (Map<string, Uint8Array>) covers all 13 file operations from creative design |
| UR-002 | External API interception (Telegra.ph) | COVERED | Step 2: MockDstIO.fetch with httpHandlers registration map |
| UR-002 | Deterministic simulation testing of CLI pipeline | PARTIAL | Infrastructure built (interface+mock+harness), but actual pipeline-level testing deferred to Phase 3+. Only DependencyManager injection in Phase 2 scope. No follow-up task tracking. |
| UR-002 | Pipeline coverage: publish, EPUB, link validation, dependency tree | PARTIAL | Only dependency tree (DependencyManager) in Phase 2 scope. Publish, EPUB, link validation deferred to follow-up tasks (Phase 3+) without explicit tracking. |

### Phase-Specific Challenges

- [HIGH] UR-002 goal: pipeline-level deterministic simulation testing deferred without follow-up tracking
  - Challenge: UR-002 requires 'детерминированное симуляционное тестирование CLI-пайплайна' — the plan builds harness infrastructure but defers actual pipeline-level testing to Phase 3+ without listing concrete follow-up tasks or TASK-ID references for the deferred coverage (publish, EPUB, link validation).
  - Alternative: Either (a) add a 'Deferred Scope' section listing each pipeline module, the target phase, and expected follow-up task ID/name, or (b) expand Phase 2 scope to include at least one non-DependencyManager integration test proving the harness works for other pipeline stages.
  - Risk: Without explicit follow-up tracking, deferred pipeline testing may become indefinitely postponed or fragmented across uncoordinated tasks. Harness integration value unproven beyond DependencyManager until someone picks it up later. Severity: HIGH, Likelihood: MEDIUM.
  - Ref: plan.md — Scope: 'Phases 1–2 of the CREATIVE design (TASK-002). Phases 3–6 deferred to follow-up tasks.'
- [HIGH] UR-002 goal: pipeline coverage incomplete (3 of 4 pipeline modules deferred)
  - Challenge: UR-002 explicitly lists 'публикация, EPUB, валидация ссылок, дерево зависимостей' as the pipeline scope. The plan covers only 'дерево зависимостей' (DependencyManager). Publish, EPUB, and link validation are absent from Phase 2 scope with no concrete follow-up plan or acceptance criteria for when DST coverage is 'complete'.
  - Alternative: Add a 'Deferred Scope' section mapping each deferred module to a specific future task: e.g., 'Phase 3 — Module-level interception for links, cache, publisher (see creative.md §14 Phase 3)'. Track in PLAN's UR-002 reference section.
  - Risk: User expectation is full pipeline DST coverage. A plan covering 1/4 pipeline modules risks expectation mismatch and fragmented implementation across future tasks without coordination. Severity: HIGH, Likelihood: MEDIUM.
  - Ref: plan.md — 'Requirements (UR refs)' section
- [MEDIUM] DstHarness injection point underspecified
  - Challenge: Step 4 says 'Starts with DependencyManager injection (Phase 2 scope)' but doesn't specify HOW DependencyManager receives DstIO — constructor injection? Optional parameter? Setter method? Module-level monkey-patch? The existing DependencyManager likely uses direct node:fs calls; the refactoring pattern is not described.
  - Alternative: Specify the DI pattern explicitly: e.g., 'DependencyManager constructor will accept optional DstIO parameter; when provided, file operations route through dstIO instead of direct node:fs calls. Default behavior (null/undefined dstIO) preserves backward compatibility with existing code.'
  - Risk: Implementer must guess the DI pattern, risking inconsistent approach, excessive refactoring, or a pattern that doesn't compose well with other pipeline modules in later phases. Severity: MEDIUM, Likelihood: HIGH.
  - Ref: plan.md — Step 4: DstHarness description
- [MEDIUM] vi.mock governance checklist referenced but absent
  - Challenge: Plan's Risks section states 'vi.mock governance — checklist tracked via PLAN' but no checklist exists in the plan artifact. Creative design (Section 3) establishes a governance rule that vi.mock is temporary for legacy modules and removed upon DstIO migration, but the plan provides no implementation mechanism.
  - Alternative: Add a governance checklist: (a) inventory current vi.mock usage per module, (b) migration priority order to DstIO, (c) removal criteria and owner per module, (d) gate that prevents new vi.mock on new code.
  - Risk: Without explicit checklist, vi.mock will persist indefinitely as 'temporary' measure, undermining DST determinism guarantees and allowing new vi.mock patterns to proliferate. Severity: MEDIUM, Likelihood: HIGH.
  - Ref: plan.md — Risks section
- [MEDIUM] Existing TestHelpers integration strategy not addressed
  - Challenge: Creative design Section 12 explicitly defines DstHarness's relationship to existing TestHelpers (coexistence/complement, not replacement). The plan does not mention TestHelpers at all — no coexistence guidance, no migration path, no decision on when to use which.
  - Alternative: Add a brief section: 'TestHelpers continues for isolated unit tests on real FS; DstHarness replaces it for integration pipeline tests requiring determinism. Per-module migration tracked in vi.mock governance checklist.'
  - Risk: Developers may create duplicate test infrastructure, misuse DstHarness for unit tests (losing real FS accuracy), or continue relying on TestHelpers for integration tests (losing determinism). Severity: MEDIUM, Likelihood: MEDIUM.
  - Ref: plan.md — no mention of TestHelpers; creative.md Section 12
- [MEDIUM] Self-tests missing DstHarness integration test
  - Challenge: Step 5 (Self-tests) lists 8 categories — all unit-level (seed determinism, FS roundtrip, HTTP mock, tick clock, PRNG, isolation, readdir sorting, fault injection). No test for DstHarness.getDependencyManager() or any harness-level integration wiring.
  - Alternative: Add: 'DstHarness + DependencyManager integration: create harness with MockDstIO, add test files via addFile, run DM.resolveAll(), verify resolved dependency tree matches expected structure.'
  - Risk: The harness→DependencyManager integration path is untested until Phase 3; a wiring defect (wrong injection point, missing method, interface mismatch) would surface weeks later in a different task. Severity: MEDIUM, Likelihood: MEDIUM.
  - Ref: plan.md — Step 5 test list
- [LOW] No acceptance criteria / Definition of Done per step
  - Challenge: Five implementation steps lack explicit 'done' criteria. E.g., Step 2 'MockDstIO' — done when all 22 methods compile? All unit tests pass? Error parity verified against RealDstIO? All edge cases covered?
  - Alternative: Add acceptance bullets per step: e.g., 'Step 2 done when: (a) all DstIO methods implemented in MockDstIO, (b) all self-tests pass with 3 seed values, (c) error parity proven by running same test suite against Mock+Real.'
  - Risk: Steps may be considered 'done' prematurely with incomplete implementations, passing hidden gaps to integration phase. Severity: LOW, Likelihood: MEDIUM.
  - Ref: plan.md — Steps 1-5
- [LOW] Dynamic import bypass deferred without interim testing strategy
  - Challenge: Creative design notes PdfGenerator.findChromePath and SvgGenerator.findChromePath use dynamic import (const { existsSync } = await import('node:fs')) which bypasses DI. Plan acknowledges this but defers to Phase 3 without documenting interim strategy for testing.
  - Alternative: Document interim strategy in plan: 'Until Phase 3 refactor, augment puppeteer vi.mock to stub findChromePath returning a known path, enabling DstHarness tests for PDF/SVG generation.'
  - Risk: If Phase 3 is delayed, PDF and SVG modules remain untestable under DST harness. Severity: LOW, Likelihood: LOW.
  - Ref: plan.md — Risks section: 'Dynamic import bypass in PdfGenerator.findChromePath — deferred to Phase 3'

### Verdict

**REVISE**

Two user goals from UR-002 are PARTIALLY covered: pipeline-level deterministic simulation testing (publish/EPUB/link validation) is deferred to Phase 3+ with no follow-up tracking, and pipeline coverage only includes dependency tree. Per DA rules PARTIAL→HIGH→REVISE. Additionally 4 MEDIUM-severity completeness gaps (injection pattern underspecified, vi.mock governance absent, TestHelpers integration missing, no harness integration test) further support REVISE. LOW items are advisory carry-forward.
