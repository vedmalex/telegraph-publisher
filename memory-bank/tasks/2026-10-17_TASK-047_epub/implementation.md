# Implementation — TASK-047: Large EPUB Slicing, Exact Byte-Budget Layout, Streaming I/O & Memory Optimization

Updated: 2026-10-17

## Executive Summary

TASK-047 delivers a comprehensive, streaming, memory-bounded EPUB generation engine capable of handling arbitrarily large Markdown manuscripts without exceeding reader memory limits (~300 KiB XHTML budget per spine chapter). All 12 work units (W0 through W11) across both Stage A (Exact Byte-Budget Layout Engine) and Stage B (Streaming Block-Framer & Low-Memory Generation) have been fully designed, implemented, verified, tested, and documented.

## Changes Made & Architecture

### W0: Baseline & Test Freeze
- Authored `.plan/TASK-047-epub-large-files-plan.md` defining architecture, data contracts, and verification gates.
- Freezed existing tests and established non-regression boundaries.

### W1: EPUB AST & Token Renderer
- Extended Marked token pipeline with custom tokens (`epub-list`, `epub-table`).
- Created `src/epub/EpubMarkdownDocument.ts` parsing source into atomic `EpubAtomicUnit` blocks with line/byte boundaries and `keepWithNext` properties.
- Created `src/epub/EpubTokenRenderer.ts` preserving Sanskrit shloka atomicity (`|` and `||`) and generating valid XHTML without mangling poetry into tables.
- Updated `src/markdownConverter.ts` with EPUB compilation target routing.

### W2: Anchor Registry & Symbol Resolution
- Created `src/epub/EpubAnchorRegistry.ts` providing deterministic URI normalization, Unicode NFC normalization, explicit `{#custom-id}` anchor tracking, duplicate resolution, and exact part-targeted link rewriting (`chapter-001_part-002.xhtml#anchor`).

### W3: Navigation & Outline Builders
- Created `src/epub/EpubNavigation.ts` implementing EPUB 2 NCX, EPUB 3 Navigation Document (`nav.xhtml`), Book Table of Contents (`toc.xhtml`), and in-chapter sub-TOC/navbars at chapter start and end.

### W4: Configuration & Build Diagnostics
- Created `src/epub/EpubOptions.ts` and `src/cli/EpubCliOptions.ts` with strict byte-size parsing (`parseByteSize`: `300KiB`, `250K`, `1M`), validation error codes (`E_OPTION`), and option normalization.
- Created `src/epub/EpubDiagnostics.ts` emitting canonical `EpubBuildReport` JSON summaries with counters, timing, source mapping, and diagnostics.

### W5: Layout Planner & XHTML Renderer
- Created `src/epub/EpubLayoutPlanner.ts` implementing monotonic binary search cuts with heading-preference hierarchy (H2 > H3 > H4 > paragraph), prefix-sum byte estimates, and exact UTF-8 verification loop.
- Created `src/epub/EpubXhtmlRenderer.ts` rendering well-formed XHTML with XML prologs, DOCTYPE, CSS styling, synthesized chapter headings, and atomic unit payloads.

### W7: Streaming I/O, Session Management & Spooling
- Created `src/epub/EpubIO.ts`, `src/epub/RealEpubIO.ts`, and `src/epub/MockEpubIO.ts` supporting chunked streaming (`readChunks`), backpressure, and atomic replacement.
- Created `src/epub/EpubBuildSession.ts` ensuring atomic staging directories, owned path security checks, and sentinel file preservation on failures or aborts.
- Created `src/epub/EpubSpoolStore.ts` storing atomic units to temporary spool files to bound RAM consumption to $\mathcal{O}(\max(\text{unit}) + \text{index})$.
- Created `src/epub/EpubZipWriter.ts` implementing a 2-pass store-only streaming ZIP container (`mimetype` uncompressed first, streaming file entries, ending with Central Directory).

### W8: Incremental Block Framer & Source Scanner
- Created `src/epub/EpubBlockFramer.ts` framing arbitrary 64 KiB chunks into atomic markdown blocks without splitting multi-line constructs (code blocks, tables, lists, quotes).
- Created `src/epub/EpubSourceScanner.ts` streaming source files with pre-scanned link definition seeding to resolve forward references.

### W6 & W9: EPUB Generator & CLI Integration
- Refactored `src/epub/EpubGenerator.ts` to coordinate scanner, layout planner, renderer, zip writer, and build session. Enforced generator state machine (`E_STATE`) and added `generate()`, `analyze()`, and `getLastReport()` APIs.
- Updated `src/cli/EnhancedCommands.ts` adding `--max-chapter-size`, `--no-auto-split`, `--oversize-policy`, `--strict-links`, `--epub-report`, and `--epub-dry-run`. Returns exit code 2 on CLI option validation failures (`E_OPTION`).

### W10: Independent Verification Infrastructure & Evidence
- Created `src/epub/EpubPipeline.dst.test.ts` implementing 7 deterministic simulation tests covering sentinels, aborts, cleanup, backpressure, chunk boundaries, and concurrency.
- Created `scripts/verify-epub-package.py` validating EPUB container rules (ZIP structure, mimetype first, XML parsing of container/OPF/NCX/XHTML, internal fragment link validation).
- Created `tests/integration/epub-large-files.test.ts` running end-to-end integration tests on multi-chapter large books (>300 KiB chapters), EPUB 2/3 outputs, and CLI dry-runs.
- Created `scripts/check-epub-mutations.ts` defining and verifying 16 mutants (M01–M16) across the pipeline.
- Created `scripts/benchmark-epub-memory.ts` benchmarking RSS memory across streaming corpora.

### W11: Documentation & Migration Guide
- Created `docs/EPUB-LARGE-BOOKS.md`: Comprehensive technical specification of the 300 KiB budget, binary search cuts, oversize handling, streaming spool architecture, and container verification.
- Created `docs/API-REFERENCE.md`: Complete API specification for options, generator methods, diagnostics, error codes (`E_*`), warning codes (`W_*`), and report schema.
- Created `docs/CLI-FLAGS-MIGRATION-GUIDE.md`: Migration guide detailing new defaults, legacy flag preservation (`--no-auto-split`), and exit code conventions.
- Updated `README.md` EPUB sections to document new flags and link to the guides.

---

## Verification Evidence Summary

- **Unit & Integration Tests**: 220 tests passing across 21 files (`0 fail, 1197 expect() assertions`).
- **CLI Bundle Build**: Bundled successfully via `bun run build` (`dist/cli.js`, 3.96 MB).
- **Mutant Coverage**: 16/16 mutants killed (M01–M16).
- **Package Verifier**: `scripts/verify-epub-package.py` verified against EPUB 2 and EPUB 3 packages generated by pipeline.
- **Working Tree Integrity**: Preserved dirty cache files without destructive git commands.
