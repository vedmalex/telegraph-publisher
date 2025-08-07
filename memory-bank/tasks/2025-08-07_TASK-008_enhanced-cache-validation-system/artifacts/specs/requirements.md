# Technical Specification: Enhanced Cache Validation System

**Version:** 1.0  
**Date:** 2025-08-07  
**Task:** `enhanced-cache-validation-system`

## 1. Executive Summary

Данная спецификация описывает реализацию трех новых функций для улучшения надежности и интеллектуальности системы публикации Telegraph Publisher:

1. **CLI команда `cache:validate`**: Инструмент для проверки целостности кэша страниц
2. **Персистентность карты ссылок зависимостей**: Сохранение link mappings в YAML front-matter
3. **Определение изменений на основе зависимостей**: Модификация логики обнаружения изменений

## 2. Feature 1: Cache Validation Command (`cache:validate`)

### 2.1. Purpose
Предоставить пользователям инструмент для диагностики и проверки целостности кэша опубликованных страниц (`.telegraph-pages-cache.json`). Команда должна выявлять "мертвые" записи в кэше.

### 2.2. CLI Definition
Команду необходимо добавить в `src/cli/EnhancedCommands.ts`:

```typescript
program
  .command("cache:validate")
  .description("Validate the integrity of the pages cache")
  .option("--fix", "Attempt to automatically remove invalid entries from the cache")
  .action(async (options) => {
    try {
      await EnhancedCommands.handleCacheValidateCommand(options);
    } catch (error) {
      // Error handling
    }
  });
```

### 2.3. Implementation Logic (`handleCacheValidateCommand`)

**Input Parameters:**
- `options.fix?: boolean` - флаг для автоматического исправления

**Algorithm:**
1. **Найти и загрузить кэш**: Найти `.telegraph-pages-cache.json`, начиная с текущей директории
2. **Инициализировать отчет**: Создать структуры для `invalidEntries`, `validEntriesCount`
3. **Итерировать по записям кэша**: Пройти по всем страницам в `cache.pages`
4. **Выполнить проверки**:
   - **Проверка локального файла**: `fs.existsSync(localFilePath)`
   - **Проверка удаленной страницы**: API-запрос `getPage(page.path)` с rate limiting
5. **Сформировать отчет**: Вывести статистику и таблицу невалидных записей
6. **Опциональное исправление**: При `--fix` удалить невалидные записи после подтверждения

**Error Handling:**
- `LOCAL_FILE_NOT_FOUND` - локальный файл не существует
- `REMOTE_PAGE_NOT_FOUND` - страница не найдена на Telegra.ph
- API rate limiting с соответствующими задержками

### 2.4. Expected Output
```
🔎 Validating pages cache...
✅ Found 150 entries.

❌ Found 2 invalid entries:

| Local File Path             | Telegraph URL                           | Reason                |
|-----------------------------|-----------------------------------------|-----------------------|
| /path/to/deleted-doc.md     | https://telegra.ph/Deleted-Doc-01-01    | LOCAL_FILE_NOT_FOUND  |
| /path/to/another-doc.md     | https://telegra.ph/Page-Not-Found-01-02 | REMOTE_PAGE_NOT_FOUND |

📊 Validation complete. Valid entries: 148, Invalid entries: 2.
💡 To automatically remove invalid entries, run with the --fix flag.
```

### 2.5. Acceptance Criteria
- ✅ Новая команда `cache:validate` доступна в CLI
- ✅ Команда корректно считывает и итерирует кэш-файл
- ✅ Проверяет существование локальных файлов и удаленных страниц
- ✅ Выводит понятный отчет о результатах валидации
- ✅ Опция `--fix` корректно удаляет невалидные записи после подтверждения

## 3. Feature 2: Link Mappings in Front Matter

### 3.1. Purpose
Сделать каждый публикуемый файл более самодостаточным, сохраняя информацию о его опубликованных зависимостях непосредственно в его метаданных.

### 3.2. Data Model Changes
Обновить интерфейс `FileMetadata` в `src/types/metadata.ts`:

```typescript
export interface FileMetadata {
  // ... existing fields
  
  /**
   * Map of published dependencies for this file.
   * @format {'local/relative/path.md': 'https://telegra.ph/published-url-01-01'}
   */
  publishedDependencies?: Record<string, string>;
}
```

### 3.3. Implementation Strategy

**Changes in `src/publisher/EnhancedTelegraphPublisher.ts`:**

1. **Collect Link Mappings**:
   - В `publishDependencies` собрать `linkMappings` (`Map<string, string>`)
   - Преобразовать абсолютные пути в относительные пути из исходного файла

2. **Return Link Mappings**:
   - `publishDependencies` должен возвращать собранную карту ссылок
   - `publishWithMetadata` и `editWithMetadata` принимают эту карту

3. **Inject into Metadata**:
   - После успешной публикации добавить `publishedDependencies` в `metadata`
   - Перед сериализацией и записью в файл

4. **Update MetadataManager**:
   - В `src/metadata/MetadataManager.ts` обновить `parseMetadata` и `serializeMetadata`
   - Корректная обработка объекта `publishedDependencies`

### 3.4. Example Front Matter Output
```yaml
---
telegraphUrl: "https://telegra.ph/Root-File-08-07"
editPath: "Root-File-08-07"
username: "test-user"
publishedAt: "2025-08-07T12:54:00.000Z"
originalFilename: "root.md"
contentHash: "a1b2c3d4..."
publishedDependencies:
  ./dependency1.md: "https://telegra.ph/Dependency-1-08-07"
  ../docs/dependency2.md: "https://telegra.ph/Dependency-2-08-07"
---

# Root File Content
```

### 3.5. Acceptance Criteria
- ✅ Интерфейс `FileMetadata` включает поле `publishedDependencies`
- ✅ После публикации front-matter содержит корректные относительные пути и URL
- ✅ `MetadataManager` корректно читает и записывает поле `publishedDependencies`
- ✅ При отсутствии зависимостей поле `publishedDependencies` отсутствует

## 4. Feature 3: Dependency-Based Change Detection

### 4.1. Purpose
Повысить интеллект системы определения изменений. Файл должен быть переопубликован при изменении состояния его зависимостей.

### 4.2. Algorithm Design

**New Private Method `_haveDependenciesChanged`:**

**Input Parameters:**
- `filePath: string` - путь к проверяемому файлу
- `existingMetadata: FileMetadata` - существующие метаданные файла

**Algorithm Steps:**
1. **Check Stored Dependencies**: Проверить наличие `existingMetadata.publishedDependencies`
2. **Scan Current Content**: Получить актуальный список локальных ссылок через `ContentProcessor.processFile`
3. **Initialize Cache Manager**: Доступ к глобальному кэшу URL через `PagesCacheManager`
4. **Build Fresh Dependencies Map**: Создать "свежую" карту зависимостей
5. **Compare Dependencies**:
   - Сравнить количество ключей
   - Проверить совпадение URL для каждого локального пути
6. **Return Result**: `true` если есть расхождения, `false` если нет

### 4.3. Integration Strategy

**Changes in `editWithMetadata`:**
- В начале метода, после получения `existingMetadata`
- Вызвать `_haveDependenciesChanged`
- При возврате `true` установить `forceRepublish = true`
- Добавить информативное сообщение в лог
- Продолжить стандартную логику публикации

### 4.4. Example Implementation
```typescript
private _haveDependenciesChanged(filePath: string, existingMetadata: FileMetadata): boolean {
  const storedDependencies = existingMetadata.publishedDependencies;
  if (!storedDependencies || Object.keys(storedDependencies).length === 0) {
    return false; // No stored dependencies to compare
  }

  this.initializeCacheManager(filePath);
  if (!this.cacheManager) {
    return false; // Cannot check without cache
  }

  const processed = ContentProcessor.processFile(filePath);
  const currentLocalLinks = processed.localLinks;

  if (Object.keys(storedDependencies).length !== currentLocalLinks.length) {
    ProgressIndicator.showStatus(`Dependency change detected: number of links changed.`, "info");
    return true;
  }

  for (const link of currentLocalLinks) {
    const storedUrl = storedDependencies[link.originalPath];
    const currentUrl = this.cacheManager.getTelegraUrl(link.resolvedPath);

    if (!storedUrl || storedUrl !== currentUrl) {
      ProgressIndicator.showStatus(`Dependency change detected: URL for '${link.originalPath}' has changed.`, "info");
      return true;
    }
  }

  return false;
}
```

### 4.5. Acceptance Criteria
- ✅ Файл переопубликовывается при изменении URL зависимостей в глобальном кэше
- ✅ Файл переопубликовывается при добавлении/удалении локальных ссылок
- ✅ При отсутствии изменений зависимостей и хэша публикация пропускается
- ✅ Логика инкапсулирована в отдельном методе
- ✅ Информативные сообщения о причине перепубликации в логе

## 5. Testing Strategy

### 5.1. Unit Tests
- **Cache Validation**: Тестирование логики нахождения невалидных записей
- **MetadataManager**: Сериализация/десериализация `publishedDependencies`
- **Dependency Change Detection**: Все сценарии сравнения зависимостей

### 5.2. Integration Tests
- **Scenario 1**: Публикация связанных файлов с проверкой `publishedDependencies`
- **Scenario 2**: Перепубликация зависимости и автоматическое обновление родительского файла
- **Scenario 3**: Валидация кэша до и после удаления файлов/страниц

### 5.3. Test Data Requirements
- Тестовый проект из 3-4 связанных файлов
- Mock API responses для Telegra.ph
- Тестовые кэш-файлы с валидными и невалидными записями

## 6. Implementation Priority

1. **Phase 1**: Cache validation command implementation
2. **Phase 2**: Link mappings in front matter
3. **Phase 3**: Dependency-based change detection
4. **Phase 4**: Integration testing and documentation

## 7. Dependencies and Prerequisites

- Existing `PagesCacheManager` functionality
- `MetadataManager` for front-matter handling
- `ContentProcessor` for link analysis
- Telegraph API for page validation
- Commander.js for CLI commands (per user memory)

## 8. Risk Assessment

- **API Rate Limiting**: Telegraph API limits для validation команды
- **Performance Impact**: Overhead от проверки зависимостей при каждой публикации
- **Backward Compatibility**: Обеспечить работу с существующими метаданными

## 9. Success Metrics

- ✅ 100% функциональность cache validation с корректными результатами
- ✅ Корректное сохранение и чтение link mappings в 100% случаев
- ✅ Точное обнаружение изменений зависимостей в 100% случаев
- ✅ Zero breaking changes для существующих пользователей
- ✅ Comprehensive test coverage (85%+ для новых компонентов) 