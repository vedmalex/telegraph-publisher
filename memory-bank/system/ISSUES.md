# ISSUES - Unified Issue Tracking

## 🐛 Bugs
- [ ] [BUG-001] EPUB chapter ordering does not respect CLI file list when dependencies are involved - Location: src/cli/EnhancedCommands.ts:1013 - Priority: Medium
- [ ] [BUG-002] Markdown converter splits multi-line paragraphs into multiple <p> nodes - Location: src/markdownConverter.ts:520 - Priority: Medium

## ⚡ Must-Have Items
- [ ] [MH-001] Ensure EPUB TOC (`toc.ncx`) matches reading order and de-duplicates files - Priority: High
- [ ] [MH-002] Paragraph handling must follow standard Markdown block semantics (consecutive non-empty lines form a paragraph) - Priority: High

## 🔄 LEVER Opportunities
- Reuse existing `DependencyManager.orderDependencies` logic for EPUB chapter ordering instead of re-implementing dependency sorting.
- Extend existing block-handling in `convertMarkdownToTelegraphNodes` (code blocks, lists, blockquotes) with a paragraph buffer instead of introducing a separate parsing pass.

## 📊 Statistics
- Total Issues: 4 (2 bugs, 2 must-haves) | Open: 4 | Closed: 0

