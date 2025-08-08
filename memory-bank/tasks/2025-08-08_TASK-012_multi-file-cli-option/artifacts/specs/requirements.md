# Requirements - Multi-file `--file` Option

## User Story
As a user, I want to pass multiple files to the `--file` option, so that they are processed one-by-one with all the same CLI options applied to each file.

## Functional Requirements
- REQ-001: CLI accepts multiple files for `--file` via variadic syntax `--file <path...>`
- REQ-002: CLI also supports repeated flags `-f a.md -f b.md` (Commander accumulation)
- REQ-003: For each file, load hierarchical config from that file's directory with CLI priority
- REQ-004: Apply all provided flags (debug/dry-run/verify/aside/toc/force) per file
- REQ-005: Use and persist `--token` per file directory when provided
- REQ-006: Process files sequentially, preserving the order as provided

## Acceptance Criteria
- AC-1: Running `telegraph-publisher pub -f a.md b.md --dry-run` publishes `a.md` then `b.md` with dry-run behavior
- AC-2: Running `telegraph-publisher pub -f a.md -f b.md --debug` publishes sequentially and sets dry-run
- AC-3: Workflow manager `publish` is invoked once per file in order
- AC-4: No change in behavior when a single `--file` is provided
