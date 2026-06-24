# telegraph-publisher

CLI-инструмент для публикации Markdown-контента в Telegra.ph, управления зависимостями между файлами, валидации ссылок и экспорта в EPUB.

## Build & Test

```bash
bun run build              # сборка dist/cli.js
bun test                   # все тесты
bun run test:coverage      # с покрытием
bun run test:unit          # unit-тесты
bun run test:integration   # интеграционные тесты
bun run dev                # watch-режим
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **CLI:** commander
- **Markdown:** marked
- **EPUB:** puppeteer-core
- **Linter:** Biome

## Architecture

- `src/cli/EnhancedCommands.ts` — CLI, publish/epub-команды
- `src/epub/EpubGenerator.ts` — EPUB-пайплайн и ToC
- `src/markdownConverter.ts` — Markdown → TelegraphNode (без HTML-прослойки)
- `src/dependencies/DependencyManager.ts` — дерево зависимостей
- `src/links/*` — валидация и ремонт ссылок

Поток: `cli.ts` → `EnhancedCommands` → `EpubGenerator` / `convertMarkdownToTelegraphNodes`

## Key Features

- Публикация в Telegra.ph (создание/обновление) с кэшем `.telegraph-pages-cache.json`
- Построение дерева зависимостей по локальным Markdown-ссылкам
- Валидация и авто-ремонт ссылок
- EPUB: слойный порядок глав, переписывание `.md → chapter-N.html`, ToC
- Debug-артефакты: `*.epub.json`, `*.epub-temp-*`

## Version

1.5.0

<!-- LLM_WIKI_MANAGED_START -->
## LLM-Wiki

This project contains an LLM-Wiki at `.llm-wiki` (absolute: `/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher/.llm-wiki`).

- **Entry point:** invoke the `llm-wiki-router` skill for ANY wiki operation (create, populate, lint, query, extract).
- **DO NOT** call internal `llm-wiki-{init,ingest,maintain,query,extract}` skills directly — they expect parameters pre-resolved by router intake interview.
- **Node name:** `.llm-wiki`
- **Created:** `2026-06-24T06:34:03.097Z`
- **Language:** `ru`
- **Default link-mode:** `symlink`

For full wiki-node operating instructions, see `.llm-wiki/AGENTS.md`.

### Wiki Access Policy (skill-managed; do not edit)

**To interact with this wiki:**
- ✓ Invoke the `llm-wiki-router` skill (handles intake, then delegates to the right specialist).
- ❌ Do NOT call `llm-wiki-{init,ingest,maintain,query,extract}` skills directly — they refuse to run.
- ❌ Do NOT write files into `.llm-wiki/` (or its subpath like `.llm-wiki/raw/`) with direct file-write tools — this breaks `sources.md` provenance, `link-mode` policy, and `index.md` consistency. Always go through `llm-wiki-router` → `llm-wiki-ingest`.
- ❌ Do NOT run `bun .../init-node.ts` / `link-source.ts` / `lint-node.ts` / `registry-update.ts` directly — they exit 1 without `LLM_WIKI_VIA_ROUTER=1` env or `--allow-direct-invocation` flag.
<!-- LLM_WIKI_MANAGED_END -->

<!-- MB3_MANAGED_START -->
## MB3 Workflow

This repository must be operated through the MB3 workflow.
- Start MB3 work through `mb3` and keep meaningful changes task-backed.
- Use canonical MB3 phases (`VAN -> CREATIVE -> PLAN -> TECH_SPEC -> IMPLEMENT -> QA -> CODE_REVIEW -> REFLECT -> ARCHIVE`) unless the active tier intentionally skips some phases.
- Treat `mb3-critic` as the authoritative Devil's Advocate gate for DA-reviewed phase exits.

### Core MB3 Skills

- `mb3` — unified router and intake entrypoint
- `mb3-phases` — phase execution and exit criteria
- `mb3-critic` — authoritative DA gate and adversarial review
- `mb3-commit` — commit/backlog integration for MB3 tasks

### Common MB3 Commands

- `mb3 create \"Task name\"`
- `mb3 status`
- `mb3 phase check-exit`
- `mb3 task advance`

### Specialist Routing Hints

- `mb3-orchestration-intake` — use when roadmap-backed startup must be shaped and no valid `orchestration_packet` exists yet
- `mb3-smart-executor` — use when a valid `orchestration_packet` already exists and downstream roadmap execution should continue
- `mb3-critic` — use for DA / critic review at gated phase exits or when you want adversarial review

### DA Gate Emission Policy

- Authoritative DA clearance MUST come from `Agent(subagent_type="mb3-critic")` captured by the post-tool hook.
- Never emit `da_reviewed`, `da_verdict`, `critic_verdict`, or `tier_change` via CLI `event emit` or MCP `mb3_event`. The runtime rejects these paths as RUNTIME_OWNED.
- Advisory `da_review` event remains open for non-authoritative notes; use it for advisory verdicts that do NOT clear gates.
- If the hook silently fails to persist a legitimate critic review, diagnose with `MB3_HOOK_TRACE=1`; do not fabricate a replacement emit.
<!-- MB3_MANAGED_END -->
