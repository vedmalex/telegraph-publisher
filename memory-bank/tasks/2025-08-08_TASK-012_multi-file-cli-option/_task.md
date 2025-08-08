# Task - Multi-file support for --file CLI option

- ID: TASK-012
- Date: 2025-08-08_10-30
- Phase: IMPLEMENT
- Status: 🟡 In Progress
- Priority: 🔴 High
- Type: Feature

## Summary
Add support to pass multiple files to the `--file` option. Files should be processed sequentially, applying all options to each file.

## Acceptance Criteria
- `telegraph-publisher pub -f a.md b.md` processes `a.md` then `b.md`
- `telegraph-publisher pub -f a.md -f b.md` also works
- All flags (e.g., `--dry-run`, `--debug`, `--no-verify`, `--aside`, etc.) apply to each file
- Per-file hierarchical config is loaded from each file's directory
- Token from `--token` is used/saved for each file directory
- Tests cover multi-file flow and order
