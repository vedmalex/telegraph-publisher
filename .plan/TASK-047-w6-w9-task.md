# TASK-047 W6 & W9: EPUB Generator & CLI Integration Brief

Branch: `dst-harness` in `/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher`.
DO NOT perform git reset/clean/stash. DO NOT commit or push.
Allowed files to modify/create:
- `src/epub/EpubGenerator.ts`
- `src/epub/EpubGenerator.test.ts`
- `src/cli/EnhancedCommands.ts`
- `src/cli/EnhancedCommands.epub.test.ts`
- `src/epub/EpubGenerator.large-files.test.ts`

## 1. Components to Integrate
All foundational components in `src/epub` are tested and passing:
- `EpubTypes.ts`: DTOs (`EpubInputOptions`, `EpubBuildReport`, `EpubDiagnostic`, etc.)
- `EpubOptions.ts`: `normalizeEpubOptions(options)`, `DEFAULT_MAX_CHAPTER_BYTES`
- `EpubDiagnostics.ts`: `createBuildState()`, `finalizeReport()`
- `EpubAnchorRegistry.ts`: `EpubAnchorRegistry`
- `EpubNavigation.ts`: `buildOutline`, `renderNav`, `renderNcx`, `renderBookToc`, `renderInlineNavigation`
- `EpubXhtmlRenderer.ts`: `EpubXhtmlRenderer`, `renderPart`, `renderPartToWriter`, `serializeNode`, `escapeXml`
- `EpubLayoutPlanner.ts`: `EpubLayoutPlanner.plan()`
- `EpubIO.ts`, `RealEpubIO.ts`, `MockEpubIO.ts`: I/O abstraction
- `EpubBuildSession.ts`: `EpubBuildSession.create(outputPath, io, { debug, signal })`
- `EpubSpoolStore.ts`: `EpubSpoolStore(session)`
- `EpubZipWriter.ts`: `EpubZipWriter.write(entries, destination, io, signal)`
- `EpubBlockFramer.ts`, `EpubSourceScanner.ts`: `EpubSourceScanner(options)`
- `src/cli/EpubCliOptions.ts`: `parseEpubCliOptions(raw, explicitlySet)`

## 2. Refactor `src/epub/EpubGenerator.ts`
1. Constructor:
   - Accept `EpubInputOptions` (from `EpubOptions.ts`).
   - Support `runtime?: { io: EpubIO }`, default to `new RealEpubIO()`.
   - Normalize with `normalizeEpubOptions(options)`.
   - Maintain state: `new` -> `scanning` -> `planning` -> `rendering` -> `packaging` -> `committing` -> `done`.
   - Concurrent calls throw `E_STATE`.
2. `addChapterFromFile(filePath: string, options?: ChapterTocOptions)`:
   - Must throw ENOENT if file does not exist (preserves `EpubGenerator.test.ts`).
   - Uses `EpubSourceScanner.scan(filePath, ordinal, session)` to stream-scan source and extract metadata/outline/anchors.
   - Saves scanned source into internal list.
3. `generate()`:
   - Prepares `EpubBookModel` from scanned sources and anchor registry.
   - Calls `EpubLayoutPlanner.plan(bookModel, normalizedOptions, renderer)`.
   - Writes EPUB files into `session` directory:
     - `mimetype` (`application/epub+zip`)
     - `META-INF/container.xml`
     - Content XHTML files (`chapter-1.html`, ...) using `renderer.renderPartToWriter()` or `renderPart()`
     - `toc.ncx` (via `renderNcx()`)
     - `nav.xhtml` (if EPUB 3, via `renderNav()`)
     - `book-toc.html` (if `bookToc` enabled, via `renderBookToc()`)
     - `title-page.html` (if `titlePage` enabled)
     - `style.css` (with font diacritics support)
     - Bundled local images & cover image
     - `content.opf` (EPUB 2 or EPUB 3 package document conforming to spec)
   - Packages ZIP using `EpubZipWriter.write()`.
   - If `reportPath` specified, writes JSON report.
   - Commits output with `session.finish(stagedZip)`.
   - Stores report for `getLastReport()`.
4. `analyze()`:
   - Runs full planning and sizing without committing/writing final EPUB (`mode: "dry-run"`).
   - Returns `EpubBuildReport`.
5. `getLastReport()`: returns last report.
6. `dispose()`: idempotently cleans up session and spool.
7. Shims:
   - `static splitMarkdownByHeading(markdown, level)`: retain for static test callers.
   - `setChapterPathMap(mapping)`: retain compatibility shim.

## 3. Update `src/cli/EnhancedCommands.ts`
1. In `addEpubCommand(program)`:
   Add `--max-chapter-size <size>`, `--no-auto-split`, `--oversize-policy <mode>`, `--strict-links`, `--epub-report <path>`, `--epub-dry-run`.
2. In `handleEpubCommand(options)`:
   - Determine explicitly set flags.
   - Call `parseEpubCliOptions(options, explicitlySet)`.
   - On `E_OPTION` error, display message and set `process.exitCode = 2`.
   - If `--epub-dry-run`, call `analyze()`, display summary, write report if specified, set exitCode = 0.
   - If generating, call `generate()`, write report if specified, print summary, set exitCode = 0.
   - On build error, set exitCode = 1.

## 4. Tests to Pass
- `bun test src/epub/EpubGenerator.test.ts` (all 28 pass!)
- `bun test src/epub/EpubGenerator.large-files.test.ts`
- `bun test src/cli/EnhancedCommands.epub.test.ts`
- `bun test src/epub` (all pass!)
- `./node_modules/.bin/biome check src/epub/EpubGenerator.ts src/cli/EnhancedCommands.ts`
