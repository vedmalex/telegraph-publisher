# Technical Specification: Add Content Hash Backfilling for Published Dependencies

**ID Задачи:** `FEAT-HASH-BACKFILL-001`
**Дата:** `2025-08-04`
**Автор:** `External Agent (Technical Specs)`
**Статус:** `Готово к реализации`

## 1. Описание проблемы

Система публикации зависимостей в настоящее время обрабатывает только неопубликованные файлы. Если зависимость уже была опубликована до внедрения системы `contentHash`, она никогда не получит этот хеш, и функция "пропускать неизмененные файлы" для нее работать не будет.

## 2. Анализ первопричины

Ошибка находится в методе `publishDependencies` класса `EnhancedTelegraphPublisher` (`src/publisher/EnhancedTelegraphPublisher.ts`). Текущая логика получает список только неопубликованных файлов (`filesToPublish`) и итерирует по нему. Это полностью исключает из рассмотрения уже опубликованные файлы, даже если им требуется обновление метаданных (добавление `contentHash`).

## 3. Предлагаемое решение

Необходимо изменить логику `publishDependencies`, чтобы она проходила по **всем** файлам в дереве зависимостей в правильном порядке. Для каждого файла нужно проверять его статус и, если он `PUBLISHED`, дополнительно проверять наличие `contentHash`. Если хеш отсутствует, следует принудительно запустить процесс редактирования (`editWithMetadata`) для этого файла.

## 4. Детали реализации

**Файл для модификации:** `src/publisher/EnhancedTelegraphPublisher.ts`
**Метод для модификации:** `publishDependencies`

Логика внутри метода должна быть переработана для итерации по `analysis.publishOrder`, который содержит все файлы в правильном порядке для публикации.

### Код — До изменений (упрощенно):
```typescript
// в src/publisher/EnhancedTelegraphPublisher.ts -> publishDependencies

// ... (код для построения дерева зависимостей) ...

// Get files that need to be published
const filesToPublish = this.dependencyManager.getFilesToPublish(dependencyTree);

if (filesToPublish.length === 0) {
  return { success: true, publishedFiles: [] };
}

// Publish files in dependency order
for (const fileToPublish of analysis.publishOrder) {
  // THIS LOOP ONLY CONSIDERS UNPUBLISHED FILES
  if (filesToPublish.includes(fileToPublish) && fileToPublish !== filePath) {
    const result = await this.publishWithMetadata(fileToPublish, username, {
      withDependencies: false, // Avoid infinite recursion
      dryRun
    });
    // ... (обработка результата)
  }
}
// ...
```

### Код — После изменений:
```typescript
// в src/publisher/EnhancedTelegraphPublisher.ts -> publishDependencies

// ... (код для построения дерева зависимостей и анализа) ...
const publishedFiles: string[] = [];

// NEW: Iterate through ALL files in the correct dependency order
for (const fileToProcess of analysis.publishOrder) {
  // Skip the root file, it will be handled by the calling function
  if (fileToProcess === filePath) continue;

  const status = MetadataManager.getPublicationStatus(fileToProcess);

  if (status === PublicationStatus.NOT_PUBLISHED) {
    // EXISTING LOGIC: Publish new files
    const result = await this.publishWithMetadata(fileToProcess, username, {
      withDependencies: false, // Avoid recursion
      dryRun
    });

    if (result.success) {
      publishedFiles.push(fileToProcess);
    } else {
      return { success: false, error: `Failed to publish dependency ${fileToProcess}: ${result.error}`, publishedFiles };
    }
  } else if (status === PublicationStatus.PUBLISHED) {
    // NEW LOGIC: Check for missing contentHash and update if needed
    const metadata = MetadataManager.getPublicationInfo(fileToProcess);
    if (metadata && !metadata.contentHash) {
      ProgressIndicator.showStatus(`Updating ${basename(fileToProcess)} to add content hash...`, "info");
      
      // Force an edit operation to backfill the content hash
      const result = await this.editWithMetadata(fileToProcess, username, {
        withDependencies: false,
        dryRun,
        forceRepublish: true // Use force to bypass the normal hash check
      });

      if (result.success) {
        publishedFiles.push(fileToProcess); // Consider it "published" in this run
      } else {
        return { success: false, error: `Failed to update dependency ${fileToProcess} with hash: ${result.error}`, publishedFiles };
      }
    }
  }
}

return { success: true, publishedFiles };
// ...
```

## 5. Критерии приемки

1. При запуске `publish` для файла `A.md`, который ссылается на файл `B.md`.
2. Файл `B.md` уже имеет метаданные о публикации, но **без** поля `contentHash`.
3. Система должна автоматически запустить `editWithMetadata` для файла `B.md`.
4. После завершения операции в файле `B.md` должно появиться поле `contentHash` в YAML front-matter.
5. Если у файла `B.md` уже был `contentHash`, и его содержимое не изменилось, он должен быть пропущен, как и раньше.
6. Новые, неопубликованные зависимости должны публиковаться, как и раньше.

## 6. План тестирования

1. **Расширить unit-тесты** в `src/publisher/EnhancedTelegraphPublisher.test.ts`.
2. **Создать новый тестовый сценарий:**
   - Создать `root.md` (неопубликованный).
   - Создать `dep1.md` (опубликован, **БЕЗ** `contentHash` в метаданных).
   - Создать `dep2.md` (опубликован, **С** `contentHash`, содержимое не менялось).
   - `root.md` должен ссылаться на `dep1.md` и `dep2.md`.
3. **Замокать (mock) API вызовы:**
   - Замокать `publishWithMetadata` и `editWithMetadata`.
4. **Вызвать** `publisher.publishDependencies('root.md', ...)`.
5. **Проверить (Assert):**
   - `editWithMetadata` должен быть вызван для `dep1.md` с опцией `{ forceRepublish: true }`.
   - `publishWithMetadata` и `editWithMetadata` **не** должны быть вызваны для `dep2.md`.

## 7. Технические ограничения

- Изменения должны быть обратно совместимы
- Не должны нарушать существующую логику публикации
- Должны корректно обрабатывать ошибки сети и API
- Должны поддерживать режим dry-run

## 8. Влияние на производительность

- Минимальное влияние: добавляется только проверка метаданных для уже опубликованных файлов
- Операция backfill выполняется только один раз для каждого файла
- После добавления contentHash файлы будут обрабатываться быстрее за счет пропуска неизмененных