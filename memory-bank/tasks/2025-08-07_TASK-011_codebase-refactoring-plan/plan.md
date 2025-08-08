# Implementation Plan - Codebase Refactoring Plan and Architecture Improvements

## Progress Overview
- Total Items: 8
- Completed: 0
- In Progress: 1
- Blocked: 0
- Not Started: 7

## 1. Core Cross-Cutting Foundation [🟡 In Progress]
   ### 1.1 Introduce unified Logger with levels and JSON mode [🔴 Not Started]
   ### 1.2 Define error hierarchy and standard exit codes [🔴 Not Started]
   ### 1.3 Add Result type utilities for non-exception control flow [🔴 Not Started]
   ### 1.4 Add config schema validation and migration (rename replaceLinksinContent) [🟡 In Progress]
   ### 1.5 Centralize path normalization via `PathResolver` (remove duplicates in `PagesCacheManager`) [🔴 Not Started]

## 2. CLI Stabilization [🔴 Not Started]
   ### 2.1 Replace local token/config helpers in `src/cli.ts` with `ConfigManager` calls [🔴 Not Started]
   ### 2.2 Strongly type CLI options (PublishOptions, AnalyzeOptions, ResetOptions, CacheValidateOptions) [🔴 Not Started]
   ### 2.3 Centralize error/help handling (`exitOverride`, `.showHelpAfterError()`) [🔴 Not Started]
   ### 2.4 Extract command registrations and handlers into separate modules [🔴 Not Started]
   ### 2.5 Remove duplicate `findMarkdownFiles` in CLI and reuse `LinkScanner` [🔴 Not Started]

## 3. Publisher/Workflow Modularization [🔴 Not Started]
   ### 3.1 Extract Telegraph API client (read/write/list) from `EnhancedTelegraphPublisher` [🔴 Not Started]
   ### 3.2 Integrate `IntelligentRateLimitQueueManager` uniformly (remove ad-hoc delays) [🔴 Not Started]
   ### 3.3 Isolate cache sync strategy and persistence [🔴 Not Started]

## 4. Markdown Converter Decomposition [🔴 Not Started]
   ### 4.1 Split `markdownConverter.ts` into submodules (headings, toc, links, blocks) [🔴 Not Started]
   ### 4.2 Ensure `AnchorGenerator` is the single anchor source everywhere [🔴 Not Started]
   ### 4.3 Precompile regexes and add micro-caches for hot paths [🔴 Not Started]
   ### 4.4 Replace inline ToC/heading detection with `AnchorGenerator` parsing [🔴 Not Started]

## 5. Path Normalization and Caching [🔴 Not Started]
   ### 5.1 Normalize paths to absolute POSIX form in `PathResolver` and caches [🔴 Not Started]
   ### 5.2 Add LRU cache for file metadata/hash reads [🔴 Not Started]

## 6. Links & Regex Unification [🔴 Not Started]
   ### 6.1 Single regex utility for link parsing (used by Scanner/Resolver/Converter) [🔴 Not Started]
   ### 6.2 Shared markdown file detection util and extensions list [🔴 Not Started]

## 7. Tests and Benchmarks [🔴 Not Started]
   ### 7.1 CLI contract tests (help, error, JSON logs) [🔴 Not Started]
   ### 7.2 Integration tests for publisher with mocks (rate limits, user switching) [🔴 Not Started]
   ### 7.3 Benchmarks for converter and bulk publish [🔴 Not Started]

## 8. Reporting Unification [🔴 Not Started]
   ### 8.1 Make `ReportGenerator` consume unified Logger/Reporter [🔴 Not Started]
   ### 8.2 Align `ProgressIndicator` with Logger levels [🔴 Not Started]

## Agreement Compliance Log
- 2025-08-07_22-04: Validated refactoring plan against no external behavior change requirement - ✅ Compliant
- 2025-08-07_22-04: Plan establishes traceability and phased execution - ✅ Compliant
