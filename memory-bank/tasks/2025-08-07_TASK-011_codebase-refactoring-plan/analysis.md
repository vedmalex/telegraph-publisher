# VAN Analysis - Codebase Refactoring Plan

## Specification Summary
- Refactor without changing external behavior
- Focus areas: CLI, large modules decomposition, config validation, logging/errors, performance

## Complexity Assessment
- Large files: `EnhancedCommands` (~1.1k LOC), `EnhancedTelegraphPublisher` (~1.6k LOC), `markdownConverter` (~800+ LOC)
- Cross-cutting concerns: configuration, logging, error handling, path normalization
- Integration risk: High coupling between CLI and workflow manager, publisher subsystems

## Decomposition Strategy (Most connected → most connected)
1. Core cross-cutting foundation
   - Logger, Error hierarchy, Result types
   - Config validation/migration
2. CLI layer stabilization
   - Typed options, centralized config/token handling, error/help unification
3. Publisher/workflow modularization
   - Extract API client, queue/rate-limit reuse, cache sync strategy
4. Converter/link modules unification
   - AnchorGenerator as single source, split markdownConverter into submodules

## Duplication Map (Code/Functionality)
- Markdown file discovery (duplicate logic)
  - `src/cli/EnhancedCommands.ts` → `findMarkdownFiles` (594–627)
  - `src/links/LinkScanner.ts` → `findMarkdownFiles` + recursive scan (33–59, 156–211)
  - Action: deprecate CLI-local finder; reuse `LinkScanner` everywhere; add shared `ScanConfig` defaults.

- Local markdown link parsing/replacement (regex overlap)
  - `src/links/LinkScanner.ts` → `extractLinks` balanced regex (95–124)
  - `src/links/LinkResolver.ts` → `findLocalLinks` and `replaceLocalLinks` use simpler regex (333–375, 458–490)
  - Action: single regex utility in `links/utils/regex.ts`; ensure consistency with converter; add tests.

- Markdown heading/anchor generation
  - `src/utils/AnchorGenerator.ts` provides unified algorithm
  - `src/markdownConverter.ts` still has inline heading detection and ToC logic (189–220, and further)
  - Action: fully switch converter/ToC to `AnchorGenerator` for detection + anchors.

- Path normalization / relative→absolute
  - `src/utils/PathResolver.ts` centralizes resolution
  - `src/cache/PagesCacheManager.ts` performs own normalization and warnings (94–108, 379–434)
  - Action: delegate normalization in cache manager to `PathResolver`; remove duplicate warnings.

- Progress/Reporting overlap
  - `src/cli/ProgressIndicator.ts` (spinner/progress UI)
  - `src/links/ReportGenerator.ts` (formatted console output, path formatting)
  - Action: introduce unified `Logger/Reporter` with levels and adapters; `ReportGenerator` to use it.

- File existence/markdown checks
  - `LinkResolver.isMarkdownFile` (510–513)
  - `LinkScanner.isMarkdownFile` (218–221) + extensions config
  - Action: move to `links/utils/fs.ts` with shared extension list.

## Risks & Mitigations
- Risk: Behavior change during refactor → Mitigation: Add contract tests and snapshot help/JSON outputs
- Risk: Hidden implicit dependencies → Mitigation: Incremental extraction with integration tests
- Risk: Performance regressions → Mitigation: Benchmarks and profiling checkpoints
