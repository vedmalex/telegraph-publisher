<!-- Template for llm-wiki-* family. Authored under TASK-357. Substituted by skills/llm-wiki-init/scripts/init-node.ts. -->
---
node: /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/.llm-wiki
updated: 2026-06-24T06:34:03.097Z
---

# Sources — .llm-wiki

Source/provenance registry. One row per ingested source. Append-only.

link_mode values: `symlink` | `move` | `copy`
Extractor values: `none` or extractor script name relative to `.extractors/` or `extractors/`.
Source ID: stable slug derived from basename + ingest date (e.g., `task-001-2026-05-18`).
Source hash: SHA-256 first 12 hex chars of file content (or recursive hash for dirs).
Original path: absolute pre-ingest location (preserved after move for audit/recovery).

Optional git columns (UR-040, tech-spec §24.19): when the source resolves inside a
git repository at ingest time, link-source.ts appends three trailing columns
to the row — `git_head_sha`, `git_branch`, `git_last_commit_date` — used by
re-ingest drift detection and the `code.*` lint rules. Rows without these
columns remain valid (backward-compatible).

Freshness columns (TASK-358 §3): six trailing columns added by change-detector.ts:
`last_checked_at`, `freshness_status`, `last_change_detected_at`, `source_mtime`,
`http_last_modified`, `http_etag`. Rows with 7, 11, or 17 columns are all valid.
See `skills/llm-wiki-maintain/references/sources-md-schema.md` for full schema reference.

| Source ID | Type | Path in raw/ | Original path | link_mode | Source hash | Ingested | Extractor (if any) | git_head_sha (opt) | git_branch (opt) | git_last_commit_date (opt) | last_checked_at | freshness_status | last_change_detected_at | source_mtime | http_last_modified | http_etag |
|-----------|------|--------------|---------------|-----------|-------------|----------|--------------------|--------------------|------------------|----------------------------|-----------------|------------------|-------------------------|--------------|--------------------|-----------|
| src-2026-06-24 | dir | src/ | /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/src | symlink | — | 2026-06-24 | none | — | — | — |  |  |  |  |  |  |
| docs-2026-06-24 | dir | docs/ | /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/docs | symlink | — | 2026-06-24 | none | — | — | — |  |  |  |  |  |  |
| readme-2026-06-24 | file | readme.md | /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/readme.md | symlink | — | 2026-06-24 | none | — | — | — |  |  |  |  |  |  |
| package-json-2026-06-24 | file | package.json | /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/package.json | symlink | — | 2026-06-24 | none | — | — | — |  |  |  |  |  |  |
| tsconfig-2026-06-24 | file | tsconfig.json | /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/tsconfig.json | symlink | — | 2026-06-24 | none | — | — | — |  |  |  |  |  |  |
| scripts-2026-06-24 | dir | scripts/ | /Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/scripts | symlink | — | 2026-06-24 | none | — | — | — |  |  |  |  |  |  |
