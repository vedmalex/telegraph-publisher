# TASK-047 Work Unit W11: Documentation & Migration Guide

Branch: `dst-harness` in `/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher`.
DO NOT perform git reset/clean/stash. DO NOT commit or push.
Preserve all existing dirty files and caches in working tree.

## Allowed Files (to create/modify):
- `docs/EPUB-LARGE-BOOKS.md`
- `docs/API-REFERENCE.md`
- `docs/CLI-FLAGS-MIGRATION-GUIDE.md`
- `README.md` (only EPUB sections)

## 1. `docs/EPUB-LARGE-BOOKS.md`
Comprehensive guide on large EPUB handling:
- Exact default max chapter size: 300 KiB (307,200 bytes) of final serialized XHTML.
- Why splitting is essential: older and resource-constrained e-readers (Kindle, Kobo, etc.) stall or crash on XHTML files exceeding ~300KiB.
- Sizing details:
  - Exact UTF-8 byte calculation of complete final XHTML (wrapper, headers, text, navigation, rewritten links, image tags).
  - Monotonic binary-search cuts with heading preference.
  - Indivisible units: code blocks, tables, lists, blockquotes, verses/shlokas are kept atomic and not cut across arbitrary lines.
- Oversize policy:
  - `warn` (default): indivisible units larger than budget emit `W_OVERSIZE` warning and are preserved without data loss.
  - `error`: strictly rejects generation if any document exceeds limit.
- Streaming memory optimization (Stage B):
  - Ingestion via chunked streaming (64 KiB chunks) and raw spool store.
  - Spooled atomic unit payloads (`EpubSpoolStore`), single active unit in memory, $O(\max(\text{unit}) + \text{indexes})$ peak memory bound.
  - Two-pass store-only streaming ZIP container (`EpubZipWriter`), zero buffer-all accumulation.
  - Memory benchmark receipts: peak RSS bounds and scaling.
- CLI flags and examples:
  - `--max-chapter-size 300KiB`
  - `--no-auto-split` (opt-out of size splitting while retaining manual `--split-at`)
  - `--oversize-policy warn|error`
  - `--strict-links`
  - `--epub-report <path>`
  - `--epub-dry-run`
- Package integrity validation:
  - Container validation via `scripts/verify-epub-package.py`
  - EPUBCheck compatibility note (when EPUBCheck CLI/JAR is available).

## 2. `docs/API-REFERENCE.md`
Update EPUB Generator API section:
- `EpubGenerator` constructor options (`EpubInputOptions` / `NormalizedEpubOptions`):
  - Output path, title, author, language, identifier, cover, debug.
  - Split & layout options: `maxChapterBytes`, `splitAt`, `oversizePolicy`, `strictLinks`, `dryRun`.
  - Navigation & ToC options: `tocDepth`, `bookToc`, `bookTocDepth`, `bookTocTitle`, `chapterToc`, `chapterTocDepth`, etc.
  - Runtime injection: `runtime?: { io: EpubIO }`.
- Methods:
  - `addChapterFromFile(path, options)`
  - `generate(): Promise<EpubBuildReport>`
  - `analyze(): Promise<EpubBuildReport>`
  - `getLastReport(): EpubBuildReport | undefined`
  - `dispose(reason?): Promise<void>`
  - Legacy shims: `splitMarkdownByHeading`, `setChapterPathMap`.
- Diagnostics and Error codes:
  - `EpubBuildError` with stable codes: `E_OPTION`, `E_STATE`, `E_OVERSIZE`, `E_WRAPPER_OVERSIZE`, `E_LINK_UNRESOLVED`, `E_LINK_AMBIGUOUS`, etc.
  - Warnings: `W_OVERSIZE`, `W_LINK_UNRESOLVED`, `W_LEGACY_MAPPING`, etc.
  - `EpubBuildReport` JSON schema structure.

## 3. `docs/CLI-FLAGS-MIGRATION-GUIDE.md`
Migration guide for users and scripts:
- Summary of changes from legacy EPUB generator:
  - Default behavior: automatic size splitting at 300KiB UTF-8 byte boundary.
  - How to preserve previous single-file behavior: pass `--no-auto-split`.
  - How to preserve manual heading-only splitting: `--split-at 2 --no-auto-split`.
  - New diagnostic and analysis flags: `--epub-dry-run`, `--epub-report <file>`.
  - Strict links mode: `--strict-links` treats broken anchors as build errors.
  - Exit codes: 0 for success / dry-run, 1 for build/file errors, 2 for CLI option validation errors (`E_OPTION`).

## 4. `README.md`
- Update the EPUB section:
  - Mention large book support, automatic 300 KiB chapter splitting, and streaming I/O.
  - Document new CLI flags (`--max-chapter-size`, `--no-auto-split`, `--oversize-policy`, `--strict-links`, `--epub-report`, `--epub-dry-run`).
  - Link to `docs/EPUB-LARGE-BOOKS.md` and `docs/CLI-FLAGS-MIGRATION-GUIDE.md`.

## 5. Verification
- Verify formatting and accuracy of all 4 documentation files.
- Ensure no broken links in Markdown.
- Check git status (only allowed docs and README files modified).
