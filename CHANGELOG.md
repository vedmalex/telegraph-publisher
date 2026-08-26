# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### EPUB: большие книги, оглавления и разметка

Изменения вызваны сборкой корпуса санскритских текстов: том, где каждый стих — заголовок,
превращался в один документ на 16.8 МБ с 12 142 пунктами навигации, санскрит терял разметку
и построчное деление, а ссылки внутри главы никуда не вели.

#### Added
- **Строка переходов внутри длинной главы.** Глава из сотен пронумерованных разделов
  открывается на первом из них, а до двадцатого нужно листать; перечислять их все в
  оглавлении бессмысленно — список выходит длиннее самой главы. Новый модуль
  `src/navigation/sectionNav.ts` строит короткую строку вида «К тексту: 1 · 20 · 40 · 60».
  Шаг берётся из лестницы круглых значений — наименьший, при котором переходов не больше
  двенадцати: читатель просит «к двадцатому», а не «к тринадцатому». Ниже тридцати разделов
  строка не появляется. Вехи ставятся по номерам, которые видит читатель, а не по порядку
  следования в файле: эти два счёта расходятся — перед стихами стоит мангалачарана, номера
  пропускают значения, вставные стихи ломают возрастание. Модуль не знает ни о стихах, ни о
  EPUB: он принимает заголовки и отдаёт узлы, а ряд находит по преобладающему уровню
  заголовков, поэтому «Мантра» и «Сутра» работают без настройки. Управляется значением
  `blocks` у `--chapter-toc`, которое `auto` выбирает само, когда `--toc-depth` прячет эти
  заголовки из навигации читалки. Строка повторяется в конце главы: дочитав до конца, не
  нужно возвращаться к началу.
- **`--epub-version <2|3>`** — версия, которую объявляет пакет. Раньше всегда объявлялась
  `3.0`, и старые читалки оставались гадать. При версии 2 не пишутся ни навигационный
  документ, ни метаданные EPUB 3, а навигацию несёт `toc.ncx`, которого такие читалки и
  ждут. `nav.xhtml` при этом не создаётся вовсе: объявить его в манифесте EPUB 2 негде, а
  необъявленный файл делает пакет невалидным. По умолчанию по-прежнему 3.

- **`--split-at <n>`** — книга режется на отдельные xhtml по заголовкам уровня `n` и выше.
  Читалка загружает документ целиком, поэтому рекомендация EPUB — держаться около 300 КБ;
  один файл на входе давал один документ независимо от размера. Заголовок, с которого
  начинается часть, становится её `<h1>` и сохраняет свой прежний якорь, так что ссылки на
  него продолжают работать. Код внутри ``` не принимается за заголовок.
- **`--toc-depth <n>`** — глубина навигации читалки (`toc.ncx`). Более глубокие заголовки
  остаются доступны через текст.
- **`--chapter-toc <start|end|none|auto>`** и **`--chapter-toc-depth <n>`** — список
  собственных заголовков главы в её тексте. Значение по умолчанию `auto` связывает два
  оглавления: пока `--toc-depth` прячет заголовки из навигации, список в тексте — единственный
  путь к ним, и он добавляется сам; когда навигация показывает всё, список только повторял бы её.
  `--inline-toc` и `--no-inline-toc` продолжают работать как `start` и `none`.
- **`--book-toc <start|end>`** и **`--book-toc-depth <n>`** — отдельная страница с оглавлением
  всей книги, первой или последней в spine, со ссылкой `guide type="toc"`. По умолчанию
  выключена: она дублирует навигацию читалки — это оправдано там, где навигации нет
  (чтение файлов в браузере, печать), и неуместно как двенадцать тысяч строк перед текстом.
- **`tocPosition`** в конвертере — оглавление можно поставить после текста, а не перед ним.
- **`tocNested`** — оглавление в тексте строится деревом. Прежний плоский список ставил главы
  и стихи рядом на одном уровне. Вложенность считается по ближайшему более мелкому уровню,
  поэтому книги, пропускающие уровни, тоже раскладываются верно.

#### Fixed
- **Якоря заголовков в EPUB транслитерируются в латиницу.** Заголовки книг русские, поэтому
  якорь выходил кириллическим — `id="Текст-1"`, ссылка `#Текст-1`. В читалке такая ссылка
  видна, но переход не срабатывает; процентное кодирование фрагмента, которого требует
  RFC 3986, проблему не решило. Теперь для цели `epub` якорь приводится к ASCII:
  `#Tekst-1`. Схема — упрощение ГОСТ 7.79 (система Б) с двумя оговорками: `х` передаётся как
  `h`, потому что в этих текстах это придыхание («Бхагавад» → `Bhagavad`), а макрон долготы
  удваивает букву (`ā` → `aa`), иначе «Шри» и «Шрӣ» слились бы в один якорь. Знаки препинания
  без ASCII-эквивалента становятся дефисом, а не исчезают: сплошная проверка 191 747
  заголовков показала 29 пар, которые различались только ими. **Путь Telegraph не изменился**
  — там якорь определяет сама платформа, и наши ссылки обязаны с ним совпадать; это
  закреплено тестом.
- **Навигационный документ EPUB 3.** Пакет объявлял версию 3.0, а навигацию нёс только
  `toc.ncx` — форма EPUB 2. Читалка, верящая объявленной версии, ищет `nav.xhtml`, не находит
  и остаётся без собственной навигации. Теперь пишутся обе формы, из одних и тех же
  заголовков и с учётом `--toc-depth`.
- **Жёсткие переносы строк.** Строка, кончающаяся двумя пробелами, — это перенос по стандарту
  Markdown, и санскрит записан именно так: каждая строка шлоки завершается им. Конвертер
  различия не знал и соединял строки переводом строки, который отображается пробелом, — стих
  из двух строк приходил одной и терял размер, которым написан. Теперь такие строки дают
  `<br/>`, а простой перенос по-прежнему соединяет, поэтому абзац, который автор лишь перенёс
  в редакторе, ведёт себя как прежде. Затронута только цель `epub`: включать это для
  Telegraph значило бы переверстать все опубликованные страницы.

- **Курсив в строках с вертикальной чертой.** Санскритская шлока заканчивается дандой `|` или
  `||`, а любая строка с `|` считалась строкой таблицы. Две строки стиха попадали в `parseTable`,
  которому нужно не меньше трёх, и тот возвращал их абзацем, не прогнав через инлайн-разметку —
  звёздочки печатались буквально. Теперь таблица открывается только при строке-разделителе, а
  запасной путь в любом случае обрабатывает разметку.
- **HTML-комментарии** не обрабатывались нигде: `<!-- Page 12 -->` экранировался и печатался в
  тексте. Незакрытый комментарий вёл себя хуже — поглощал следующий заголовок, и тот пропадал
  из оглавления. Комментарии вырезаются до разбора, незакрытые — только до конца своей строки,
  чтобы не потерять остаток книги.
- **Уровни заголовков в EPUB.** Конвертер сводил `h1/h2/h3` к `h3`, потому что Telegraph API
  других не знает. EPUB — обычный XHTML со всеми шестью уровнями, и теперь сохраняет уровень,
  написанный автором. Без этого глава и стих неразличимы, а навигацию нечем ограничить по
  глубине. Путь Telegraph не изменился.
- **`tocDepth` и `tocNested` в production.** Обе опции реализованы в unified-ветке построения
  оглавления, а она отключается при `NODE_ENV=production` — то есть опции молча игнорировались.
  Явно заданная опция теперь сама выбирает нужную ветку.

#### Changed
- Идентификаторы в `manifest` и `spine` строятся от имени файла, а не от позиции в списке:
  вставка страницы оглавления больше не перенумеровывает все главы за ней.
- Ссылки внутри книги разрешаются при сборке, а не при добавлении главы. Раньше соответствие
  файла документу вычислялось заранее по его позиции; при разбиении число документов известно
  только после разбиения, а ссылка может указывать на ещё не обработанный файл.

## [2.0.0] - 2025-08-05

### 🚀 Major Changes - CLI Flags Refactoring

#### Added
- **Unified Force Flag**: New `--force` flag combines functionality of `--force` and `--force-republish`
- **Enhanced Flag Propagation**: All flags now propagate through entire dependency chain
- **Type-Safe Options System**: New `PublishDependenciesOptions` interface with validation
- **Builder Pattern Support**: `PublishOptionsBuilder` for complex option construction
- **Intelligent Error Handling**: User-friendly migration guidance for deprecated flags
- **Comprehensive Documentation**: Migration guide and API reference

#### Changed
- **BREAKING**: Removed `--force-republish` flag (use `--force` instead)
- **Default Configuration**: Updated `maxDependencyDepth` from `1` to `20`
- **API Signature**: `publishDependencies` now accepts options object instead of individual parameters
- **Flag Behavior**: `--force` now handles both link verification bypass and force republication
- **Dependency Processing**: Deeper dependency traversal by default

#### Enhanced
- **Error Messages**: Deprecated flag usage shows helpful migration guidance
- **Type Safety**: Complete TypeScript interfaces for all publisher options
- **Testing Coverage**: 71 comprehensive tests with 100% success rate
- **Architecture**: Clean layer integration patterns between CLI, Workflow, and Publisher
- **Validation**: Runtime validation with sensible defaults for all options

#### Preserved
- **Backward Compatibility**: `publishWithMetadata` maintains existing signature
- **Critical Behavior**: `--force` flag NEVER creates new pages for published content
- **Existing Functionality**: All legacy CLI options continue to work
- **Performance**: Maintained and improved options transformation performance

### 🛡️ Safety Guarantees

- ✅ **No Breaking Changes** for `publishWithMetadata` API
- ✅ **Force Flag Safety** - Always uses edit paths for published content
- ✅ **Metadata Preservation** - Existing publication data maintained
- ✅ **Regression Protection** - Comprehensive tests prevent functionality loss

### 📚 Migration Guide

#### CLI Usage
```bash
# ❌ Old (deprecated)
telegraph-publisher pub --file article.md --force-republish

# ✅ New (unified)
telegraph-publisher pub --file article.md --force
```

#### API Usage
```typescript
// ❌ Old API
await publisher.publishDependencies('file.md', 'author', true, true, 'Title', false);

// ✅ New API
await publisher.publishDependencies('file.md', 'author', {
  dryRun: true,
  force: true,
  generateAside: true,
  tocTitle: 'Title',
  tocSeparators: false
});
```

### 🧪 Testing

- **71 Tests** with 100% success rate
- **Unit Tests**: Core functionality validation
- **Integration Tests**: End-to-end workflow testing  
- **Regression Tests**: Backward compatibility protection
- **Performance Tests**: Options transformation efficiency

### 📖 Documentation

- **Migration Guide**: Step-by-step upgrade instructions
- **API Reference**: Complete interface documentation
- **Troubleshooting**: Common issues and solutions
- **Examples**: Usage patterns and best practices

### 🏗️ Architecture Improvements

- **Options Propagation Patterns**: Clean transformation between layers
- **Type-Safe Validation**: Runtime validation with compile-time safety
- **Error-First Design**: Structured error handling with user guidance
- **Builder Patterns**: Flexible option construction for complex scenarios
- **Clean Architecture**: Separation of concerns across CLI, Workflow, Publisher

### 🔧 Technical Details

#### New Interfaces
- `PublishDependenciesOptions` - Unified options interface
- `ValidatedPublishDependenciesOptions` - Runtime-validated options
- `DeprecatedFlagError` - Structured error for deprecated flags

#### New Classes
- `PublishOptionsValidator` - Options validation and defaults
- `PublishOptionsBuilder` - Builder pattern for complex options
- `OptionsPropagationChain` - Clean options transformation
- `LayerIntegrationPattern` - Cross-layer integration
- `UserFriendlyErrorReporter` - Enhanced error formatting

#### Updated Methods
- `publishDependencies()` - New options-based signature
- Enhanced error handling throughout CLI layer
- Improved options propagation in Publisher layer

---

## [1.x.x] - Previous Versions

[Previous changelog entries would go here...]

---

### 🔗 Links

- [Migration Guide](./docs/CLI-FLAGS-MIGRATION-GUIDE.md)
- [API Reference](./docs/API-REFERENCE.md)
- [Full Documentation](./docs/)

**For complete details on any change, see the linked documentation above.** 