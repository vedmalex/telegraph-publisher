# DA Review — TASK-003 — IMPLEMENT — Iteration 1

- Task: TASK-003
- Phase: IMPLEMENT
- Iteration: 1
- Status: rejected
- Verdict: REVISE
- Source: claude-hook
- Review Mode: subagent
- Gate Authority: authoritative
- Timestamp: 2026-06-24T17:51:59.010Z
- Review Schema: mb3-critic.review/v2
- Lens: PLAN FIDELITY
- UR Refs: UR-002
- Follow-up Issues: ISS-010, ISS-011, ISS-012, ISS-013, ISS-014, ISS-015, ISS-016

## Follow-up Issues

- ISS-010
- ISS-011
- ISS-012
- ISS-013
- ISS-014
- ISS-015
- ISS-016

## Report

## DA Report:

- Task: TASK-003
- Phase: IMPLEMENT
- Lens: PLAN FIDELITY
- Verdict: REVISE
- Date: 2026-06-24
- Source: claude-hook

### Executive Summary

Implementation structurally matches the plan (DstIO interface, MockDstIO, RealDstIO, DstHarness, DependencyManager DST injection all present and functional) but has one HIGH-severity deviation: RealDstIO breaks the plan's error-parity contract by throwing native Node.js errors instead of DstError instances. This is compounded by a dead DstError import in RealDstIO.ts (imported but never thrown). Additionally, three MEDIUM-severity documentation/spec accuracy issues (wrong constructor signature in tech_spec, resolveAll() reference vs actual buildDependencyTree API, and zero DST-injection tests in the main DependencyManager test suite) and three LOW concerns (dead import, stat symlink behavior, createNode duplication) require remediation before phase transition.

### UR-Goal Traceability

| UR-ID | Goal | Status | Evidence |
|---|---|---|---|
| UR-002 | Create DST harness for telegraph-publisher | COVERED | DstIO.ts (interface + 6 types), MockDstIO.ts (all 21 methods), RealDstIO.ts (all 21 methods), DstHarness.ts (factory wiring) all exist at src/dst/ |
| UR-002 | File I/O interception (~250 IO calls) | COVERED | MockDstIO virtual FS (Map<string, Uint8Array>): readFile, readFileBuffer, writeFile, writeFileBuffer, exists, mkdir, readdir, stat, lstat, unlink, copyFile, rm, watch |
| UR-002 | External API interception (Telegra.ph fetch) | COVERED | MockDstIO.fetch with httpHandlers registration map; ENETDOWN on unregistered URL |
| UR-002 | Seedable deterministic PRNG + tick clock | COVERED | MockDstIO: xoshiro128** via BigInt (initPrng/nextPrng), tick(ms) clock, seed defaults to 42 |
| UR-002 | External process mock (ImageMagick exec) | COVERED | MockDstIO.exec with addExecHandler registration map |
| UR-002 | Crypto deterministic hash | COVERED | MockDstIO.hash via node:crypto createHash (deterministic pure function) |
| UR-002 | Env pinning | COVERED | MockDstIO.setEnv/getEnv for process.env interception |
| UR-002 | Per-test isolation (beforeEach/afterEach reset) | COVERED | MockDstIO.reset() clears all state: files, symlinks, handlers, callbacks, env, ops, clock=0; DstHarness.reset() delegates |
| UR-002 | Pipeline coverage within TASK-003: dependency tree (DependencyManager) | COVERED | DstHarness.getDependencyManager() → new DependencyManager(config, pathResolver, dstIO); DstHarness.test.ts lines 162-234 verify integration with 3 deterministic tree tests |
| UR-002 | Pipeline coverage: publish, EPUB, link validation | COVERED | Explicitly deferred to Phases 3-6 with TASK-PENDING tracking in plan.md lines 13-17; scope bounded within TASK-003 to dependency tree only (plan.md line 31) |

### Phase-Specific Challenges

- [HIGH] RealDstIO error parity broken — throws native Error not DstError
  - Challenge: Plan.md line 147 says 'Error parity: same DstError codes as MockDstIO' and tech_spec line 284 says 'MockDstIO and RealDstIO throw the same DstError(code) types for equivalent conditions.' But RealDstIO.ts throws native Node.js errors (from fs.readFileSync, fs.statSync, etc.), NOT DstError instances. The DstError class IS imported at RealDstIO.ts line 6 but is never used anywhere in the file — it is dead code. MockDstIO correctly throws `new DstError(..., code)`. This means `error instanceof DstError` checks would pass for MockDstIO but fail for RealDstIO, breaking the contract that code paths behave identically.
  - Alternative: Wrap native Node.js errors into DstError instances in every RealDstIO method that performs I/O. For example: readFile should catch Node.js ENOENT and throw `new DstError(..., 'ENOENT')`. Or add a private wrapper method: `private wrapError(e: unknown): never { if (e && typeof e === 'object' && 'code' in e) throw new DstError((e as Error).message, (e as any).code); throw e; }` and use it in every fs-calling method.
  - Risk: Test code and pipeline consumers that rely on `error instanceof DstError` for error-type discrimination will get silent false-negatives under RealDstIO, allowing logic bugs to escape into production. The dead DstError import (RealDstIO.ts line 6) confirms this breakage was unintentional.
  - Ref: src/dst/RealDstIO.ts:6, src/dst/RealDstIO.ts:9-103
- [MEDIUM] Tech_spec constructor signature mismatches actual implementation
  - Challenge: Tech_spec.md line 30 (layer diagram) shows `DependencyManager(dstIO, config)` and line 36 says `constructor(dstIO?: DstIO, config: MetadataConfig)`. The actual implementation at DependencyManager.ts line 20 is `constructor(config: MetadataConfig, pathResolver: PathResolver, dstIO?: DstIO)` — different argument order, different count (3 params vs 2). The tech_spec was not updated to match the actual code structure.
  - Alternative: Update tech_spec.md diagram to show `DependencyManager(config, pathResolver, dstIO?)` and fix line 36 to match the real constructor: `constructor(config: MetadataConfig, pathResolver: PathResolver, dstIO?: DstIO)`.
  - Risk: Future maintainers reading the tech_spec as authoritative will write incorrect call sites (wrong argument order or missing pathResolver). The spec-vs-code gap also erodes trust in the tech_spec as a reliable reference.
  - Ref: memory-bank/tasks/2026-06-24_TASK-003_dst-harness-plan-phase/tech_spec.md:30,36
- [MEDIUM] Plan and tech_spec reference `resolveAll()` method that does not exist
  - Challenge: Plan.md line 198 says 'run resolveAll(), verify resolved dependency tree' and tech_spec.md line 260 shows `const tree = dm.resolveAll();` as a public API example. DependencyManager has no `resolveAll()` method. The actual API is `buildDependencyTree()`. Both the plan and tech_spec are wrong.
  - Alternative: Replace `resolveAll()` with `buildDependencyTree(filePath)` in both plan.md and tech_spec.md to match the actual API.
  - Risk: Developers following the spec to 'dm.resolveAll()' will get a TypeScript compile error and have to guess the correct method name. This is confusing and wastes time.
  - Ref: memory-bank/tasks/2026-06-24_TASK-003_dst-harness-plan-phase/plan.md:198, tech_spec.md:260
- [MEDIUM] DependencyManager.test.ts has zero DST-injection tests
  - Challenge: The existing DependencyManager.test.ts (588 lines, 16 tests) tests DependencyManager only with real FS via TestHelpers. The DST injection path (DstIO dependency) is tested only in DstHarness.test.ts (3 integration tests). No single test in the main DependencyManager test suite exercises `new DependencyManager(config, pathResolver, mockDstIO)`. The plan's acceptance criteria says 'DependencyManager integration test passes' but the DST-injection path has no dedicated coverage in the main test file.
  - Alternative: Either: (a) Add a new `describe('DstIO injection')` block to DependencyManager.test.ts with tests that inject MockDstIO and verify all operations route through it, OR (b) promote the DstHarness.test.ts integration tests to also be discoverable as DependencyManager DST tests.
  - Risk: Future refactoring of DependencyManager could silently break the DST injection path without existing tests catching it. The DstIO routing code in DependencyManager (lines 386-416) has no dedicated unit test coverage.
  - Ref: src/dependencies/DependencyManager.test.ts, src/dependencies/DependencyManager.ts:386-416
- [LOW] DstError imported but unused in RealDstIO.ts (dead code)
  - Challenge: RealDstIO.ts line 6 imports `{ DstError } from './DstIO'` but never references it anywhere in the file. This is dead code and confirms the error-parity gap (F-IMP-01) was unintentional — the developer started to implement DstError wrapping but didn't complete it.
  - Alternative: Either remove the import (if the decision is that RealDstIO should NOT wrap into DstError) or use it in every fs-calling method as described in F-IMP-01.
  - Risk: Dead import is a lint concern (unused symbol) and signals incomplete implementation.
  - Ref: src/dst/RealDstIO.ts:6
- [LOW] MockDstIO.stat() does not resolve symlinks
  - Challenge: MockDstIO.statImpl when called with isLstat=false (stat) does not check the symlinks map at all — it only checks this.files. When a path exists only as a symlink entry (via addSymlink) with no corresponding file entry, stat() throws ENOENT. On a real filesystem, stat() follows symlinks to the target file. In DependencyManager only lstat is used (fsLstat), so this doesn't affect the current task scope, but it's a gap in MockDstIO fidelity.
  - Alternative: Enhance statImpl's `isLstat=false` path to check symlinks map, resolve the target path via addSymlink's mapping, and return the target file's stats if it exists.
  - Risk: If future code uses stat() (not just lstat) in a DST-testable path, MockDstIO would produce different results than a real filesystem.
  - Ref: src/dst/MockDstIO.ts:137-162
- [LOW] createNode() duplicates metadata parsing logic
  - Challenge: DependencyManager.createNode() has two code paths: (a) the DstIO-aware path (lines 256-269) that re-reads file content via fsReadFile and manually parses metadata via MetadataManager.parseMetadata/validateMetadata, and (b) the non-DstIO path (lines 270-274) that delegates to MetadataManager.getPublicationStatus/getPublicationInfo. The DstIO-aware path duplicates the parsing logic that already exists in those MetadataManager static methods. Over time these two implementations could diverge (e.g., new metadata rules added to only one path).
  - Alternative: Refactor MetadataManager.getPublicationStatus and getPublicationInfo to accept an optional DstIO parameter, or add a static factory method that takes content string instead of file path, so the DstIO-aware path can reuse them.
  - Risk: Low in current scope — both paths work correctly. Maintenance divergence risk over time as metadata rules evolve.
  - Ref: src/dependencies/DependencyManager.ts:255-274

### Verdict

**REVISE**

Implementation structurally matches the plan (DstIO interface, MockDstIO, RealDstIO, DstHarness, DependencyManager DST injection all present and functional) but has one HIGH-severity deviation: RealDstIO breaks the plan's error-parity contract by throwing native Node.js errors instead of DstError instances. This is compounded by a dead DstError import in RealDstIO.ts (imported but never thrown). Additionally, three MEDIUM-severity documentation/spec accuracy issues (wrong constructor signature in tech_spec, resolveAll() reference vs actual buildDependencyTree API, and zero DST-injection tests in the main DependencyManager test suite) and three LOW concerns (dead import, stat symlink behavior, createNode duplication) require remediation before phase transition.
