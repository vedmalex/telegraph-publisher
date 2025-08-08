# CREATIVE - Architecture & Design Decisions

## 1. Logger/Reporter Unification
- Introduce `src/shared/logging/Logger.ts` with levels: error, warn, info, debug, silent
- Support plain text and JSON modes; environment-controlled default
- Provide child loggers with context (module name)
- `ProgressIndicator` to adapt (progress uses info/debug; spinner only when TTY)
- `ReportGenerator` to route all output via Logger

## 2. Error Hierarchy & Result Types
- Define `src/shared/errors/` classes: `ConfigurationError`, `ValidationError`, `NetworkError`, `RateLimitError`, `UserFlagError`
- Add lightweight `Result<T,E>` helpers to avoid exceptions for expected flows in CLI/workflow

## 3. Links Regex & FS Utilities
- Create `src/links/utils/regex.ts`: single source for markdown link regex (balanced parentheses)
- Create `src/links/utils/fs.ts`: `isMarkdownFile(path)`, `DEFAULT_EXTENSIONS = ['.md','.markdown']`
- `LinkScanner`, `LinkResolver`, `markdownConverter` consume these utilities

## 4. Path Normalization Delegation
- `PagesCacheManager` uses `PathResolver` for absolute path normalization and POSIX formatting
- Warnings about relative → absolute в Logger (warn), без дублирования

## 5. AnchorGenerator Integration Plan
- `markdownConverter` полностью переходит на `AnchorGenerator` для:
  - детекции заголовков (parseHeadingsFromContent)
  - генерации якорей (generateAnchor)
  - ToC строится из `HeadingInfo` + `createTocChildrenFromHeadingInfo`
- Единый источник поведения для H5/H6/extended

## 6. CLI Stabilization
- Вынести регистраторы команд: `src/cli/commands/registerPublish.ts` и т.п.
- Вынести обработчики: `src/cli/handlers/publish.ts` и т.п.
- Типизировать опции: `PublishOptions`, `AnalyzeOptions`, `ResetOptions`, `CacheValidateOptions`
- Заменить локальные save/load token в `cli.ts` на `ConfigManager` API
- Включить `.exitOverride()`, `.showHelpAfterError()`; коды выхода через Error→ExitCode маппинг

## 7. Queue/RateLimit Reuse
- Все сетевые вызовы через единый клиент (простой адаптер) + `IntelligentRateLimitQueueManager`
- Убрать ручной `setTimeout`/задержки в `cache:validate`

## 8. Reporting/Help/Docs
- Генерация справки/примеров остаётся, но сообщения идут через Logger
- Добавить `--json` для структурированного вывода в ключевых командах

## Backward Compatibility
- Никаких изменений внешнего поведения: флаги/формат сообщений сохраняем (при JSON — opt-in)
- Депрекейшены через `DeprecatedFlagError` с единым механизмом подсказок

## Acceptance Hooks
- Добавить snapshot‑тесты help/ошибок для CLI
- Контрактные тесты для ToC/anchor на базе `AnchorGenerator`
