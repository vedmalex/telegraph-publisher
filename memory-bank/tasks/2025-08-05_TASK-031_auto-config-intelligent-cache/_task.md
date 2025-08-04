# TASK-031: Автоматическое сохранение конфигурации и интеллектуальное управление кэшем

## Metadata
- **Task ID**: TASK-031
- **Created**: 2025-08-05_00-20
- **Status**: 🟡 In Progress
- **Priority**: High
- **Estimated Complexity**: Medium-High
- **Phase**: QA

## Objective
Модифицировать рабочий процесс публикации (`publish`) для автоматического сохранения/обновления файла конфигурации и для проактивного создания/обновления кэшей (якорей и страниц) на основе изменений в контенте.

## Scope
### В области видимости:
- Автоматическое сохранение параметров CLI в файл конфигурации при публикации
- Проактивная инициализация и валидация кэшей для всех обрабатываемых файлов
- Добавление `contentHash` в кэш страниц для отслеживания изменений
- Интеллектуальное пропуск публикации для неизменившихся файлов

### Вне области видимости:
- Изменение структуры кэшей
- Модификация API Telegraph
- Изменение пользовательского интерфейса CLI

## Success Criteria
- ✅ При запуске `publish --author "Новое Имя"` файл `.telegraph-publisher-config.json` создается или обновляется
- ✅ При запуске `publish` файлы кэшей создаются в директории, если отсутствовали
- ✅ При повторном запуске `publish` для неизмененного файла происходит пропуск сетевого вызова
- ✅ После изменения `.md` файла происходит обновление страницы
- ✅ `contentHash` присутствует в метаданных и кэше страниц

## Files Affected
- `src/cli/EnhancedCommands.ts` - модификация handleUnifiedPublishCommand
- `src/workflow/PublicationWorkflowManager.ts` - добавление initializeAndValidateCaches
- `src/publisher/EnhancedTelegraphPublisher.ts` - обновление contentHash в кэше
- `src/types/metadata.ts` - добавление contentHash в PublishedPageInfo
- `src/cache/PagesCacheManager.ts` - поддержка contentHash

## Dependencies
- ConfigManager для сохранения конфигурации
- AnchorCacheManager для управления кэшем якорей
- PagesCacheManager для управления кэшем страниц
- ContentProcessor для вычисления хэшей

## Risks
- Low: Возможные конфликты с существующей логикой кэширования
- Low: Потенциальные проблемы с производительностью при обработке больших файлов
- Medium: Необходимость обеспечения обратной совместимости с существующими кэшами 