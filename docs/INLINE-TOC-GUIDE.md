# Inline Table of Contents Control Guide

## Overview

This guide explains the new `--inline-toc` / `--no-inline-toc` options that provide fine-grained control over how Table of Contents (ToC) are rendered in your content.

## Problem Statement

Previously, when generating ToC, it was always rendered inline within the text content. For EPUB and similar document formats, this creates redundancy:
- EPUB has its own built-in navigation system that generates ToC automatically
- Inline ToC in the text wastes space and creates navigation confusion
- You may want to generate ToC metadata without displaying it in the content

## Solution: Separate ToC Generation from Rendering

The new `inlineToC` option (default: `true` for Telegraph, `false` for EPUB) allows you to:
- **Generate ToC**: Build the table of contents structure (always happens if `--aside` is enabled)
- **Render ToC Inline**: Control whether the ToC is rendered inside the article text

## CLI Usage

### For Telegraph Publishing

```bash
# Default behavior (ToC is rendered inline)
telegraph-publisher pub --file article.md

# Explicitly render ToC inline (same as default)
telegraph-publisher pub --file article.md --inline-toc

# Don't render ToC inline (for EPUB export)
telegraph-publisher pub --file article.md --no-inline-toc
```

### For EPUB Generation

```bash
# Default for EPUB: ToC is NOT rendered inline (uses EPUB navigation)
telegraph-publisher epub --file article.md --author "Author Name"

# Override: Render ToC inline in EPUB chapters
telegraph-publisher epub --file article.md --author "Author Name" --inline-toc

# Explicitly disable inline ToC (same as default for EPUB)
telegraph-publisher epub --file article.md --author "Author Name" --no-inline-toc
```

## Configuration

You can set defaults in `.telegraph-publisher-config.json`:

```json
{
  "defaultUsername": "your-username",
  "inlineToC": false,
  "aside": true,
  "tocTitle": "Содержание",
  "tocSeparators": true
}
```

## API Usage

### Basic Example

```typescript
import { PublishOptionsBuilder } from 'telegraph-publisher';

// For Telegraph: render ToC inline (default)
const telegraphOptions = PublishOptionsBuilder.create()
  .tableOfContents({ enabled: true })
  .build();

await publisher.publishDependencies('article.md', 'author', telegraphOptions);
```

### EPUB Example

```typescript
import { PublishOptionsBuilder } from 'telegraph-publisher';

// For EPUB: generate ToC but don't render inline
const epubOptions = PublishOptionsBuilder.create()
  .tableOfContents({ enabled: true })
  .inlineToC(false)  // Don't render inline
  .build();

await publisher.publishDependencies('article.md', 'author', epubOptions);
```

### Using Direct Options

```typescript
// Method 1: Generate ToC but don't render inline
await publisher.publishDependencies('article.md', 'author', {
  generateAside: true,
  inlineToC: false,
  tocTitle: 'Contents'
});

// Method 2: Don't generate or render ToC
await publisher.publishDependencies('article.md', 'author', {
  generateAside: false,
  inlineToC: false
});
```

## Option Combinations

| generateAside | inlineToC | Result |
|---|---|---|
| `true` | `true` | ✅ ToC generated **and** rendered inline (Telegraph default) |
| `true` | `false` | ✅ ToC generated but **not** rendered inline (EPUB default) |
| `false` | `true` | ✅ No ToC (overrides `inlineToC`) |
| `false` | `false` | ✅ No ToC |

**Note**: When `generateAside: false`, the `inlineToC` setting is ignored, and no table of contents is generated at all.

## Practical Use Cases

### Use Case 1: Publishing to Telegraph

```bash
# You want inline ToC for better navigation
telegraph-publisher pub --file book-chapter.md \
  --aside \
  --inline-toc \
  --toc-title "Chapter Contents" \
  --toc-separators
```

### Use Case 2: EPUB Book Chapter

```bash
# Generate EPUB from chapters, don't duplicate ToC in content
telegraph-publisher epub \
  --file chapter1.md \
  --file chapter2.md \
  --author "Author Name" \
  --inline-toc=false \
  --output book.epub
```

### Use Case 3: Mixed Format Publishing

```bash
# Publish same content for Telegraph (with inline ToC) and EPUB (without)

# For Telegraph:
telegraph-publisher pub --file content.md --inline-toc

# For EPUB:
telegraph-publisher epub --file content.md --author "Name" --no-inline-toc
```

## Migration from Previous Versions

If you were using the default behavior (inline ToC), no changes are needed:
- For Telegraph: existing behavior preserved (inline ToC enabled by default)
- For EPUB: inline ToC is now disabled by default (you can enable with `--inline-toc`)

## Technical Details

### How It Works

1. **ToC Generation** (`generateAside`):
   - When `true`: Analyzes document headings and builds ToC structure
   - When `false`: Skips ToC generation entirely

2. **ToC Rendering** (`inlineToC`):
   - Only applies if `generateAside: true`
   - When `true`: Inserts ToC HTML/content at the beginning of the article
   - When `false`: ToC structure is created (for metadata/EPUB) but not inserted into content

3. **EPUB Navigation**:
   - EPUB generator always creates internal navigation from headings
   - `inlineToC: false` prevents redundant ToC in chapter content
   - Improves EPUB reader experience by using native navigation

## Troubleshooting

### My EPUB chapters have duplicate ToC

**Solution**: Use `--no-inline-toc` when generating EPUB:
```bash
telegraph-publisher epub --file article.md --author "Name" --no-inline-toc
```

### Telegraph preview doesn't show ToC

**Check**: Make sure `--aside` is enabled (it's on by default):
```bash
telegraph-publisher pub --file article.md --aside --inline-toc
```

### I want ToC in Telegraph but not in EPUB

**Solution**: Use different commands:
```bash
# Telegraph: with inline ToC
telegraph-publisher pub --file article.md --inline-toc

# EPUB: without inline ToC  
telegraph-publisher epub --file article.md --author "Name" --no-inline-toc
```

## Related Options

- `--aside` / `--no-aside`: Control whether ToC is generated at all
- `--toc-title <title>`: Set custom ToC heading text
- `--toc-separators`: Add horizontal lines around ToC
- `--inline-toc` / `--no-inline-toc`: Control rendering of generated ToC

## See Also

- [API Reference](./API-REFERENCE.md) - Complete API documentation
- [CLI Flags Migration Guide](./CLI-FLAGS-MIGRATION-GUIDE.md) - Flag deprecations and changes
- [DIACRITICS Support](./DIACRITICS_SUPPORT.md) - Special character handling

---

**Last Updated**: December 2024  
**Version**: 1.5.0+


