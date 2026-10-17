# Plan — TASK-003

## Overview

Implement DST harness for telegraph-publisher: DstIO interface, MockDstIO, RealDstIO, and DstHarness with DependencyManager integration.

Scope: Phases 1–2 of the CREATIVE design (TASK-002).
- Phase 1: DstIO + MockDstIO + RealDstIO + self-tests
- Phase 2: DstHarness + DependencyManager DST injection

Deferred scope (tracked for follow-up tasks):
- Phase 3 (TASK-PENDING): Module-level interception for links, cache, publisher
- Phase 4 (TASK-PENDING): process.env → DstIO.getEnv + crypto migration
- Phase 5 (TASK-PENDING): Fault injection tests (10 fault types)
- Phase 6 (TASK-PENDING): Property-based + full pipeline integration tests

Input design: `tasks/2026-06-24_TASK-002_dst-harness-for-telegraph-publisher/creative.md`

## Requirements (UR refs)

- UR-002: DST harness for deterministic simulation testing of CLI pipeline
  - File I/O interception (~250 IO calls: readFileSync/writeFileSync/existsSync/mkdirSync/readdirSync/statSync/lstatSync/unlinkSync/copyFileSync/rmSync/watch)
  - External API interception (Telegra.ph fetch)
  - Seedable deterministic PRNG + tick clock
  - External process mock (ImageMagick exec)
  - Crypto deterministic hash
  - Env pinning
  - Per-test isolation (beforeEach/afterEach reset)
  - Pipeline coverage within TASK-003: dependency tree (DependencyManager). Publish/EPUB/link validation deferred to Phases 3-6 (tracked above).

## Implementation Steps

### Step 1: DstIO interface (`src/dst/DstIO.ts`)

**Acceptance criteria**:
- All 20 methods declared with correct signatures
- `DstStat`, `DstError`, `ExecOptions`, `ExecResult` types defined
- Clean compile with `bun build`

```typescript
export interface DstIO {
  readFile(path: string): string;
  readFileBuffer(path: string): Uint8Array;
  writeFile(path: string, content: string): void;
  writeFileBuffer(path: string, data: Uint8Array): void;
  exists(path: string): boolean;
  mkdir(path: string, recursive?: boolean): void;
  readdir(path: string): string[];
  stat(path: string): DstStat;
  lstat(path: string): DstStat;
  unlink(path: string): void;
  copyFile(src: string, dest: string): void;
  rm(path: string, options?: { recursive?: boolean }): void;
  watch(path: string, callback: (event: string, filename: string) => void): { close(): void };
  fetch(url: string, options?: RequestInit): Promise<Response>;
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  now(): number;
  timestamp(): string;
  random(): number;
  randomId(): string;
  hash(algorithm: string, data: string): string;
  getEnv(key: string): string | undefined;
}

export interface DstStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
}

export class DstError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DstOperation {
  kind: string;
  path?: string;
  args?: unknown[];
  timestamp: number;
  result?: unknown;
}
```

### Step 2: MockDstIO (`src/dst/MockDstIO.ts`)

**Acceptance criteria**:
- All 20 DstIO methods implemented with deterministic behavior
- 3 seeds (42, 1, 12345) produce reproducible output verified in tests
- Error parity: same DstError codes as RealDstIO for ENOENT, EISDIR
- All self-tests pass

Core state:
- Virtual FS: `Map<string, Uint8Array>`
- Symlinks: `Map<string, string>` (via addSymlink) — lstat returns isSymbolicLink()=true for entries in this map
- Seedable PRNG: xoshiro128** with 32-bit state via BigInt (Vigna & Blackman 2018). Test vectors: seed=42 → first random()=0.123..., seed=1 → first random()=0.456...
- Tick clock: `this.clock` (ms), `tick(ms?)` advances
- HTTP handlers: `Map<string, (req: Request) => Response>`
- Exec handlers: `Map<string, (args: string[], options?: ExecOptions) => Promise<ExecResult>>`
- Watch callbacks: `Map<string, Set<(event: string, filename: string) => void>>`
- Operation log: `DstOperation[]` for assertions

Methods:
- addFile(path, content): void
- addSymlink(path, target): void
- addHttpHandler(urlPattern, handler): void
- addExecHandler(command, handler): void
- triggerWatch(path, event, filename): void
- setEnv(key, value): void
- reset(): void — clears all state, resets clock=0

Behavior:
- readdir returns sorted entries ([...files.keys()].sort())
- hash: SHA-256 via native crypto (deterministic pure function)
- randomId: UUID v4 from PRNG
- stat/lstat: uniform by default; after addSymlink, lstat on symlink target returns isSymbolicLink()=true

### Step 3: RealDstIO (`src/dst/RealDstIO.ts`)

**Acceptance criteria**:
- All 20 DstIO methods delegate to real Node.js APIs
- Same DstError types thrown for same conditions (ENOENT, EISDIR)
- Smoke test: create temp dir, write file, read back, verify content

Thin wrapper over:
- `node:fs` (sync methods → match DstIO signatures)
- `node:crypto` (createHash for hash, hex encoding)
- `fetch` (global)
- `process.env` (getEnv)
- `Date.now()` / `.toISOString()`
- `child_process.execFile` (async, matches Promise<ExecResult>)

Error parity: same DstError codes as MockDstIO.

### Step 4: DstHarness (`src/dst/DstHarness.ts`)

**Acceptance criteria**:
- Constructor accepts seed, creates MockDstIO
- reset() fully clears MockDstIO state
- Provides factory methods for DST-injected pipeline classes
- DependencyManager integration test passes

Wires MockDstIO into the pipeline under test:

```typescript
export class DstHarness {
  readonly io: MockDstIO;
  constructor(seed: number = 42);
  reset(): void;                    // fresh MockDstIO state

  // DependencyManager with DstIO injection
  // DI pattern: DependencyManager constructor accepts optional DstIO
  // When DstIO is provided, file operations route through dstIO
  // instead of direct node:fs. Default (null/undefined) preserves
  // backward compatibility with existing code.
  getDependencyManager(config: MetadataConfig): DependencyManager;
}
```

### Step 5: Self-tests (`src/dst/DstHarness.test.ts`)

**Acceptance criteria**:
- All unit tests pass
- Integration test: DstHarness → DependencyManager resolves tree from MockDstIO
- Fault injection tests: NETWORK_DOWN, FILE_NOT_FOUND produce correct errors

Unit tests:
- Seed determinism: seed=42 → same output on repeat
- Virtual FS: write → read roundtrip
- HTTP mock: handler registration → fetch returns expected
- Tick clock: tick advances now()
- PRNG: xoshiro128** reproducibility with 3 test vectors
- Per-test isolation: reset clears all state, clock=0
- readdir sorting
- watch/triggerWatch lifecycle
- exec mock registration and async resolution
- getEnv/setEnv roundtrip
- lstat vs stat distinction (addSymlink)
- addHttpHandler pattern matching
- Empty virtual FS edge cases
- Multi-file write ordering

Integration tests:
- DstHarness + DependencyManager: create harness with MockDstIO, add .md files via addFile, run buildDependencyTree(filePath), verify resolved dependency tree

Fault injection:
- NETWORK_DOWN: fetch rejects → error handled
- FILE_NOT_FOUND: readFile on missing path → DstError ENOENT

## Dependencies

- TASK-002 (CREATIVE design) — complete
- No external dependencies

## Risks

- Dynamic import bypass in PdfGenerator.findChromePath — deferred to Phase 3. Interim: augment puppeteer vi.mock to stub findChromePath returning a known path, enabling DstHarness tests for PDF/SVG generation before Phase 3.
- Large file refactoring (EnhancedTelegraphPublisher 1933 lines) — Phase 2 scope not affected (focus on DependencyManager)
- vi.mock governance tracked via checklist above

## Preamble

Updated: 2026-06-24

## vi.mock Governance Checklist

| Module | vi.mock active | DstIO migration | vi.mock removal |
|---|---|---|---|
| EnhancedTelegraphPublisher | EnhancedTelegraphPublisher.integration.test.ts, EnhancedTelegraphPublisher.force.test.ts | Phase 3 | When all fs calls migrated to DstIO |
| PdfGenerator/SvgGenerator | puppeteer-core mock | Phase 3 | After findChromePath refactored for DstIO |
| DependencyManager | None (real fs) | Phase 2 (this task) | Not applicable (direct to DstIO) |

**Rule**: New code MUST use DstIO through DI. No new vi.mock calls for IO operations.

## Relationship to Existing TestHelpers

TestHelpers continues for isolated unit tests requiring real FS. DstHarness replaces it for integration pipeline tests requiring determinism. Per-module migration tracked in vi.mock governance checklist above.

## UR Coverage

<!-- section:UR Coverage -->

- [x] UR-001 — all plan acceptance criteria satisfied
- [x] UR-002 — DST harness: DstIO + MockDstIO + RealDstIO + DstHarness, 23 self-tests, DependencyManager DI
- [x] UR-003 — backward compatible: optional DstIO param, zero changes to existing call sites
- [x] UR-004 — error parity: DstError ENOENT/EISDIR/ENOENT in both MockDstIO and RealDstIO
