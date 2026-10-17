# TASK-047: Полный план исправлений и новых функций нарезки больших EPUB для передачи реализации

- **Profile**: full-spec
- **Tier**: T4:standard
- **QA Level**: MAX
- **Execution Mode**: sequential
- **Status**: completed
- **Phase**: QA
- **Created**: 2026-10-17T02:00:21Z
- **Updated**: 2026-10-17T10:22:00Z

## Scope

- src/epub
- src/cli/EnhancedCommands.ts
- src/cli/EpubCliOptions.ts
- src/markdownConverter.ts
- scripts/
- tests/integration/epub-large-files.test.ts
- docs/

## UR Coverage

- [x] UR-001 — superseded by UR-002
- [x] UR-002 — Exact byte budget layout, atomic slicing, monotonic cuts, oversize policy
- [x] UR-003 — Streaming I/O, spool store, ZipWriter, low memory scaling
- [x] UR-004 — Verification evidence, DST harness, mutants, Python package validator, full docs suite
