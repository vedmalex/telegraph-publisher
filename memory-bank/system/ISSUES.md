# ISSUES - Unified Issue Tracking

## 🐛 Bugs
- [ ] [BUG-001] EPUB chapter ordering does not respect CLI file list when dependencies are involved - Location: src/cli/EnhancedCommands.ts:1013 - Priority: Medium
- [ ] [BUG-002] Markdown converter splits multi-line paragraphs into multiple <p> nodes - Location: src/markdownConverter.ts:520 - Priority: Medium
- [ ] [BUG-003] Telegraph publish leaves local images unresolved (image markdown not treated as dependency; src stays relative and images are missing on telegra.ph) - Location: src/links/LinkResolver.ts (no image handling), src/markdownConverter.ts (img nodes keep relative src) - Priority: High
- [x] [BUG-004] EPUB navigation fails because headings lack ID attributes, breaking TOC and internal links - Location: src/markdownConverter.ts - ✅ Fixed: 2025-11-29
- [x] [BUG-005] Markdown parser fails to process links inside bold/italic text (nested formatting) - Location: src/markdownConverter.ts - ✅ Fixed: 2025-12-15

## ⚡ Must-Have Items
- [ ] [MH-001] Ensure EPUB TOC (`toc.ncx`) matches reading order and de-duplicates files - Priority: High
- [ ] [MH-002] Paragraph handling must follow standard Markdown block semantics (consecutive non-empty lines form a paragraph) - Priority: High

## 🔄 LEVER Opportunities
- Reuse existing `DependencyManager.orderDependencies` logic for EPUB chapter ordering instead of re-implementing dependency sorting.
- Extend existing block-handling in `convertMarkdownToTelegraphNodes` (code blocks, lists, blockquotes) with a paragraph buffer instead of introducing a separate parsing pass.
- Reuse EPUB asset resolution (PathResolver) to convert local image paths and a shared uploader to telegra.ph before injecting image URLs into Telegraph nodes.

## 📊 Statistics
- Total Issues: 6 (4 bugs, 2 must-haves) | Open: 5 | Closed: 1
