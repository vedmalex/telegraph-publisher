# TASK-047 Technical specification — approved plan contracts

UR-001 superseded by UR-002 (design delivery). UR-003 authorizes full implementation A+B and verification. This artifact freezes the exact technical contracts already defined in approved plan sections 3–5; copied without semantic redesign for the current implementation. Required full-spec gates remain runtime-owned, prior waivers are not critic PROCEED.

## 3. Выбранные продуктовые решения

### 3.1 Размер, CLI и обратная совместимость

`maxChapterBytes` — предел **UTF-8 bytes сериализованного конечного XHTML**, вместе с XML/doctype/html/head/body, title, IDs, escaped attributes, rewritten href/src, встроенными navigation lists и служебными узлами. Не длина Markdown/JS string/текста и не ZIP compressed size. 300 KiB = **307200 bytes** — стартовый проектный порог. Ни стандарт EPUB, ни обещание работы любой читалки из него не следуют.

| Опция / API | Default | Точный контракт |
|---|---|---|
| `--max-chapter-size <size>` / `maxChapterBytes?: number \| null` | `300KiB` / 307200 | Целое без знака `bytes` или suffix `B`, `KiB`, `MiB` (case-sensitive); regex `^(0\|[1-9][0-9]*)(B\|KiB\|MiB)?$`; после умножения safe integer, 4096…2147483647. `0`, дробь, exponent, пробел, KB, отрицательное, trailing junk → E_OPTION. |
| `--no-auto-split` / `maxChapterBytes:null` | auto включён | Отключает только size split/size warnings; ручной `--split-at` продолжает работать. Совместное явное `--max-chapter-size` и `--no-auto-split` → E_OPTION, независимо от порядка аргументов. |
| `--split-at <n>` / `splitAt?:number` | отсутствует | Целое 1…6, regex `^[1-6]$`; обязательная граница перед top-level heading depth<=n. Ни один heading не теряется/не повышается в h1. Размер добавляет границы внутри получившихся секций. |
| `--oversize-policy <mode>` | `warn` | `warn\|error`; неделимый блок/служебный XHTML сохраняется целиком с W_OVERSIZE, либо E_OVERSIZE до output commit. При no-auto-split option допустима, но не действует. |
| `--strict-links` | false | Локальные unresolved/ambiguous links превращают W_LINK_* в E_LINK_*; выпуск ZIP запрещён. По умолчанию сохранить исходный href, дать warning+report. Не направлять ошибочную ссылку на первую главу. |
| `--epub-report <path>` | не писать файл | Детерминированный JSON schemaVersion=1; stdout остаётся пользовательским progress. Отчёт присутствует в API всегда. Path не совпадает с input/output, валидация до чтения источников. |
| `--epub-dry-run` | false | Полный parse→layout→rewrite→serialize/measure/validate с temp spool; без output ZIP и без изменения config/cache/source. Отчёт и diagnostics такие же, как generate, кроме mode/outputCommitted. Нужен для точного прогноза больших книг. |

Сохранить текущие `--toc-depth`, `--book-toc-depth`, `--chapter-toc-depth`: positive safe integer, без верхней границы 6 (проект использует extended headings). `--epub-version` строго 2/3; `chapter-toc=none|blocks|full|auto`, positions=start/end/both, book-toc=start/end. `nav-threshold` positive integer, `nav-max-items>=2`. Ошибки валидации не читают книги, не создают temp, не обновляют metadata config. Не менять публикационные CLI-флаги.

Default auto меняет **физическую упаковку** больших входов. Маленькие книги без необходимости split сохраняют chapter-N.html и source порядок. Для прежнего one-file-one-XHTML: `--no-auto-split` без `--split-at`; для прежних ручных границ: `--split-at 2 --no-auto-split`. Это сохраняет стратегию упаковки, а исправления Markdown/IDs/links остаются включены. Нумерация частей не обещает стабильности между разными редакциями текста/лимитами.

### 3.2 Markdown и атомарность

Для EPUB вводится `EpubMarkdownDocument` на **token AST marked**, один источник истины для heading, anchors, links, render и safe boundaries. EPUB больше не режет raw Markdown с последующим независимым regex-разбором. Telegraph/SVG остаются на текущем converter; общие pure AnchorGenerator-функции только читаются.

Ветка EPUB получает отдельный token→TelegraphNode адаптер; при `convertMarkdownToTelegraphNodes(...,{target:'epub'})` делегировать туда, чтобы прямые callers и generator не расходились. Импорты однонаправленные: новый адаптер не импортирует markdownConverter. Вынести EPUB-specific inline processing в новый модуль, не копировать весь legacy parser.

Поддержать GFM tables/strikethrough, fenced/indented code, list nesting/lazy continuation, blockquote, paragraphs, links/images, reference definitions и links. Extensions проекта: ATX >6 (семантический уровень хранится, XHTML tag h6 + существующее display prefix), мягкие переносы в стиховом paragraph как `<br/>`, `<!-- Page N -->` при pageBreaks. Шлока = один paragraph (включая строки с daṇḍa), либо целый blockquote/code; по строкам/символам не делить. Строфы, разделённые пустой строкой, являются отдельными paragraphs. Таблица только при валидной delimiter-row. ATX/setext headings поддержать по AST; inline formatting/link text не терять.

Atomic unit: top-level paragraph, fenced/indented code, **весь** top-level list с вложенностями, весь blockquote, вся table, thematic break, безопасный HTML block. Heading и последующие безтекстовые anchors/page markers связываются с первым следующим содержательным блоком (`keep-with-next`); trailing heading остаётся самостоятельным. Не резать внутри atomic unit, inline token или entity. Reference definitions — metadata с source range, не печатный текст; хранить file-wide dictionary (включая определения позже употребления), нормализация reference labels по marked, duplicate definition first-wins как parser с диагностикой.

Raw HTML: поддержать якоря `<a id="…"></a>`/`<a name="…"></a>` и inline `id` на разрешённых элементах; разрешённый XHTML subset = p/div/span/a/em/strong/del/code/pre/blockquote/ul/ol/li/table/thead/tbody/tr/th/td/h1…h6/br/hr/img. Разобрать в структурированные nodes (не конкатенировать HTML без проверки), запретить script/style/iframe, event attrs; неподдержанное HTML отобразить escaped literal с W_HTML_UNSUPPORTED. Многострочный HTML block неделим. Для `## Heading {#custom-id}` определить явный EPUB-only extension: удалить suffix из display, зарегистрировать explicit anchor; в code/escaped braces extension не работает. Сохранить payload видимого текста, ссылки, изображения и heading levels; front matter/comments исключаются только по явному metadata/comment контракту, а page comments становятся page nodes. Не объявлять byte-identical Markdown output: доказательство сохранности — source-range coverage + нормализованный semantic AST ledger.

Вместо `removeDuplicateTitle` над строкой: если первый **видимый** узел h1 равен выбранному title по прежнему trim/lowercase сравнению, оставить именно исходный h1 и его anchors, не добавлять wrapper h1. Иначе добавить один synthetic file-title в первой части source. Продолжения получают `<title>` head и `<div class="epub-continuation">…</div>` при необходимости визуального названия; это не heading и не пункт ToC. Preamble остаётся перед первым heading; пустых частей нет. Границы `--split-at` не повышают h2/h3 до h1.

### 3.3 Индекс адресов и идентификаторы

`SourceKey = resolve(sourcePath)` без lowercasing пути. Канонизация не realpath: синонимы symlink не склеиваются неявно, path-дедупликация совпадает с текущим BFS. Явно переданный source сначала разрешать как filesystem path буквально; percent-decoding применяется к URI пути ссылки **ровно один раз**, не повторять при `%25`.

`normalizeFragment(raw)`: убрать один leading `#`, один раз decodeURIComponent, NFC; регистр сохраняется. Некорректный `%` → W/E_LINK_ENCODING, не throw вне diagnostics. Не транслитерировать весь href или внешний URL на serializer stage. HTML entities уже декодированы parser. Локальную URI разобрать на path/query/fragment до decode; `#x` означает исходный **source**, а не текущий slice. `file.md` и `file.md#` → первая непустая часть. Query на local Markdown пока unsupported: W/E_LINK_QUERY и сохранить href целиком; не терять query молча. `https/http/mailto/tel/data` и прочие URI schemes/`//host` — external, сохраняются без transliteration и без сети.

Перед layout зарегистрировать все anchors в source order. Reserve explicit anchors и page IDs сначала; одинаковый explicit id в одной source — **E_ANCHOR_DUPLICATE** (не выбирать случайный target). Heading ID base = существующий `generateAsciiAnchor(headingInfo)`, suffix `-2`, `-3` по occurrence с проверкой всех занятых ID; суффикс зависит от целой source, не chunk. Page ID `page-N`, при повторе той же страницы в source `page-N-2` с warning; страницы разных source не схлопывать по числу. Удалённый duplicate-title больше не теряет anchor.

Индекс aliases содержит emitted ID, прежний Unicode `generateAnchor`, normalized explicit ID и occurrence suffix variants; alias→ordered TargetId[]. Resolve: exact emitted ID → exact explicit alias → exact Unicode alias → transliterated candidate **только если единственный**. Повторный одинаковый heading без suffix адресует первое occurrence; W_LINK_AMBIGUOUS возникает при разных targets одного transliteration alias без exact match. Explicit alias имеет приоритет над heading alias. Никогда не заменять known missing fragment на bare first chapter.

XML IDs уникальны в XHTML; одинаковый ID в разных source допустим. **Глобальный уникальный ключ** — `{sourceKey,anchorOrdinal}`/`TargetId`, а не строка id: final address `(href,id)` всегда однозначен. IDs heading не меняются от layout. Manifest/spine/navPoint IDs имеют собственные пространства (`item-chapter-N`, `nav-N`), не образуются из непроверенного user input.

После layout весь индекс target→documentHref замораживается; href для любого local target записывается как `chapter-N.html#id`, даже внутри того же XHTML (одинаковая длина и единая семантика). Для file-only — `chapter-N.html`. Forward/back links, links в headings/ToC/table/list/image captions и reference links проходят один resolver. Нерезолвимый local link сохраняется только с diagnostic; strict mode блокирует commit.

### 3.4 Точный packer и завершение

1. AST→ordered atomic units + logical source outline; заданные heading boundaries обязательны. IDs/изображения/semantic navigation symbols готовы до pack.
2. Начальная partition — только обязательные boundaries (или вся source). Никогда не смешивать две source в одной content part.
3. Присвоить chapter-N в spine-order, сформировать target map, переписать symbols, сгенерировать **финальный** wrapper+nodes+inline ToC. Image filenames определяются до этого, размер attrs окончательный.
4. Измерить `Buffer.byteLength(xhtml,'utf8')`. Для overflow composite выбрать последнюю вмещающуюся границу перед heading внутри part; если такой нет — последнюю вмещающуюся границу между top-level atomic units. Оценивать final render candidate, а не Markdown bytes. Если ни одна часть-prefix не помещается — отделить первый atomic group; warn/error как ниже.
5. Добавлять cuts монотонно, **не объединять части обратно**. Повторить numbering→map→rewrite→render всех затронутых частей; при росте `chapter-9→chapter-10` перепроверить все href-зависимые XHTML. Консервативно допустим полный rerender итерации на этапе A, но без quadratic перебора всех prefixes: cached serialized-unit byte sums + binary search, затем точная проверка выбранной границы; heading-preference проверяется в уже вмещающемся prefix.
6. Остановка: в итерации либо >=1 новая граница из конечного набора U−sources, либо классифицированный singleton overflow. Нет новой границы при composite overflow → E_LAYOUT_STALLED (внутренний дефект), не бесконечный retry. Существующие cuts не удаляются. Финальный проход заново измеряет записанные bytes, а не доверяет prediction.
7. У единицы, которая не помещается даже одна с минимальным wrapper, default `warn`: сохранить целиком, report actual/limit/source range/kind; `error`: E_OVERSIZE и output прежний. Огромный paragraph/code/list не резать по UTF-16, bytes, предложениям или строкам. Wrapper metadata слишком велико даже без body → E_WRAPPER_OVERSIZE, дальнейшие cuts не помогут.

Generated inline full-ToC — отдельный atomic list в логической главе, позиции start/end/both относятся ко всей логической секции, а не каждой технической части. Blocks navigation использует текущий алгоритм выбора вех по семантическим headings, максимум navMaxItems. Если generated list сам oversized, он получает тот же warn/error, не бесконечное переразбиение. Это явное ограничение, отражённое в report; исходные headings не выкидывать ради лимита.

Проверять size каждого XHTML, включая title-page, book-toc и nav.xhtml. `maxChapterBytes` — целевой максимум с классифицированными исключениями, а не скрытая гарантия: обязательный единственный nav.xhtml и единая book-ToC list могут быть oversized и отмечаются `kind:'navigation'`, `splittable:false`; strict oversize блокирует выпуск. NCX/OPF/CSS не XHTML, их bytes тоже сообщаются, но этот предел к ним не применяется. Для обычных fixtures без indivisible overflow **каждый** XHTML <= limit. Это избегает некорректного разбиения обязательного navigation document.

## 4. Контракты модулей и DTO

Все перечисленные новые файлы — **планируемые**, их ещё нет. Типы вынести в `src/epub/EpubTypes.ts`; вводить `EpubInputOptions` как exported interface со всеми нынешними constructor fields плюс `EpubSplitOptions`/runtime injection, а не как второй независимый набор defaults; public return `generate():Promise<void>` сохранить, добавить `getLastReport():EpubBuildReport|undefined`, `analyze():Promise<EpubBuildReport>`, `dispose():Promise<void>`. Constructor принимает существующие поля плюс нижеследующие. `addChapterFromFile(path,options):Promise<void>` на этапе B регистрирует/сканирует source; ошибки source всё ещё возвращаются awaited call. `setChapterPathMap` оставить deprecated compatibility shim для unsplit callers, final derived index всегда приоритетен; stale mapping даёт W_LEGACY_MAPPING, новые CLI calls его не используют.

```ts
export interface EpubSplitOptions {
  splitAt?: 1|2|3|4|5|6;
  maxChapterBytes?: number|null; // undefined=307200, null=off
  oversizePolicy?: 'warn'|'error';
  strictLinks?: boolean;
  signal?: AbortSignal;
}
export type SourceKey = string;
export type UnitId = string; // s<sourceOrdinal>-u<unitOrdinal>, deterministic
export type TargetId = string; // s<sourceOrdinal>-a<anchorOrdinal>
export interface SourceRange { startByte:number; endByte:number; startLine:number; endLine:number }
export interface SourceDescriptor {
  key:SourceKey; ordinal:number; title:string; originalBytes:number;
  sha256:string; metadata:Record<string,string>; sourceSpoolPath?:string;
}
export interface EpubAtomicUnit {
  id:UnitId; sourceKey:SourceKey; ordinal:number; range:SourceRange;
  kind:'heading'|'paragraph'|'code'|'list'|'blockquote'|'table'|'html'|'rule'|'generated';
  heading?:{level:number; text:string; targetId:TargetId};
  keepWithNext:boolean; anchorIds:TargetId[];
  payloadRef:string; // in A memory-store key; B on-disk record key
}
export interface AnchorTarget {
  targetId:TargetId; sourceKey:SourceKey; unitId:UnitId; id:string;
  aliases:string[]; kind:'heading'|'explicit'|'page'|'source-title'; ordinal:number;
}
export interface LinkSymbol {
  sourceKey:SourceKey; unitId:UnitId; nodePath:number[]; rawHref:string;
  range:SourceRange; kind:'content'|'toc'|'page';
}
export interface ChapterPart {
  id:string; href:string; sourceKey:SourceKey; firstUnit:number; endUnitExclusive:number;
  logicalSectionId:string; reason:'source'|'heading'|'size'; finalBytes:number;
}
export interface OutlineNode {
  id:string; sourceKey:SourceKey; level:number; label:string; targetId:TargetId;
  children:OutlineNode[]; // source root + semantic headings, never physical parts
}
export interface EpubDiagnostic {
  code:string; severity:'warning'|'error'; source?:SourceKey; range?:SourceRange;
  unitId?:UnitId; href?:string; actualBytes?:number; limitBytes?:number; message:string;
}
export interface EpubBuildReport {
  schemaVersion:1; mode:'generate'|'dry-run'; outputCommitted:boolean;
  settings:{maxChapterBytes:number|null;splitAt:number|null;oversizePolicy:'warn'|'error';strictLinks:boolean;epubVersion:2|3};
  sources:Array<{path:string;sha256:string;bytes:number;units:number}>;
  documents:Array<{href:string;kind:'content'|'navigation'|'title-page'|'book-toc';bytes:number;oversized:boolean;splittable:boolean}>;
  counters:{sourceBytes:number;contentParts:number;atomicUnits:number;localLinks:number;resolvedLinks:number;unresolvedLinks:number;ambiguousLinks:number;anchors:number;images:number;oversizedDocuments:number;maxXhtmlBytes:number;layoutPasses:number};
  diagnostics:EpubDiagnostic[];
  artifacts?:{debugDir?:string}; // operational paths excluded from deterministic comparison
}
export class EpubBuildError extends Error {
  code:string; diagnostics:EpubDiagnostic[]; report?:EpubBuildReport;
}
```

Методы владельцев (exported interfaces должны иметь unit tests, private implementation не диктуется):

```ts
// EpubMarkdownDocument.ts: only EPUB dialect, local Marked instance, no global marked.use()
parseEpubMarkdown(source:string, sourceKey:SourceKey, options:ParseOptions): ParsedSource;
// ParsedSource={descriptor,units,payloadStore,anchors,outline,definitions,links,pages,images,coverage}
// EpubTokenRenderer.ts
renderEpubTokens(tokens:readonly EpubToken[], context:EpubRenderContext): TelegraphNode[];
// context contains assigned IDs, definition registry and link/image symbols; no fresh regex heading scan
// EpubAnchorRegistry.ts
class EpubAnchorRegistry {
  registerSource(parsed:ParsedSource): void;
  assignParts(parts:readonly ChapterPart[]): void;
  resolve(source:SourceKey, href:string): ResolvedLink; // discriminated resolved/external/unresolved/ambiguous
  target(targetId:TargetId): {href:string;id:string};
}
// EpubLayoutPlanner.ts
class EpubLayoutPlanner {
  plan(book:EpubBookModel, options:NormalizedEpubOptions, renderer:EpubXhtmlRenderer): Promise<LayoutResult>;
}
// EpubXhtmlRenderer.ts
class EpubXhtmlRenderer {
  renderPart(part:ChapterPart, context:RenderContext): Promise<RenderedXhtml>;
  // RenderedXhtml in A={text,bytes,sha256}; B={spoolPath,bytes,sha256}; byte count from same emitted bytes
}
// EpubNavigation.ts
buildOutline(sources:readonly ParsedSource[]): OutlineNode[];
renderNav(outline:readonly OutlineNode[], pages:readonly PageTarget[], index:EpubAnchorRegistry, options:NavigationOptions): string;
renderNcx(...sameContext): string;
renderBookToc(...sameContext): string;
// EpubOptions.ts
normalizeEpubOptions(input:EpubInputOptions): NormalizedEpubOptions;
parseByteSize(value:string): number;
// src/cli/EpubCliOptions.ts
parseEpubCliOptions(raw:Record<string,unknown>, explicitlySet:ReadonlySet<string>): EpubCliOptions;
// EpubDiagnostics.ts
finalizeReport(state:BuildState): EpubBuildReport;
// EpubSourceScanner.ts, stage B
class EpubSourceScanner {
  scan(path:string, ordinal:number, session:EpubBuildSession): Promise<ScannedSource>;
  units(source:ScannedSource, session:EpubBuildSession): AsyncIterable<EpubAtomicUnit>;
}
// EpubSpoolStore.ts, stage B
class EpubSpoolStore implements PayloadStore {
  put(unitId:UnitId, payload:EpubUnitPayload): Promise<string>;
  get(ref:string): Promise<EpubUnitPayload>;
  release(ref:string): Promise<void>;
  dispose(): Promise<void>;
}
```

`ParseOptions` = `{sourceOrdinal:number; pageBreaks:boolean; metadataMode:'publication'; sourceTitle?:string}`. `EpubRenderContext` = `{sourceKey, anchors, definitions, pageBreaks, epubVersion}`; `RenderContext` добавляет final target/image maps, wrapper metadata и per-logical-section generated nav. `NormalizedEpubOptions` включает все существующие metadata/ToC параметры, новые flags и нормализованные defaults. `EpubUnitPayload={tokens:EpubToken[]; links:LinkSymbol[]; images:ImageSymbol[]}`. `EpubBookModel={sources,unitIndex,payloadStore,anchorRegistry,outline,pages,images}`. `LayoutResult={parts,report,documents}`. `ResolvedLink` на success содержит `href,targetId?`; external — исходный href; failures — diagnostic и исходный href. Не использовать `any` или undocumented property access в новых production modules.

### 4.1 Navigation, pages и image packaging

Outline source-order строится до split. Root source-title выводится один раз; совпадающий первый h1 — тот же logical node. Depth filter применяется к **исходным** уровням; при пропуске уровней parent = ближайший предшествующий меньший level, без искусственных headings. nav.xhtml, NCX, book-ToC используют тот же outline + registry; технические continuation parts не добавляют navPoints. В NCX playOrder монотонен в DFS; IDs уникальны; computed depth соответствует дереву.

Spine содержит все content parts ровно один раз в source/BFS порядке, book-ToC согласно start/end, title-page первым; nav.xhtml не становится новой главой автоматически. EPUB3 manifest nav properties и dcterms:modified; EPUB2 без EPUB3-only attrs/meta/nav.xhtml, с NCX и корректным OPF2 markup. Page-list EPUB3 строится из PageTarget occurrence order (не Map<number,...>); EPUB2 NCX pageList и page anchors без epub:type. Повтор page label не означает duplicate ID. Все ToC/page/guide/landmark ссылки проверяются как content links.

Image registry book-wide: normalize source-relative image path, один entry на canonical absolute file; коллизии basename разрешать детерминированным source/content-hash suffix, одинаковые content bytes можно dedupe по sha256+mediaType. Сканировать и hash streaming в B. Preserve query/fragment только для external image URI; local missing/unsupported image diagnostic с прежней политикой, strict-links превращает missing local target в error. Images/cover registry фиксируется до size layout; manifest и actual ZIP совпадают. Не скачивать remote assets как новую скрытую функцию. Existing image bundling behavior для поддержанных локальных images покрыть regressions.

### 4.2 Error/report contract

`E_OPTION`, `E_STATE`, `E_PARSE`, `E_SOURCE_READ`, `E_SOURCE_CHANGED`, `E_ANCHOR_DUPLICATE`, `E_WRAPPER_OVERSIZE`, `E_OVERSIZE`, `E_LINK_UNRESOLVED`, `E_LINK_AMBIGUOUS`, `E_LINK_ENCODING`, `E_LINK_QUERY`, `E_LAYOUT_STALLED`, `E_XML_INVALID`, `E_ZIP_LIMIT`, `E_IO`, `E_ABORTED`, `E_CLEANUP`, `E_REPORT_WRITE`. Messages человеку, stable codes для automation. `W_OVERSIZE`, `W_LINK_*`, `W_DUPLICATE_PAGE`, `W_DUPLICATE_DEFINITION`, `W_HTML_UNSUPPORTED`, `W_LEGACY_MAPPING` аналогично. Не хранить stack/absolute temp IDs/timestamps в deterministic report core; source paths relative to declared input root в persisted JSON, full paths допустимы только в debug. Diagnostics сортировать source ordinal/range/code/href, не по async finish order.

CLI exit: success/dry-run 0, option parse/validation 2, generation/strict/IO failure 1, SIGINT/Abort 130. Existing action catch не должен перекрывать эти коды `process.exit(1)`; выставлять exitCode после awaited cleanup. При warning summary вывести unresolved count, oversized count, максимальный actual size и report path. Не вводить numeric quality score.

## 5. Этап B — spool, проходы, память и lifecycle

### 5.1 Конкретная схема и честная граница памяти

A может держать одну source AST и её units в RAM; он **не считается** выполнением оптимизации. B заменяет memory payload store дисковым и исключает whole-file read **на всём CLI→generator→zip пути**. Global lightweight indexes (sources/units offsets/anchors/outline/links/images) остаются в RAM; тело всех глав — нет. Оценка памяти B: `O(maxBufferedMarkdownUnit + maxRenderedUnit + indexMetadata + streamBuffers)`, а не O(всей книги). Неделимый 20 MiB paragraph может потребовать O(20 MiB) и временных parser allocations: абсолютный bounded RSS для произвольного блока **не обещается**. Это явно отмечается report/документацией/benchmark.

Проход 1 (по каждой source в порядке BFS): открыть input один раз, читать Uint8Array chunks по 64KiB через TextDecoder stream с сохранением Unicode across chunk boundary; одновременно sha256 и копирование **сырого input** в session spool. Source ranges считаются в original bytes; BOM/CRLF нормализуются для parser через mapping, не меняя file. Найти front matter/title, definitions, headings/explicit/page anchors, local-link dependencies и image descriptors. Для заголовков/ссылок использовать тот же EPUB tokenizer через block framer, не regex whole file. Определения позже ссылки разрешаются после завершения source scan; порядок зависимостей — по порядку usages, не definitions. BFS reads используют этот же `ScannedSource`, title extraction не читает файл повторно.

Проход 2: читать immutable raw spool, завершать inline tokenization с file-wide definition table, присваивать постоянные anchor IDs; писать unit payload JSON records отдельно с offsets/index. `EpubSpoolStore.get` держит максимум одну active unit; no unbounded Promise.all over units. Layout/rerender многопроходный по **spool**, не повторно по меняющемуся input. Сериализатор пишет wrapper и units последовательно, считает SHA/UTF8 bytes на тех же chunks; payload освобождается после записи. Final packaging читает final XHTML/images потоками. Отладочный режим сохраняет manifest/index и per-source/per-unit JSON в одном debugDir; не пишет `source.epub.json` рядом с источником.

Input consistency: compare stat до/после streaming read и incremental content hash; при отличии stat E_SOURCE_CHANGED; immutable spool становится источником истины build. Если source changed после scan, сборка использует captured spool и report его hash, не смешивает версии. Перед final commit повторить stat/hash **только если input stat изменился**; при отличии hash E_SOURCE_CHANGED (детерминированный отказ). Images snapshot/copy/hash на pass 1 и используют snapshot. Не требовать reread всех inputs при каждом layout pass.

### 5.2 Incremental block framing без второго диалекта

`EpubBlockFramer` — scanner envelopes вокруг complete top-level tokens; marked остаётся parser semantics. State: frontMatter, paragraph, fence `{char,minLength,indent}`, indentedCode, list stack `{indent,marker,loose}`, blockquote nesting/lazy continuation, html block kind, pending setext/table delimiter, reference-definition continuation. Чанки UTF8 не являются parse boundaries.

```ts
class EpubBlockFramer {
  push(text:string, endOfInput?:boolean): FramedBlock[];
  finish(): FramedBlock[];
}
interface FramedBlock { raw:string; range:SourceRange; complete:boolean }
```

Накопленный candidate перед отдачей обязан совпасть с полным token.raw prefix от локального marked lexer. Оставлять последнюю потенциально продолжаемую top-level unit до следующего complete block/EOF; пустая строка внутри loose list/blockquote сама по себе не boundary. Fence закрывает только тот же char длиной >= opener, с пустым trailing text. Indented code определяется после container indentation. Setext/table решение требует следующей строки. List/blockquote lazy paragraph не выпускать при незакрытом container; reference continuation/title не отрывать. HTML block завершается по token grammar, не на произвольном `>`.

При неоднозначном состоянии удерживать envelope дольше, а не выдавать вероятную boundary; это может временно увеличить память и создать более крупную indivisible group, но не потерять текст. На finish tokenizer обязан потребить **все** raw bytes с coverage ledger; непотреблённый suffix → E_PARSE (добавить этот stable code в EpubBuildError union). Отличие framed parse от full-source AST на контрольных/adversarial corpora — блокер этапа B. Differential oracle сравнивает semantic AST с file-wide definitions, а не только count частей. Не объявлять marked.lexer streaming API: он принимает string; streaming обеспечивается нашим проверяемым framer и spool. Очень длинная одна строка/единица остаётся оговорённым пределом.

### 5.3 IO injection и сессия

Новый EPUB-local `EpubIO` расширяет существующий DstIO композиционно (не ломает чужие mocks):

```ts
interface EpubIO {
  base: DstIO; // now/hash/randomId/env + small metadata IO
  readChunks(path:string, signal?:AbortSignal): AsyncIterable<Uint8Array>;
  openWriter(path:string, options:{exclusive:boolean}): Promise<EpubWriter>;
  mkdtemp(parent:string,prefix:string): Promise<string>;
  renameReplace(staged:string,target:string): Promise<void>; // same-filesystem atomic rename
  readRange(path:string,start:number,length:number): Promise<Uint8Array>;
  stat(path:string): Promise<{size:number;mtimeMs:number;ino?:number}>;
}
interface EpubWriter {
  write(bytes:Uint8Array):Promise<void>; // resolves after backpressure, rejects on stream error
  close():Promise<void>; abort():Promise<void>;
}
class EpubBuildSession {
  static create(outputPath:string, io:EpubIO, options:{debug:boolean;signal?:AbortSignal}):Promise<EpubBuildSession>;
  finish(stagedZip:string):Promise<void>;
  dispose(reason:'success'|'failure'|'abort'):Promise<void>;
}
```

`RealEpubIO` — node fs stream/await drain/finished, `MockEpubIO` — deterministic chunk scheduler вокруг MockDstIO + виртуальные open-writers/ranges/rename; faults доступны по operation ordinal и конкретному path. Constructor injection EpubGenerator `runtime?:{io:EpubIO}`, default production factory. Все прямые FS/date/random/ZIP IO EPUB-пути переводятся в adapter; тест импортирует **реальный EpubGenerator** с injected IO. Pure mocks planner-only не считаются module DST.

State machine `new→scanning→planning→rendering→packaging→committing→done`; failure/abort → disposing→failed/aborted, terminal methods idempotent. Запрет generate/analyze concurrently на одном instance: E_STATE; повторный generate на использованном instance E_STATE (новый instance для следующего build), dispose idempotent. Не оставлять два signal handlers. Poll signal между chunks/units/layout passes/ZIP entries, race abort vs commit: до rename abort выигрывает, после успешного atomic rename результат committed, не заявлять rollback.

Temp: уникальный mkdtemp в output dirname (same filesystem), staging archive внутри session dir; писать в final output только atomic rename после XML/links/size/ZIP validation. Existing output остаётся byte-identical при parse/strict/write/zip/cancel errors **до commit**. Successful generation по прежнему заменяет requested output; не вводить новый force prompt. Конкурентные builds в один output различают sessions; последний успешный rename выигрывает, partial outputs не смешиваются; эта политика документирована, DST проверяет целостность каждого возможного победителя.

Cleanup в finally закрывает readers/writers, удаляет только session-owned paths, never source/output parent. `debug=true` сохраняет spool и diagnostic manifest с фазой отказа; `debug=false` удаляет всё. Cleanup error сохраняет primary error, добавляет E_CLEANUP, выводит точный leftover path; успешный commit с последующим cleanup failure не выдаёт «output не создан», report.outputCommitted=true, exit 1. Dispose при failed addChapter также обязательный у CLI. Dry-run всё закрывает и удаляет аналогично.

Report сначала staged; до output commit проверить, что report destination доступна для staged rename. После ZIP commit report rename может всё же отказать: outputCommitted=true, E_REPORT_WRITE, exit 1. Это честно задокументированная неатомарность пары output+sidecar; не удалять успешно созданную книгу. При generation failure писать best-effort report с primary error; report failure не маскирует его.

### 5.4 ZIP, время и воспроизводимость

Заменить обе текущие ZIP ветки одной `EpubZipWriter`, store-only (method 0) streaming, без новых runtime dependencies. `mimetype` первым, точно `application/epub+zip`, без BOM/newline/compression/extra fields. Затем остальные files в lexicographic POSIX path order. Для каждой immutable staged file сначала streaming CRC32+length, затем header+stream bytes с backpressure; центральный каталог metadata можно держать в RAM O(entries). Date fields фиксированные валидные DOS 1980-01-01, UTF8 filename flag явно; entries paths ASCII по генератору. Не собирать Buffer[] содержимого. Перед записью проверить ZIP32: entry count<=65535, size/offset/central size<=0xffffffff; превышение E_ZIP_LIMIT до output commit, без truncation. ZIP64 в эту задачу не входит.

`EpubZipWriter.write(entries:readonly ZipEntry[], destination:string, io:EpubIO, signal?:AbortSignal):Promise<ZipReceipt>`; ZipEntry `{path,zipPath,bytes,crc32?}`, receipt `{sha256,bytes,entryCount}`. Directory names/temp/random IDs не входят в archive. `SOURCE_DATE_EPOCH` при наличии строго nonnegative safe integer seconds задаёт modified timestamp; без него io.now(), один раз per session. Identifier при явном option сохраняется; default deterministic content/options hash (sha256 ordered relative source paths+source hashes+metadata+render options), UUID URN из первых 128 bits с документированной версией либо `urn:sha256:<digest>` — выбрать **urn:sha256**. Identifier не включает absolute checkout path, temp и текущий time. Две сборки с одинаковыми input/options и pinned SOURCE_DATE_EPOCH дают byte-identical ZIP/report core; без pin допускается только metadata modified difference, semantic output одинаков.

