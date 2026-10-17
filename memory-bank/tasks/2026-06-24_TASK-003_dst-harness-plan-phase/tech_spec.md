# Tech Spec — TASK-003

## Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────┐
│              DstHarness                      │
│  ┌───────────────────────────────────────┐   │
│  │            MockDstIO                  │   │
│  │  ┌──────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ VFS  │ │ Handlers │ │  State   │  │   │
│  │  │ Map  │ │ HTTP/Exec│ │ Log/Env  │  │   │
│  │  └──────┘ └──────────┘ └──────────┘  │   │
│  └───────────────────────────────────────┘   │
│              ▲ implements                     │
│  ┌───────────┴───────────────┐                │
│  │        DstIO interface    │                │
│  └───────────┬───────────────┘                │
│              ▲ implements                     │
│  ┌───────────┴───────────────┐                │
│  │        RealDstIO          │                │
│  │  node:fs | crypto | fetch │                │
│  └───────────────────────────┘                │
│                                               │
│  DstHarness.getDependencyManager(config)      │
│    → DependencyManager(config, pathResolver, dstIO) │
└─────────────────────────────────────────────┘
```

### DI Pattern

- `DependencyManager` constructor: `constructor(config: MetadataConfig, pathResolver: PathResolver, dstIO?: DstIO)`
- When `dstIO` is provided, ALL file operations route through it instead of `node:fs`
- When `dstIO` is undefined/null, existing behavior preserved (direct `node:fs`)
- This avoids modifying any existing call sites

### File Layout

```
src/dst/
  DstIO.ts          — interface + type exports
  MockDstIO.ts      — deterministic mock implementation
  RealDstIO.ts      — Node.js production wrapper
  DstHarness.ts     — test harness wiring DependencyManager
  DstHarness.test.ts — self-tests + integration test
```

## Components

### DstIO Interface (`src/dst/DstIO.ts`)

20 methods across 6 categories:

| Category | Methods |
|---|---|
| File read | readFile, readFileBuffer |
| File write | writeFile, writeFileBuffer |
| FS metadata | exists, mkdir, readdir, stat, lstat |
| FS mutation | unlink, copyFile, rm |
| Watch | watch |
| External | fetch, exec |
| Deterministic | now, timestamp, random, randomId, hash |
| Env | getEnv |

Supporting types: `DstStat`, `DstError`, `ExecOptions`, `ExecResult`, `DstOperation`.

### MockDstIO (`src/dst/MockDstIO.ts`)

**State**:

```typescript
class MockDstIO implements DstIO {
  private files: Map<string, Uint8Array> = new Map();
  private symlinks: Map<string, string> = new Map();
  private httpHandlers: Map<string, (req: Request) => Response> = new Map();
  private execHandlers: Map<string, (args: string[], opts?: ExecOptions) => Promise<ExecResult>> = new Map();
  private watchCallbacks: Map<string, Set<(event: string, filename: string) => void>> = new Map();
  private env: Map<string, string> = new Map();
  private ops: DstOperation[] = [];
  private clock: number = 0;
  private prngState: [bigint, bigint, bigint, bigint]; // xoshiro128** 128-bit
}
```

**PRNG: xoshiro128** (128-bit state, 4 × 32-bit words)**

- Implemented via BigInt for bitwise ops
- `s0`, `s1`, `s2`, `s3` — initialized from seed via SplitMix64 generator
- Step: `result = rotl(s1 * 5n, 7n) * 9n`; `t = s1 << 9n`; `s2 ^= s0`; `s3 ^= s1`; `s1 ^= s2`; `s0 ^= s3`; `s2 ^= t`; `s3 = rotl(s3, 11n)`
- `random()` returns `Number(result & 0x7fffffffn) / 0x80000000`
- Test vectors: seed=42 → first random() = ? (verified by test, 3 standard seeds)

**Tick Clock**:

- `this.clock` starts at 0
- `tick(ms = 1)`: `this.clock += ms`
- `now()` returns `this.clock`
- `timestamp()` returns `new Date(this.clock).toISOString()`

**Virtual FS**:

- `addFile(path, content: string | Uint8Array)`: stores as Uint8Array
- `addSymlink(path, target)`: adds to symlinks map
- `readFile(path)`: `new TextDecoder().decode(files.get(path))`
- `readFileBuffer(path)`: returns `files.get(path)`
- `writeFile(path, content)`: `files.set(normalize(path), new TextEncoder().encode(content))`
- `writeFileBuffer(path, data)`: `files.set(normalize(path), data)`
- `exists(path)`: `files.has(path)` or `symlinks.has(path)`
- `mkdir(path)`: no-op (virtual FS is flat)
- `readdir(path)`: returns sorted filenames in path prefix
- `stat/lstat`: build DstStat from file entry; `lstat` checks `symlinks` map first for `isSymbolicLink()`
- `unlink(path)`: `files.delete(path)`
- `copyFile(src, dest)`: copies bytes
- `rm(path, {recursive})`: deletes single file or all prefixed
- Errors: `throw new DstError('ENOENT', path)` for missing paths

**Handlers**:

- `addHttpHandler(urlPattern, fn)`: pattern is substring match against URL
- `fetch(url)`: finds matching handler, calls it with `new Request(url)`
- `addExecHandler(cmd, fn)`: `cmd` is the command name (e.g. `'magick'`)
- `exec(cmd, args)`: finds handler by cmd, calls with args
- `triggerWatch(path, event, filename)`: calls all callbacks registered for path
- `setEnv(key, value)`: sets env entry
- `getEnv(key)`: returns env entry or process.env[key] as fallback

**Operation Log**:

Each mutating call `push({kind, path, args, timestamp, result})` to `ops[]`.
Exposed as `readonly ops: readonly DstOperation[]` for test assertions.

**Reset**:

`reset()` clears all state: files, symlinks, handlers, callbacks, env, ops; sets clock=0; reinitializes PRNG from saved seed.

### RealDstIO (`src/dst/RealDstIO.ts`)

```typescript
class RealDstIO implements DstIO {
  readFile(path): fs.readFileSync(path, 'utf-8')
  readFileBuffer(path): fs.readFileSync(path)
  writeFile(path, content): fs.writeFileSync(path, content)
  writeFileBuffer(path, data): fs.writeFileSync(path, data)
  exists(path): fs.existsSync(path)
  mkdir(path, recursive): fs.mkdirSync(path, { recursive })
  readdir(path): fs.readdirSync(path)
  stat(path): fs.statSync(path)  // cast to DstStat via wrapper
  lstat(path): fs.lstatSync(path) // cast to DstStat via wrapper
  unlink(path): fs.unlinkSync(path)
  copyFile(src, dest): fs.copyFileSync(src, dest)
  rm(path, opts): fs.rmSync(path, opts)
  watch(path, cb): fs.watch(path, (e, f) => cb(e, f))
  fetch(url, opts): globalThis.fetch(url, opts)
  exec(cmd, args, opts): child_process.execFile(cmd, args, opts)
  now(): Date.now()
  timestamp(): new Date().toISOString()
  random(): Math.random()
  randomId(): crypto.randomUUID()
  hash(algo, data): crypto.createHash(algo).update(data).digest('hex')
  getEnv(key): process.env[key]
}
```

Node.js `fs.Stats` wrapped via adapter to match `DstStat` interface shape.

### DstHarness (`src/dst/DstHarness.ts`)

```typescript
class DstHarness {
  readonly io: MockDstIO;

  constructor(seed: number = 42) {
    this.io = new MockDstIO(seed);
  }

  reset(): void {
    this.io.reset();
  }

  getDependencyManager(config: MetadataConfig): DependencyManager {
    return new DependencyManager(this.io, config);
  }
}
```

### DependencyManager Changes

- New optional `dstIO?: DstIO` parameter added to constructor
- ALL fs calls delegate to `this.dstIO` when present: readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, lstatSync, unlinkSync, copyFileSync, rmSync, watch
- No changes to existing call sites (constructor overload preserves backward compat)

## Data Model

### DstStat

```typescript
interface DstStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
}
```

### DstError

```typescript
class DstError extends Error {
  code: string;  // 'ENOENT' | 'EISDIR' | 'ENETDOWN'
  constructor(message: string, code: string);
}
```

### DstOperation

```typescript
interface DstOperation {
  kind: string;
  path?: string;
  args?: unknown[];
  timestamp: number;
  result?: unknown;
}
```

### Mock Virtual FS Key

- Paths normalized: strip trailing `/`, resolve `.` and `..`
- Flat map (no real hierarchy), but readdir filters by prefix
- Stats computed from content length + mtimeMs (epoch from clock on write)

## API / Interfaces

### Public API (test-consumer visible)

```typescript
// Create harness
const h = new DstHarness(seed?: number);

// Setup virtual FS
h.io.addFile('/path/to/file.md', '# Title\ncontent');
h.io.addFile('/path/to/other.md', 'other');
h.io.addSymlink('/path/to/link.md', '/path/to/other.md');

// Register handlers
h.io.addHttpHandler('api.telegra.ph', (req) => new Response('{}', {status: 200}));
h.io.addExecHandler('magick', async (args) => ({stdout: '', stderr: '', exitCode: 0}));

// Advance time
h.io.tick(1000);  // advance 1 second
h.io.now();       // → 1000

// Get DST-injected module
const dm = h.getDependencyManager(config);
const tree = dm.buildDependencyTree("/path/to/file.md");

// Assert on operation log
assert(h.io.ops.some(op => op.kind === 'readFile' && op.path === '/path/to/file.md'));

// Assert on state
assert(h.io.exists('/path/to/file.md'));

// Reset for next test
h.reset();
```

## Error Handling

| Condition | Error | Code |
|---|---|---|
| Read missing file | DstError | ENOENT |
| Read directory path | DstError | EISDIR |
| Write to missing parent | DstError | ENOENT |
| Fetch: no handler registered | DstError | ENETDOWN |
| Exec: no handler registered | DstError | ENOENT |
| CopyFile: source missing | DstError | ENOENT |
| stat/lstat: path missing | DstError | ENOENT |

Error parity: `MockDstIO` and `RealDstIO` throw the same `DstError(code)` types for equivalent conditions.

## Preamble

Updated: 2026-06-24

## UR Coverage

<!-- section:UR Coverage -->

- [x] UR-001 — DST harness architecture designed: DstIO/MockDstIO/RealDstIO/DstHarness
- [x] UR-002 — DependencyManager DI pattern specified
- [x] UR-003 — backward compatible overload specified
- [x] UR-004 — error parity matrix documented
