# CLI Flags Migration Guide

## Overview

This guide covers the CLI flag changes, new defaults, and migration paths in `telegraph-publisher` v2.0:
1. **Telegraph Publishing Changes** (Unified `--force` flag, enhanced flag propagation)
2. **EPUB Generation Changes** (Default 300 KiB chapter auto-splitting, `--no-auto-split`, exit codes 0/1/2, new diagnostics)

---

# Part 1: Telegraph Publishing Changes

## 🚀 What Changed

### 1. Unified Force Flag

#### Before (Deprecated)
```bash
# Two separate flags with overlapping functionality
telegraph-publisher pub --file article.md --force-republish
telegraph-publisher pub --file article.md --force
```

#### After (Current)
```bash
# Single unified flag with combined functionality
telegraph-publisher pub --file article.md --force
```

#### Benefits
- **Simplified CLI interface** - One flag instead of two
- **Unified behavior** - Force republication and bypass link verification
- **Better user experience** - Less confusion about which flag to use

### 2. Enhanced Flag Propagation

#### Before
- Flags applied only to root file
- Dependencies used default behavior
- Inconsistent behavior across dependency chain

#### After
- Flags propagate through entire dependency chain
- Consistent behavior for all linked files
- Predictable results for complex document structures

### 3. Updated Default Configuration

#### Before
```json
{
  "maxDependencyDepth": 1
}
```

#### After
```json
{
  "maxDependencyDepth": 20
}
```

---

# Part 2: EPUB Generation Migration (v2.0)

## 📚 What Changed in EPUB Generation

### 1. Default Automatic Chapter Splitting at 300 KiB

#### Legacy Behavior
In previous versions, `telegraph-publisher epub` produced **one XHTML document per input file** unless `--split-at` was explicitly supplied. When compiling large books (e.g. whole scriptures, commentaries, large anthologies), a single 15–50 MB file resulted in an enormous XHTML document. This caused e-readers (Kindle, Kobo, PocketBook) to freeze, drop pages, or crash.

#### Current Behavior (v2.0)
- **Automatic 300 KiB chapter splitting is enabled by default**: any logical chapter whose final serialized XHTML exceeds **307,200 UTF-8 bytes** (300 KiB) is automatically split at safe atomic unit boundaries (preferring headings, then paragraph breaks).
- **All cross-references and internal links are automatically rewritten**: links like `[link](#anchor)` or `[link](file.md#sec)` continue pointing to the exact split sub-chapter (`chapter-1_sub2.html#anchor`).
- **Atomic units are preserved**: tables, code blocks, lists, blockquotes, and verses/shlokas are never cut in the middle.

---

## 🛠️ How to Preserve Legacy Behavior

If your publishing workflow relies on older single-file outputs or strict manual-only splitting:

### Scenario A: Preserve Single File per Input (Disable Auto-Split)

Pass the `--no-auto-split` flag:

```bash
# ❌ Legacy command (previously produced a single monolithic chapter)
telegraph-publisher epub -f large-book.md -a "Author" -o book.epub

# ✅ In v2.0, to keep the single monolithic chapter without splitting:
telegraph-publisher epub -f large-book.md -a "Author" -o book.epub --no-auto-split
```

### Scenario B: Preserve Manual Heading-Only Splitting

If you previously used `--split-at` and do not want sub-splitting of chapters exceeding 300 KiB:

```bash
# ❌ Legacy command
telegraph-publisher epub -f book.md -a "Author" --split-at 2 -o book.epub

# ✅ In v2.0, to preserve manual H2 splitting without 300 KiB sub-splitting:
telegraph-publisher epub -f book.md -a "Author" --split-at 2 --no-auto-split -o book.epub
```

---

## ⚙️ New EPUB Command Flags

| New Flag | Type / Format | Default | Description |
|---|---|---|---|
| `--max-chapter-size <size>` | Bytes, KiB, MiB (e.g. `300KiB`, `500KB`, `250000`) | `300KiB` (307 200 B) | Configures chapter size threshold. Range: `4096` to `2147483647` bytes. |
| `--no-auto-split` | Boolean flag | `false` | Disables size-based chapter splitting. Mutually exclusive with `--max-chapter-size`. |
| `--oversize-policy <mode>` | `warn` \| `error` | `warn` | Action when an indivisible unit (e.g. large table) exceeds the chapter budget. |
| `--strict-links` | Boolean flag | `false` | Fails the build with exit code 1 if any internal anchor is unresolved. |
| `--epub-report <path>` | File path | None | Outputs detailed JSON build report with file sizes, counts, and diagnostics. |
| `--epub-dry-run` | Boolean flag | `false` | Analyzes chapters, headings, layout, and links without generating the `.epub` file. |

### Flag Incompatibilities

> [!WARNING]
> Combining `--max-chapter-size` with `--no-auto-split` is invalid because they express contradictory intent. This triggers an option error (`E_OPTION`) and exits with code `2`.

---

## 🚦 Standardized Exit Codes

In automation and CI/CD pipelines, exit codes allow scripts to distinguish between configuration errors and build failures:

| Exit Code | Meaning | Examples / Scenarios |
|---|---|---|
| `0` | **Success** | EPUB generated successfully, or `--epub-dry-run` completed without errors. |
| `1` | **Build / File Error** | Input file missing (`ENOENT`), strict link failure (`E_LINK_UNRESOLVED`), oversize block in strict mode (`E_OVERSIZE`), corrupted archive. |
| `2` | **Option Validation Error** | Invalid byte size format, unknown enum value, `--max-chapter-size` combined with `--no-auto-split`, missing required `-a / --author`. |

### Script Example Handling Exit Codes

```bash
#!/usr/bin/env bash
telegraph-publisher epub -f manuscript.md -a "Author" --strict-links --epub-report build/report.json
EXIT_STATUS=$?

case $EXIT_STATUS in
  0)
    echo "✅ EPUB build succeeded!"
    ;;
  1)
    echo "❌ Build error: broken links or oversize content. Inspect build/report.json."
    exit 1
    ;;
  2)
    echo "⚠️ CLI Option error: check flag arguments."
    exit 2
    ;;
esac
```

---

## 📋 Quick Command Comparison Table

| Use Case | Legacy (v1.x) | Recommended (v2.0) |
|---|---|---|
| **Standard EPUB build** | `telegraph-publisher epub -f book.md -a "Author"` | `telegraph-publisher epub -f book.md -a "Author"` *(now auto-splits at 300 KiB)* |
| **Keep legacy single file** | `telegraph-publisher epub -f book.md -a "Author"` | `telegraph-publisher epub -f book.md -a "Author" --no-auto-split` |
| **Heading split only** | `telegraph-publisher epub -f book.md -a "Author" --split-at 2` | `telegraph-publisher epub -f book.md -a "Author" --split-at 2 --no-auto-split` |
| **Custom chapter limit** | *Not supported* | `telegraph-publisher epub -f book.md -a "Author" --max-chapter-size 500KiB` |
| **Strict CI verification** | *Not supported* | `telegraph-publisher epub -f book.md -a "Author" --strict-links --oversize-policy error` |
| **Preview without writing**| *Not supported* | `telegraph-publisher epub -f book.md -a "Author" --epub-dry-run --epub-report report.json` |

---

## 🔗 Additional Resources

- [Large Books & Streaming Guide](./EPUB-LARGE-BOOKS.md) - Complete technical guide on 300 KiB slicing and memory architecture
- [API Reference](./API-REFERENCE.md) - Programmatic API documentation for `EpubGenerator`
