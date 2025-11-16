# Architecture Overview - telegraph-publisher

## High-Level Structure
- `src/cli/EnhancedCommands.ts` – enhanced CLI commands (including EPUB generation).
- `src/epub/EpubGenerator.ts` – EPUB creation and TOC generation.
- `src/markdownConverter.ts` – direct Markdown → TelegraphNode conversion (no HTML intermediate).

## Relevant Flows
- **EPUB command**: `cli.ts` → `EnhancedCommands.addEpubCommand` → `handleEpubCommand` → `EpubGenerator`.
- **Markdown conversion**: `convertMarkdownToTelegraphNodes` used throughout publishing pipeline to build Telegraph payloads.

## Notes
- Dependency resolution for EPUB reuses `DependencyManager` and `PathResolver`.
- ToC generation uses both ad-hoc heading scanning and unified `AnchorGenerator` depending on configuration.

