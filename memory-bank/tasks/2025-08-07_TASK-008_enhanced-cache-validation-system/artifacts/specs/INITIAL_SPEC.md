нужна команда валидации кэша и проверки кэша, необходимы будет проверять наличие страницы по указанному адресу и наличие файла по указанному пути

нужно при публикации файла, записывать linkMapping выполненный при публикации во front-matter - когда публикуется страница то файлы публикуются и эта информация записывается в кэш, теперь необходимо записывать ее же и в front-matter публикуемого файла

когда выполняется проверка файла на изменение, необходимо учитывать так-же изменение этих ссылок, если в общем кэше ссылки изменились, или появились новые, то необходимо считать что этот файл требует обновления на сервере

давай составим техническую спецификацию на эти задачи

-

1.  **Команда для валидации кэша**: Новый инструмент для проверки целостности кэша опубликованных страниц.
2.  **Сохранение карты ссылок (Link Mappings) во Front Matter**: Встраивание информации об опубликованных зависимостях непосредственно в метаданные файла.
3.  **Улучшенный механизм определения изменений**: Файл должен считаться измененным, если его зависимости (ссылки) изменились, даже если сам контент файла остался прежним.

Это комплексная задача, которую я разложил на три независимых, но связанных подзадачи. Ниже представлена подробная техническая спецификация для их реализации.

Я создам новую задачу в `memory-bank` для отслеживания этой работы.

**Task Created: `feature-enhanced-cache-and-change-detection`**

---

### `technical-specification.md`

# Техническая спецификация: Улучшенное кэширование и определение изменений зависимостей

**Версия:** 1.0
**Дата:** 2024-08-08
**Задача:** `feature-enhanced-cache-and-change-detection`

## 1. Обзор

Данная спецификация описывает реализацию трех новых функций для улучшения надежности и интеллектуальности системы публикации:

1.  **Команда CLI `cache:validate`**: Инструмент для проверки целостности кэша страниц, выявления несоответствий между кэшем, локальной файловой системой и серверами Telegra.ph.
2.  **Персистентность карты ссылок зависимостей**: Сохранение карты `local path -> telegraphUrl` для опубликованных зависимостей непосредственно в YAML front-matter родительского файла.
3.  **Определение изменений на основе зависимостей**: Модификация логики определения изменений файла. Теперь файл будет требовать перепубликации, если изменились URL его зависимостей, даже если его собственный контент не изменился.

## 2. Задача 1: Команда валидации кэша (`cache:validate`)

### 2.1. Цель

Предоставить пользователям инструмент для диагностики и проверки целостности кэша опубликованных страниц (`.telegraph-pages-cache.json`). Команда должна выявлять "мертвые" записи в кэше, где либо локальный файл, либо удаленная страница Telegra.ph больше не существуют.

### 2.2. Определение команды CLI

Команду необходимо добавить в `src/cli/EnhancedCommands.ts`.

```typescript
// в EnhancedCommands.ts
program
  .command("cache:validate")
  .description("Validate the integrity of the pages cache")
  .option("--fix", "Attempt to automatically remove invalid entries from the cache")
  .action(async (options) => {
    try {
      await EnhancedCommands.handleCacheValidateCommand(options);
    } catch (error) {
      // ... обработка ошибок
    }
  });
```

### 2.3. Логика реализации (`handleCacheValidateCommand`)

Метод должен быть реализован в `src/cli/EnhancedCommands.ts`.

1.  **Найти и загрузить кэш**: Найти файл `.telegraph-pages-cache.json`, начиная с текущей директории и двигаясь вверх по дереву каталогов. Использовать `PagesCacheManager` для загрузки.
2.  **Инициализировать отчет**: Создать объекты для хранения результатов: `invalidEntries`, `validEntriesCount`.
3.  **Итерировать по записям кэша**: Пройти по всем страницам в `cache.pages`.
4.  **Выполнить проверки для каждой записи**:
    *   **Проверка локального файла**: Если `localFilePath` указан, проверить его существование с помощью `fs.existsSync()`. Если файл не найден, пометить запись как невалидную (причина: `LOCAL_FILE_NOT_FOUND`).
    *   **Проверка удаленной страницы**: Выполнить API-запрос `getPage(page.path)` к Telegra.ph.
        *   Если `getPage` возвращает ошибку (например, `PAGE_NOT_FOUND`), пометить запись как невалидную (причина: `REMOTE_PAGE_NOT_FOUND`).
        *   **Важно**: Учитывать `rate limiting`. API-запросы должны выполняться с задержкой, чтобы не превысить лимиты Telegra.ph.
5.  **Сформировать и вывести отчет**:
    *   Вывести в консоль сводную статистику (всего записей, валидных, невалидных).
    *   Если найдены невалидные записи, вывести их в виде таблицы с указанием `localFilePath`, `telegraphUrl` и причины невалидности.
6.  **(Опционально) Реализовать исправление (`--fix`)**:
    *   Если указан флаг `--fix`, после отчета спросить у пользователя подтверждение на удаление невалидных записей.
    *   При подтверждении, вызвать метод `cacheManager.removePage(url)` для каждой невалидной записи.
    *   Сохранить обновленный кэш с помощью `cacheManager.saveCache()`.

### 2.4. Пример вывода в консоль

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

### 2.5. Критерии приемки

*   ✅ Новая команда `cache:validate` доступна в CLI.
*   ✅ Команда корректно считывает и итерирует кэш-файл.
*   ✅ Команда проверяет существование локальных файлов и удаленных страниц.
*   ✅ В консоль выводится понятный отчет о результатах валидации.
*   ✅ Опция `--fix` корректно удаляет невалидные записи из кэша после подтверждения.

## 3. Задача 2: Сохранение карты зависимостей во Front Matter

### 3.1. Цель

Сделать каждый публикуемый файл более самодостаточным, сохраняя информацию о его опубликованных зависимостях непосредственно в его метаданных. Это устраняет полную зависимость от внешнего файла кэша для определения состояния зависимостей на момент публикации.

### 3.2. Изменение модели данных

Необходимо обновить интерфейс `FileMetadata` в `src/types/metadata.ts`.

```typescript
// в src/types/metadata.ts
export interface FileMetadata {
  // ... существующие поля
  
  /**
   * Map of published dependencies for this file.
   * @format {'local/relative/path.md': 'https://telegra.ph/published-url-01-01'}
   */
  publishedDependencies?: Record<string, string>;
}
```

### 3.3. Логика реализации

Изменения в основном коснутся `src/publisher/EnhancedTelegraphPublisher.ts`.

1.  **Сбор карты ссылок**:
    *   В методе `publishDependencies` уже существует логика, которая собирает `linkMappings` (`Map<string, string>`). Этот объект содержит карту `resolvedPath -> telegraphUrl`.
    *   Необходимо преобразовать абсолютные пути (`resolvedPath`) в относительные, как они указаны в исходном файле (`originalPath`).
2.  **Передача карты ссылок**:
    *   Метод `publishDependencies` должен возвращать собранную карту ссылок (`publishedDependencies`).
    *   Методы `publishWithMetadata` и `editWithMetadata` должны принимать эту карту.
3.  **Инъекция в метаданные**:
    *   В `publishWithMetadata` и `editWithMetadata`, после успешной публикации основного файла и его зависимостей, необходимо добавить карту `publishedDependencies` в объект `metadata` перед его сериализацией и записью в файл.
4.  **Обновление `MetadataManager`**:
    *   В `src/metadata/MetadataManager.ts` необходимо обновить методы `parseMetadata` и `serializeMetadata` для корректной обработки нового поля `publishedDependencies` (которое является объектом).

#### Пример итогового Front Matter:

```yaml
---
telegraphUrl: "https://telegra.ph/Root-File-08-08"
editPath: "Root-File-08-08"
username: "test-user"
publishedAt: "2024-08-08T10:00:00.000Z"
originalFilename: "root.md"
contentHash: "a1b2c3d4..."
publishedDependencies:
  ./dependency1.md: "https://telegra.ph/Dependency-1-08-08"
  ../docs/dependency2.md: "https://telegra.ph/Dependency-2-08-08"
---

# Root File
```

### 3.4. Критерии приемки

*   ✅ Интерфейс `FileMetadata` обновлен и включает необязательное поле `publishedDependencies`.
*   ✅ После публикации файла, его front-matter содержит секцию `publishedDependencies` с корректными относительными путями и URL.
*   ✅ `MetadataManager` корректно читает и записывает поле `publishedDependencies`.
*   ✅ Если у файла нет зависимостей, поле `publishedDependencies` отсутствует в front-matter.

## 4. Задача 3: Определение изменений на основе зависимостей

### 4.1. Цель

Повысить "интеллект" системы определения изменений. Файл должен быть переопубликован не только при изменении его контента, но и при изменении состояния его зависимостей (например, если ссылка на зависимость была обновлена и теперь указывает на новый URL).

### 4.2. Алгоритм

Новая логика проверки должна быть добавлена в начало метода `editWithMetadata` в `src/publisher/EnhancedTelegraphPublisher.ts`, перед существующей проверкой `contentHash` и `mtime`.

1.  **Создать новый приватный метод `_haveDependenciesChanged`**:
    *   **Входные параметры**: `filePath: string`, `existingMetadata: FileMetadata`.
    *   **Шаг 1**: Проверить, есть ли в `existingMetadata` поле `publishedDependencies`. Если нет, изменений нет (`return false`).
    *   **Шаг 2**: Просканировать текущий контент файла `filePath` для получения актуального списка локальных ссылок (`ContentProcessor.processFile`).
    *   **Шаг 3**: Инициализировать `PagesCacheManager`, чтобы иметь доступ к глобальному кэшу URL.
    *   **Шаг 4**: Создать новую, "свежую" карту зависимостей (`freshDependencies`), итерируя по актуальным локальным ссылкам и находя их текущие URL в `PagesCacheManager`.
    *   **Шаг 5**: Сравнить `existingMetadata.publishedDependencies` с `freshDependencies`.
        *   Сравнить количество ключей.
        *   Проверить, что для каждого ключа (локального пути) в обеих картах URL совпадают.
    *   **Шаг 6**: Если есть расхождения, вернуть `true`. В противном случае — `false`.

2.  **Интеграция в `editWithMetadata`**:
    *   В начале `editWithMetadata`, после получения `existingMetadata`, вызвать `_haveDependenciesChanged`.
    *   Если метод возвращает `true`, установить флаг `forceRepublish = true` для текущей операции, добавив в лог сообщение "Dependencies have changed. Forcing republication.".
    *   Продолжить выполнение `editWithMetadata` как обычно. Существующая логика, которая проверяет `forceRepublish`, автоматически пропустит проверку хэша и времени и перейдет к публикации.

### 4.3. Пример кода для `_haveDependenciesChanged`

```typescript
// В классе EnhancedTelegraphPublisher
private _haveDependenciesChanged(filePath: string, existingMetadata: FileMetadata): boolean {
  const storedDependencies = existingMetadata.publishedDependencies;
  if (!storedDependencies || Object.keys(storedDependencies).length === 0) {
    return false; // Нет сохраненных зависимостей для сравнения
  }

  // Убедиться, что кэш-менеджер инициализирован
  this.initializeCacheManager(filePath);
  if (!this.cacheManager) {
    return false; // Невозможно проверить без кэша
  }

  const processed = ContentProcessor.processFile(filePath);
  const currentLocalLinks = processed.localLinks;

  if (Object.keys(storedDependencies).length !== currentLocalLinks.length) {
    ProgressIndicator.showStatus(`Dependency change detected in ${basename(filePath)}: number of links changed.`, "info");
    return true; // Количество ссылок изменилось
  }

  for (const link of currentLocalLinks) {
    const storedUrl = storedDependencies[link.originalPath];
    const currentUrl = this.cacheManager.getTelegraUrl(link.resolvedPath);

    if (!storedUrl || storedUrl !== currentUrl) {
      ProgressIndicator.showStatus(`Dependency change detected in ${basename(filePath)}: URL for '${link.originalPath}' has changed.`, "info");
      return true; // URL изменился или ссылка новая
    }
  }

  return false;
}
```

### 4.4. Критерии приемки

*   ✅ Файл переопубликовывается, если URL одной из его зависимостей изменился в глобальном кэше.
*   ✅ Файл переопубликовывается, если в него была добавлена новая локальная ссылка (на опубликованный файл) или удалена старая.
*   ✅ Если зависимости не изменились и хэш контента совпадает, публикация пропускается, как и раньше.
*   ✅ Логика инкапсулирована в отдельном методе для чистоты кода.
*   ✅ В лог выводятся информативные сообщения о причине перепубликации.

## 5. План тестирования

1.  **Unit-тесты**:
    *   Для `cache:validate`: протестировать логику нахождения невалидных записей.
    *   Для `MetadataManager`: проверить корректность сериализации/десериализации `publishedDependencies`.
    *   Для `_haveDependenciesChanged`: протестировать все сценарии сравнения (URL изменился, ссылка добавлена/удалена, всё без изменений).
2.  **Интеграционные тесты**:
    *   Создать тестовый проект из 3-4 связанных файлов.
    *   **Сценарий 1**: Опубликовать все файлы. Убедиться, что `publishedDependencies` корректно записаны в `root.md`.
    *   **Сценарий 2**: Переопубликовать один из файлов-зависимостей (чтобы его URL изменился). Затем запустить публикацию `root.md`. Убедиться, что `root.md` был переопубликован из-за изменения зависимости.
    *   **Сценарий 3**: Запустить `cache:validate` до и после удаления одного из локальных файлов/удаления страницы через API, чтобы проверить корректность отчета.