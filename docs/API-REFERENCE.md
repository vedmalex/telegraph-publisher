# API Reference

## Overview

This document provides comprehensive API reference for `telegraph-publisher` v2.0, covering:
1. **Telegraph Publishing API** (Publishing, dependencies, options validation)
2. **EPUB Generator API** (`EpubGenerator`, streaming architecture, chapter slicing, options, diagnostics, and reports)

---

# Part 1: Telegraph Publishing API

## Core Interfaces

### PublishDependenciesOptions

The primary interface for configuring dependency publishing behavior.

```typescript
interface PublishDependenciesOptions {
  /** Enable dry-run mode (preview without making changes) */
  dryRun?: boolean;
  
  /** Enable debug mode (saves Telegraph JSON artifacts, implies dryRun) */
  debug?: boolean;
  
  /** Force republication of unchanged files and bypass link verification */
  force?: boolean;
  
  /** Generate table of contents (aside block) at article start */
  generateAside?: boolean;
  
  /** Render table of contents inline within the article text */
  inlineToC?: boolean;
  
  /** Custom title for the table of contents section */
  tocTitle?: string;
  
  /** Add horizontal separators before/after table of contents */
  tocSeparators?: boolean;
}
```

#### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dryRun` | `boolean` | `false` | Preview operations without making changes |
| `debug` | `boolean` | `false` | Save Telegraph JSON artifacts (implies `dryRun`) |
| `force` | `boolean` | `false` | Force republication and bypass link verification |
| `generateAside` | `boolean` | `true` | Generate table of contents at article start |
| `inlineToC` | `boolean` | `true` | Render table of contents inline within the article text |
| `tocTitle` | `string` | `'Содержание'` | Title for the table of contents section |
| `tocSeparators` | `boolean` | `true` | Add horizontal separators around ToC |

#### Special Behaviors

- **Debug Mode**: When `debug: true` and `dryRun` is not explicitly set, `dryRun` will be automatically set to `true`
- **Force Flag**: Combines functionality of legacy `--force` and `--force-republish` flags
- **ToC Inline**: When `inlineToC: false`, table of contents is generated for EPUB navigation but not rendered inline in text
- **ToC Generation**: When `generateAside: false`, `tocTitle` and `tocSeparators` are ignored

### ValidatedPublishDependenciesOptions

Extended interface with runtime validation and metadata.

```typescript
interface ValidatedPublishDependenciesOptions extends Required<PublishDependenciesOptions> {
  /** Validation metadata */
  readonly _validated: true;
  readonly _defaults: Partial<PublishDependenciesOptions>;
}
```

## Core Classes

### PublishOptionsValidator

Provides validation and default value management for publish options.

```typescript
class PublishOptionsValidator {
  /**
   * Validate and normalize options with defaults
   */
  static validate(options: PublishDependenciesOptions = {}): ValidatedPublishDependenciesOptions

  /**
   * Extract CLI-compatible parameters for backward compatibility
   */
  static toLegacyParameters(options: ValidatedPublishDependenciesOptions): {
    dryRun: boolean;
    generateAside: boolean;
    tocTitle: string;
    tocSeparators: boolean;
  }
}
```

#### Usage Example

```typescript
import { PublishOptionsValidator } from 'telegraph-publisher';

// Validate with defaults
const validated = PublishOptionsValidator.validate({
  force: true,
  debug: true
});

console.log(validated.dryRun); // true (implied by debug)
console.log(validated.force);  // true
console.log(validated.generateAside); // true (default)
console.log(validated._validated); // true
```

### PublishOptionsBuilder

Type-safe builder pattern for constructing complex publish options.

```typescript
class PublishOptionsBuilder {
  static create(): PublishOptionsBuilder
  
  dryRun(enabled?: boolean): this
  debug(enabled?: boolean): this
  force(enabled?: boolean): this
  
  tableOfContents(config?: {
    enabled?: boolean;
    title?: string;
    separators?: boolean;
  }): this
  
  build(): PublishDependenciesOptions
  buildValidated(): ValidatedPublishDependenciesOptions
}
```

#### Usage Example

```typescript
import { PublishOptionsBuilder } from 'telegraph-publisher';

// Build complex options
const options = PublishOptionsBuilder.create()
  .force(true)
  .debug(true)
  .inlineToC(false)  // For EPUB: don't render ToC inline
  .tableOfContents({
    enabled: true,
    title: 'Table of Contents',
    separators: false
  })
  .buildValidated();

// Use with publisher
await publisher.publishDependencies('article.md', 'author', options);
```

### OptionsPropagationChain

Handles clean options transformation between different system layers.

```typescript
class OptionsPropagationChain {
  /**
   * Create validated options from CLI options
   */
  static fromCLIOptions(cliOptions: any): ValidatedPublishDependenciesOptions

  /**
   * Create options for recursive dependency calls
   */
  static forRecursiveCall(
    parentOptions: ValidatedPublishDependenciesOptions,
    overrides?: Partial<PublishDependenciesOptions>
  ): ValidatedPublishDependenciesOptions

  /**
   * Convert to publisher method options format
   */
  static toPublisherOptions(
    options: ValidatedPublishDependenciesOptions,
    withDependencies?: boolean
  ): PublisherMethodOptions
}
```

### LayerIntegrationPattern

Provides clean integration between CLI, Workflow, and Publisher layers.

```typescript
class LayerIntegrationPattern {
  /**
   * Transform CLI options to workflow and publisher formats
   */
  static cliToWorkflow(cliOptions: any): {
    workflowOptions: WorkflowOptions;
    publisherOptions: ValidatedPublishDependenciesOptions;
  }

  /**
   * Transform workflow options to publisher call formats  
   */
  static workflowToPublisher(
    workflowOptions: WorkflowOptions,
    publisherOptions: ValidatedPublishDependenciesOptions
  ): {
    publishCall: PublishMethodOptions;
    dependencyCall: PublishDependenciesOptions;
  }
}
```

## Publisher Methods

### publishDependencies

Enhanced method with new options-based signature.

```typescript
async publishDependencies(
  filePath: string,
  username: string,
  options: PublishDependenciesOptions = {}
): Promise<{
  success: boolean;
  error?: string;
  publishedFiles?: string[];
}>
```

### publishWithMetadata

Main publishing method supporting options configuration.

```typescript
async publishWithMetadata(
  filePath: string,
  username: string,
  options: {
    withDependencies?: boolean;
    dryRun?: boolean;
    debug?: boolean;
    forceRepublish?: boolean;
    generateAside?: boolean;
    inlineToC?: boolean;
    tocTitle?: string;
    tocSeparators?: boolean;
  } = {}
): Promise<PublicationResult>
```

---

# Part 2: EPUB Generator API

The EPUB module provides high-performance, memory-bounded, streaming EPUB 2 and EPUB 3 generation with automatic size-based chapter splitting, cross-chapter link rewriting, and full package verification.

## Core Interfaces & Types

### EpubInputOptions

Configuration options passed to `new EpubGenerator(options)`.

```typescript
export interface EpubInputOptions extends EpubSplitOptions {
  /** Absolute or relative path to the output .epub file */
  outputPath: string;

  /** Title of the book (required) */
  title: string;

  /** Author of the book (required) */
  author: string;

  /** BCP-47 language tag (default: 'ru') */
  language?: string;

  /** Unique book identifier / UUID (default: generated timestamp id) */
  identifier?: string;

  /** Path to cover image file (.jpg or .png) */
  cover?: string;

  /** Preserve intermediate build directory and print debug trace (default: false) */
  debug?: boolean;

  /** Max chapter size in UTF-8 bytes (default: 307200 / 300KiB; null disables size split) */
  maxChapterBytes?: number | null;

  /** Manual heading split level: 1 | 2 | 3 | 4 | 5 | 6 */
  splitAt?: 1 | 2 | 3 | 4 | 5 | 6;

  /** Behavior when an indivisible unit exceeds maxChapterBytes: 'warn' | 'error' (default: 'warn') */
  oversizePolicy?: "warn" | "error";

  /** Treat unresolved internal links as build errors instead of warnings (default: false) */
  strictLinks?: boolean;

  /** Analyze chapters and layout without writing output EPUB archive (default: false) */
  dryRun?: boolean;

  /** Output file path to write structured JSON build report */
  reportPath?: string;

  /** Root directory for computing relative paths in reports */
  inputRoot?: string;

  /** AbortSignal for early cancellation */
  signal?: AbortSignal;

  /** EPUB standard version: 2 | 3 (default: 3) */
  epubVersion?: 2 | 3;

  /** Generate dedicated HTML title page (default: false) */
  titlePage?: boolean;

  /** Parse <!-- Page N --> markers into EPUB pageList (default: false) */
  pageBreaks?: boolean;

  /** Publisher name metadata */
  publisher?: string;

  /** Publication date string (e.g. '2026-10-17') */
  pubDate?: string;

  /** Translator name metadata */
  translator?: string;

  /** Series or collection title */
  series?: string;

  /** Book description for metadata and title page */
  description?: string;

  /** Reader navigation TOC depth (toc.ncx / nav.xhtml; default: Infinity) */
  tocDepth?: number;

  /** Include full book TOC document: 'start' | 'end' (default: disabled) */
  bookToc?: "start" | "end";

  /** Depth of headings in the book TOC (default: tocDepth or 2) */
  bookTocDepth?: number;

  /** Title heading for book TOC page (default: 'Содержание') */
  bookTocTitle?: string;

  /** In-text chapter TOC mode: 'none' | 'blocks' | 'full' | 'auto' (default: 'auto') */
  chapterToc?: "none" | "blocks" | "full" | "auto";

  /** Depth of headings in chapter TOC */
  chapterTocDepth?: number;

  /** Position of chapter TOC: 'start' | 'end' | 'both' (default: 'start') */
  chapterTocPosition?: "start" | "end" | "both";

  /** Heading count threshold to trigger chapter navigation bar (default: 30) */
  navThreshold?: number;

  /** Max items in chapter navigation bar row (default: 12) */
  navMaxItems?: number;

  /** Caption prefix for chapter navigation bar (default: 'К тексту:') */
  navCaption?: string;

  /** Legacy alias for in-text TOC generation */
  inlineToC?: boolean;

  /** In-text TOC section title */
  tocTitle?: string;

  /** Add horizontal line separators around in-text TOC (default: true) */
  tocSeparators?: boolean;

  /** Runtime dependency injection for testing or custom I/O */
  runtime?: { io: EpubIO };
}
```

### NormalizedEpubOptions

The validated and normalized options object with defaults applied:

```typescript
export interface NormalizedEpubOptions extends EpubInputOptions {
  language: string;             // default: 'ru'
  debug: boolean;               // default: false
  tocDepth: number;             // default: Infinity
  bookTocDepth: number;         // default: tocDepth ?? 2
  bookTocTitle: string;         // default: 'Содержание'
  epubVersion: 2 | 3;           // default: 3
  titlePage: boolean;           // default: false
  pageBreaks: boolean;          // default: false
  maxChapterBytes: number | null;// default: 307200
  oversizePolicy: "warn" | "error";// default: 'warn'
  strictLinks: boolean;         // default: false
  chapterToc: "none" | "blocks" | "full" | "auto";
  navThreshold: number;         // default: 30
  navMaxItems: number;          // default: 12
  navCaption: string;           // default: 'К тексту:'
  dryRun: boolean;              // default: false
}
```

### ChapterTocOptions

Per-chapter options passed to `addChapterFromFile(path, options)`:

```typescript
export interface ChapterTocOptions {
  generateToc?: boolean;
  inlineToC?: boolean;
  tocTitle?: string;
  tocSeparators?: boolean;
  tocPosition?: "start" | "end" | "both";
  tocDepth?: number;
  tocNested?: boolean;
  tocMode?: "full" | "blocks";
  navCaption?: string;
  navThreshold?: number;
  navMaxItems?: number;
}
```

---

## EpubGenerator Class

```typescript
export class EpubGenerator {
  constructor(options: EpubInputOptions);

  /**
   * Registers a markdown file as a source chapter.
   * Can be called multiple times before generate() or analyze().
   */
  addChapterFromFile(
    filePath: string,
    options?: ChapterTocOptions
  ): Promise<void>;

  /**
   * Executes the full pipeline: scanning, planning, rendering,
   * two-pass streaming ZIP packaging, and atomic file commit.
   * Returns the final EpubBuildReport.
   */
  generate(): Promise<EpubBuildReport>;

  /**
   * Executes scanning and planning without rendering or packaging.
   * Useful for layout preview, link verification, and sizing analysis.
   * Returns the final EpubBuildReport (mode: 'dry-run').
   */
  analyze(): Promise<EpubBuildReport>;

  /**
   * Returns the last generated report or undefined if neither generate()
   * nor analyze() has completed.
   */
  getLastReport(): EpubBuildReport | undefined;

  /**
   * Returns the current lifecycle state:
   * 'new' | 'scanning' | 'planning' | 'rendering' | 'packaging' | 'committing' | 'done'
   */
  getState(): EpubGeneratorState;

  /**
   * Cleans up temporary session storage and spool caches.
   */
  dispose(): Promise<void>;

  /**
   * Legacy shim: Splits markdown text by heading level.
   */
  static splitMarkdownByHeading(
    markdown: string,
    level: number
  ): Array<{ title: string; headingLine: string; content: string }>;

  /**
   * Legacy shim: Configures explicit mapping between source file paths and XHTML names.
   */
  setChapterPathMap(mapping: Record<string, string>): void;
}
```

### Usage Example: Programmatic EPUB Generation

```typescript
import { EpubGenerator } from 'telegraph-publisher';

const generator = new EpubGenerator({
  outputPath: './output/great-book.epub',
  title: 'Философия Веданты',
  author: 'Вьясадева',
  language: 'ru',
  epubVersion: 3,
  maxChapterBytes: 307200,      // 300 KiB auto-split threshold
  oversizePolicy: 'warn',        // Keep large indivisible units safely
  strictLinks: true,             // Fail on broken links
  reportPath: './output/report.json'
});

// Add markdown chapters
await generator.addChapterFromFile('./manuscript/chapter1.md');
await generator.addChapterFromFile('./manuscript/chapter2.md');

// Generate EPUB package
const report = await generator.generate();

console.log(`EPUB built: ${report.documents.length} XHTML documents created`);
console.log(`Peak XHTML document size: ${report.counters.maxXhtmlBytes} bytes`);
```

---

## Diagnostics and Error Handling

All pipeline errors inherit from `EpubBuildError`, which contains a stable machine-readable error code, an array of typed diagnostics, and the partial build report.

```typescript
export class EpubBuildError extends Error {
  readonly code: string;
  readonly diagnostics: EpubDiagnostic[];
  readonly report?: EpubBuildReport;
}
```

### Stable Error Codes

| Error Code | Description | Typical Cause |
|---|---|---|
| `E_OPTION` | Invalid CLI or constructor option | Unknown enum value, malformed byte size, negative depth, `--max-chapter-size` combined with `--no-auto-split` |
| `E_STATE` | Illegal lifecycle state transition | Calling `addChapterFromFile()` after `generate()`, concurrent builds on the same generator |
| `E_OVERSIZE` | Document or indivisible unit exceeds budget | Unit > `maxChapterBytes` when `oversizePolicy: 'error'` |
| `E_WRAPPER_OVERSIZE` | Document wrapper alone exceeds budget | `maxChapterBytes` set lower than the basic HTML wrapper + TOC |
| `E_LINK_UNRESOLVED` | Broken internal link target | Link `[text](#missing)` does not match any anchor when `strictLinks: true` |
| `E_LINK_AMBIGUOUS` | Ambiguous link target | Multiple identical anchors found for link target when `strictLinks: true` |
| `E_ANCHOR_DUPLICATE`| Duplicate explicit anchor ID | Two headings or elements define the same `{#id}` in one document |
| `E_LAYOUT_STALLED` | Monotonic split algorithm stalled | No valid split boundary could be determined |
| `E_IO` | File system read/write failure | Unreadable source file or disk full |
| `E_PARSE` | Spool record corruption | Truncated or malformed record in temporary spool store |
| `E_ZIP_LIMIT` | ZIP format limit reached | Archive exceeds 4 GB or 65,535 files (ZIP32 limitation) |
| `E_ABORTED` | Build cancelled | `AbortSignal` triggered during processing |
| `E_CLEANUP` | Failed temp cleanup | Non-fatal diagnostic emitted during temporary folder removal |

### Warning Codes

When not in strict mode, non-fatal anomalies are captured in `report.diagnostics` with `severity: 'warning'`:

| Warning Code | Description |
|---|---|
| `W_OVERSIZE` | An indivisible block (table, code, list, verse) exceeded `maxChapterBytes`; preserved without truncation |
| `W_LINK_UNRESOLVED` | An internal anchor was not resolved (rendered as unlinked span or raw text) |
| `W_LINK_AMBIGUOUS` | Multiple headings share the same alias; first occurrence used |
| `W_LINK_QUERY` | Local link contains a query string (`file.md?param=1#sec`); query stripped |
| `W_LINK_ENCODING` | Link contains invalid percent-encoding |
| `W_PAGE_DUPLICATE` | Duplicate `<!-- Page N -->` marker encountered |
| `W_REFERENCE_DUPLICATE` | Duplicate Markdown reference link definition |
| `W_HTML_UNSUPPORTED` | Unsupported or unsafe HTML tag was stripped |

---

## Build Report Structure (`EpubBuildReport`)

When `--epub-report <path>` or `reportPath` is specified, a deterministic JSON document conforming to this schema is generated:

```typescript
export interface EpubBuildReport {
  schemaVersion: 1;
  mode: "generate" | "dry-run";
  outputCommitted: boolean;
  settings: {
    maxChapterBytes: number | null;
    splitAt: number | null;
    oversizePolicy: "warn" | "error";
    strictLinks: boolean;
    epubVersion: 2 | 3;
  };
  sources: Array<{
    path: string;
    sha256: string;
    bytes: number;
    units: number;
  }>;
  documents: Array<{
    href: string;
    kind: "content" | "navigation" | "title-page" | "book-toc";
    bytes: number;
    oversized: boolean;
    splittable: boolean;
  }>;
  counters: {
    sourceBytes: number;
    contentParts: number;
    atomicUnits: number;
    localLinks: number;
    resolvedLinks: number;
    unresolvedLinks: number;
    ambiguousLinks: number;
    anchors: number;
    images: number;
    oversizedDocuments: number;
    maxXhtmlBytes: number;
    layoutPasses: number;
  };
  diagnostics: Array<{
    code: string;
    severity: "warning" | "error";
    source?: string;
    range?: {
      startByte: number;
      endByte: number;
      startLine: number;
      endLine: number;
    };
    unitId?: string;
    href?: string;
    actualBytes?: number;
    limitBytes?: number;
    message: string;
  }>;
  artifacts?: {
    debugDir?: string;
  };
}
```

---

## Runtime Injection (`EpubIO`)

For testing, simulated deterministic testing (DST), or in-memory execution, `telegraph-publisher` supports injecting an `EpubIO` provider:

```typescript
import { EpubGenerator, MockEpubIO } from 'telegraph-publisher';

const mockIO = new MockEpubIO();
const generator = new EpubGenerator({
  outputPath: '/virtual/book.epub',
  title: 'Test',
  author: 'Test',
  runtime: { io: mockIO }
});
```

---

## Migration Guide

### From Legacy API

```typescript
// ❌ Old publishDependencies usage
await publisher.publishDependencies(
  'article.md',
  'author',
  true,        // dryRun
  true,        // generateAside  
  'Contents',  // tocTitle
  false        // tocSeparators
);

// ✅ New publishDependencies usage
await publisher.publishDependencies(
  'article.md',
  'author',
  {
    dryRun: true,
    generateAside: true,
    tocTitle: 'Contents', 
    tocSeparators: false,
    force: true  // New unified flag
  }
);
```

---

**API Version:** 2.0.0  
**Last Updated:** 2026-10-17  
**Compatibility:** Node.js 18+ / Bun 1.0+ required
