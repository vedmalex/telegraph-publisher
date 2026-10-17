# TASK-047 Work Unit W10: Independent Verification Infrastructure & Evidence

Branch: `dst-harness` in `/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher`.
DO NOT perform git reset/clean/stash. DO NOT commit or push.
Preserve all existing dirty files and caches in working tree.

## Allowed Files (to create/modify):
- `src/epub/EpubPipeline.dst.test.ts`
- `tests/integration/epub-large-files.test.ts`
- `tests/fixtures/epub-large-files/**` (if fixtures needed on disk, or generate in tmp)
- `scripts/verify-epub-package.py`
- `scripts/benchmark-epub-memory.ts`
- `scripts/check-epub-mutations.ts`

## 1. `src/epub/EpubPipeline.dst.test.ts`
Full Deterministic Simulation Testing (DST) of the real `EpubGenerator` with `MockEpubIO`:
- Seed corpus: deterministic schedules and chunk boundaries.
- Tests invariants:
  - Error and abort cleanup: writers, temp directories cleaned up on abort/failure before commit.
  - Output sentinel: destination file is NEVER modified or corrupted when an error occurs before atomic rename.
  - Backpressure & drain testing: writer pause and resume.
  - Chunk boundaries: 1-byte chunks across multibyte UTF-8 characters and code fences.
  - Concurrent builds: concurrent builds targeting the same output do not interleave corrupt files; latter successful rename wins atomically.
  - Idempotent disposal: calling `dispose()` multiple times does not throw or double-free resources.

## 2. `scripts/verify-epub-package.py`
Standalone Python script to inspect and verify an EPUB container using stdlib `zipfile`, `xml.etree.ElementTree`, `hashlib`:
- CLI: `python3 scripts/verify-epub-package.py <epub-path> [--max-xhtml-bytes <limit>] [--allow-oversized] [--report <report-path>]`
- Checks:
  - Valid ZIP: `testzip()` returns no errors.
  - First entry is strictly uncompressed `mimetype` with content `application/epub+zip`.
  - Remaining entries in POSIX sorting order.
  - Valid `META-INF/container.xml` pointing to OPF rootfile.
  - OPF XML parses, manifest and spine items exist.
  - Every spine XHTML file exists and is valid XML.
  - Verifies UTF-8 byte size of each XHTML against `--max-xhtml-bytes` (default: 307200).
  - Verifies local fragment targets (`href="chapter-X.html#target"` -> element with `id="target"` exists in `chapter-X.html`).
  - Verifies all manifest image files exist in archive.
- Returns exit code 0 on success, 1 on verification failure.

## 3. `tests/integration/epub-large-files.test.ts`
End-to-end integration test of EPUB generation with large and realistic markdown documents:
- Multi-chapter book generation via `EpubGenerator` and CLI (`EnhancedCommands`).
- Splits large chapters (>300KiB) into multiple sub-chapters without losing content or breaking links.
- Verified with `scripts/verify-epub-package.py`.
- Tests both EPUB 3 and EPUB 2 output packages.
- Tests `--epub-dry-run` and `--epub-report`.

## 4. `scripts/check-epub-mutations.ts`
Mutation tester for the 16 named mutations in plan §7.2:
- Mutants: M01_FIRST_PART ... M16_SKIP_BACKPRESSURE.
- For each mutant:
  - Tests running on candidate tree or temporary copy.
  - Confirms baseline test PASS, mutant fails with specific expected assertion failure (RED), restored PASS.
  - Writes mutation execution receipt JSON.

## 5. `scripts/benchmark-epub-memory.ts`
Separate-process memory benchmark:
- Spawns bun CLI processes on generated Russian corpora (20MiB and 80MiB).
- Measures peak RSS using `/usr/bin/time -l` on macOS or process polling.
- Verifies bounded memory usage.

## 6. Verification
Run:
- `bun test src/epub/EpubPipeline.dst.test.ts`
- `bun test tests/integration/epub-large-files.test.ts`
- `python3 scripts/verify-epub-package.py <sample.epub>`
- `bun test`
Report test pass counts and SHA-256 fingerprints.
