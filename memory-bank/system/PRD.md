# Product Requirements - telegraph-publisher

## Project Overview
- CLI tool for publishing and exporting Markdown content (including EPUB generation) to Telegra.ph with caching, link validation, and content slicing.

## Current Focus Areas
- EPUB generation flow (chapter ordering, TOC correctness).
- Markdown to TelegraphNode conversion (paragraph handling, headings, links, ToC).

## Backlog (Initial, High-Level)
- [MEDIUM] TASK-001_EPUB-Chapter-Ordering – ensure EPUB chapters and TOC follow CLI file order while including dependencies once.
- [MEDIUM] TASK-002_Paragraph-Block-Parsing – treat consecutive non-empty lines as a single paragraph block in Markdown converter.

## Sources
- Derived from existing code in `src/cli/EnhancedCommands.ts`, `src/epub/EpubGenerator.ts`, and `src/markdownConverter.ts`.

