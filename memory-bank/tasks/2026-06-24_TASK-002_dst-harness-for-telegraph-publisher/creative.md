# CREATIVE: DST Harness for telegraph-publisher

## Problem Statement

telelegraph-publisher — CLI для публикации Markdown в Telegra.ph, EPUB/PDF/SVG.
Не имеет конкурентных write-surfaces (0 по DST scan), но IO-зависим:

| IO-категория | Кол-во | Где |
|---|---|---|
| readFileSync | ~50 | markdown, cache, config, metadata |
| writeFileSync | ~50 | cache, metadata, debug JSON, reports |
| existsSync | ~80 | PathResolver, LinkVerifier, ConfigManager |
| mkdirSync | ~30 | temp dirs, test setup |
| unlinkSync / rmSync | ~30 | test cleanup, temp files |
| copyFileSync | 1 | EPUB temp structure |
| readdirSync | 2 | directory traversal |
| statSync | 10 | config cache, timestamps |
| lstatSync | 13 | symlink resolution (MetadataManager, ContentProcessor, DependencyManager, PublicationWorkflowManager) |
| fetch (HTTP) | 11 | Telegra.ph API (7), Imgur, GitHub Gist, EnhancedTelegraphPublisher |
| Date.now() | ~80 | timestamps, IDs, progress, rate-limiter TTL, retry-after, flood-wait |
| new Date().toISOString() | ~85 | metadata (publishedAt, updatedAt), debug logs |
| Math.random() | 3 | filenames, registration |
| crypto.createHash | 3 | SHA-256 cache keys, content hashing |
| process.env | 6 | USE_UNIFIED_ANCHORS, GITHUB_TOKEN, IMGUR_CLIENT_ID, NODE_ENV |
| execFileSync / spawn | 1 | ImageMagick convert (SVG→PNG) |
| fs.watch | 1 | HierarchicalConfigCache (dual-watcher: dir + file) |

## Design — Deterministic IO Harness

### 1. DstIO Interface

```typescript
interface DstIO {
  // File system — text
  readFile(path: string): string;
  writeFile(path: string, content: string): void;

  // File system — binary
  readFileBuffer(path: string): Uint8Array;
  writeFileBuffer(path: string, data: Uint8Array): void;

  // File system — metadata & directory
  exists(path: string): boolean;
  mkdir(path: string, recursive?: boolean): void;
  readdir(path: string): string[];
  stat(path: string): Stat;
  lstat(path: string): Stat;  // symlink-aware stat
  unlink(path: string): void;
  copyFile(src: string, dest: string): void;
  rm(path: string, options?: { recursive?: boolean }): void;

  // File system — watch
  watch(path: string, callback: (event: string, filename: string) => void): { close(): void };

  // HTTP
  fetch(url: string, options?: RequestInit): Promise<Response>;

  // External processes
  exec(command: string, args: string[], options?: ExecOptions): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  // Clock
  now(): number;              // Date.now()
  timestamp(): string;         // new Date().toISOString()

  // Random
  random(): number;            // Math.random() — seedable
  randomId(): string;          // crypto.randomUUID-like — seedable

  // Crypto
  hash(algorithm: string, data: string): string;  // createHash wrapper

  // Environment
  getEnv(key: string): string | undefined;
}
```

### 2. Implementations

- **RealDstIO** — обёртка над node:fs, node:crypto, fetch, process.env, Date, child_process
- **MockDstIO** — seedable PRNG (xoshiro128**), виртуальная ФС (Map<string, Uint8Array>), mock HTTP, tick-часы, стабы exec/hash

```typescript
class MockDstIO implements DstIO {
  private seed: number;
  private clock: number;
  private files: Map<string, Uint8Array>;
  private httpHandlers: Map<string, (req: Request) => Response>;
  private env: Record<string, string>;
  private watchCallbacks: Map<string, (event: string, filename: string) => void>;
  private execHandlers: Map<string, (args: string[]) => ExecResult>;
  private log: DstOperation[];

  constructor(seed: number = 42) { ... }

  // Seedable PRNG — xoshiro128**
  random(): number { ... }
  randomId(): string { ... }

  // Tick deterministic clock
  tick(ms?: number): void { this.clock += ms ?? 1; }

  // Env pinning
  setEnv(key: string, value: string): void { ... }

  // Setup fixture files (text or binary)
  addFile(path: string, content: string | Uint8Array): void { ... }

  // Register HTTP mock
  addHttpHandler(urlPattern: string, handler: (req: Request) => Response): void { ... }

  // Register process mock
  addExecHandler(command: string, handler: (args: string[]) => ExecResult): void { ... }

  // Trigger watch event programmatically (from test)
  triggerWatch(path: string, event: string, filename: string): void { ... }

  // Per-test isolation
  reset(): void {
    this.files.clear();
    this.httpHandlers.clear();
    this.watchCallbacks.clear();
    this.execHandlers.clear();
    this.log = [];
    this.clock = 0;
  }
}
```

### 3. Interception Strategy

| Layer | Механизм | Цель | Когда использовать |
|---|---|---|---|
| 1 — Module-level | `vi.mock('node:fs')`, `vi.mock('node:http')`, `vi.mock('puppeteer-core')` | Быстрые unit-тесты отдельных модулей | Legacy-модули, ещё не мигрированные на DstIO |
| 2 — Integration | `DstHarness` обёртка над `EnhancedCommands` | Полный pipeline с MockDstIO | Новый код, интеграционные сценарии |

**Governance rule**: vi.mock — временная мера для legacy. Новый код использует DstIO через DI. DstHarness тесты — source of truth для интеграции. При миграции модуля на DstIO, соответствующие vi.mock удаляются.

### 4. Per-Test Isolation

Каждый тест создаёт свежий экземпляр: `new MockDstIO(seed)`. `DstHarness.reset()` для `beforeEach`/`afterEach`.

```typescript
let harness: DstHarness;
beforeEach(() => { harness = new DstHarness(42); });
afterEach(() => { harness.reset(); });
```

### 5. readdir Determinism (D5)

`MockDstIO.readdir()` всегда возвращает отсортированные по алфавиту записи: `[...entries].sort()`. Все тесты, зависящие от порядка файлов, используют MockDstIO → гарантированная воспроизводимость на любой платформе.

### 6. Invariants

| INV | Формулировка | Проверка |
|---|---|---|
| INV-1 | Seed=42 → идентичный TelegraphNode output | snapshots |
| INV-2 | EPUB порядок = BFS по дереву зависимостей | assertion |
| INV-3 | Все .md ссылки → chapter-N.html разрешаются | assertion |
| INV-4 | Кэш консистентен после publish | mock+assert |
| INV-5 | Network fault не повреждает локальные файлы | fault test |
| INV-6 | Повтор seed=X → результат Y (полный детерминизм) | snapshot match |

### 7. Fault Injection Catalog

| Fault | Surface | Ожидаемое поведение |
|---|---|---|
| NETWORK_DOWN | DstIO.fetch reject | Публикация падает с ошибкой, файлы не тронуты |
| FILE_NOT_FOUND | DstIO.readFile reject | Ранний exit с диагностикой |
| CORRUPT_CACHE | DstIO.readFile → invalid JSON | Graceful rebuild cache |
| SLOW_NETWORK | DstIO.fetch delay > timeout | Timeout error |
| PARTIAL_WRITE | DstIO.writeFile fails на 2-й записи | Атомарность: rollback |
| EMPTY_FILE | DstIO.readFile → '' | Обработка пустого контента |
| IMAGE_CONVERT_FAIL | DstIO.exec('convert') → exitCode=1 | Graceful skip upload |
| PUPPETEER_FAIL | puppeteer.launch rejects (Chrome not found) | Graceful fallback |
| BINARY_CORRUPT | Image file read → corrupt Buffer | Upload fails safe |
| ENV_MISSING | DstIO.getEnv → undefined | Понятное сообщение об ошибке |

### 8. crypto.createHash Strategy

`DstIO.hash()` — для ускорения в MockDstIO реализовать как простой checksum (FNV-1a) или прокси на реальный SHA-256 (чистый детерминизм). Выбор: использовать реальный SHA-256 как pure функцию для точности, т.к. он детерминирован по определению.

### 9. process.env Migration

Все чтения `process.env.X` в production-коде заменяются на `dstIO.getEnv('X')`. На время миграции:

```typescript
class MigrationDstIO extends RealDstIO {
  getEnv(key: string): string | undefined {
    return this.envOverrides[key] ?? process.env[key];
  }
}
```

### 10. External Processes (exec + puppeteer)

```typescript
// DstIO.exec — for ImageMagick, Bun.$, etc.
interface ExecOptions { timeout?: number; cwd?: string; }
const result = await dstIO.exec('convert', ['input.png', 'output.jpg']);

// Puppeteer — vi.mock at module level
vi.mock('puppeteer-core', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn(),
        pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-mock')),
        screenshot: vi.fn(),
        close: vi.fn(),
      }),
    }),
  },
}));
```

**Dynamic import bypass**: `PdfGenerator.findChromePath` (line 356) and `SvgGenerator.findChromePath` (line 484) use `const { existsSync } = await import("node:fs")` inside the method body — runtime dynamic import that bypasses module-level DI. Strategy:
1. Refactor `findChromePath` to accept `DstIO` as parameter or lift `existsSync` call to constructor
2. Until refactored: augment puppeteer `vi.mock` to also override `findChromePath` to return a known path

### 11. fs.watch Strategy

`HierarchicalConfigCache` регистрирует **два watcher-а** на каждый путь: один на директорию, один на файл. `MockDstIO.watch` имитирует это:

```typescript
watch(path: string, cb: (event: string, filename: string) => void): { close(): void } {
  // Автоматически регистрирует dir-watcher если path — внутри директории
  const id = this.registerWatch(path, cb);
  return { close: () => this.unregisterWatch(id) };
}
```

Два режима:
1. **Passive**: хранит callback, ничего не вызывает (тест сам триггерит через `triggerWatch`)
2. **Pre-recorded**: воспроизводит заранее заданную последовательность событий

`triggerWatch` итерирует все зарегистрированные watcher-ы на данный path (включая dir-watcher). Тесты конфигурационного hot-reload триггерят события вручную: `mockIO.triggerWatch('/path/to/config.json', 'change', 'config.json')`.

### 12. Relationship to Existing TestHelpers

Кодовая база уже имеет `TestHelpers.ts` с утилитами: `createTempDir`, `createTestFile`, `createTestProject`, mock-ответы для Telegra.ph API. DstHarness **не заменяет** TestHelpers, а дополняет:

| TestHelpers | DstHarness |
|---|---|
| Реальная ФС (temp-директории) | Виртуальная ФС (MockDstIO.files) |
| Реальные HTTP-вызовы (c vi.mock) | Mock-обработчики (httpHandlers) |
| Для изолированных unit-тестов | Для integration pipeline-тестов |
| Не детерминирован (зависит от OS, сети) | Полностью детерминирован |

Migration path: новые тесты пишутся на DstHarness; существующие TestHelpers-тесты мигрируются при рефакторинге модуля.

### 13. File Structure

```
src/dst/
├── DstIO.ts              # Interface
├── RealDstIO.ts           # Production wrapper
├── MockDstIO.ts           # Deterministic mock + PRNG
├── DstHarness.ts          # Integration harness
├── DstHarness.test.ts     # Self-tests
├── invariants.ts          # Invariant checkers
└── faults.ts              # Fault injection types
```

### 14. Migration Phases

| Phase | Описание | DA gate |
|---|---|---|
| 1 | DstIO interface + MockDstIO + RealDstIO + базовые тесты | — |
| 2 | DstHarness + первые DST-тесты на DependencyManager | ✓ |
| 3 | Module-level interception для links, cache, publisher | ✓ |
| 4 | Миграция process.env → DstIO.getEnv + crypto | ✓ |
| 5 | Fault injection тесты (10 fault types) | ✓ |
| 6 | Property-based + полный pipeline integration тесты | ✓ |
