# Техническая спецификация: Автоматизация конфигурации и интеллектуальное кэширование

**Цель:** Модифицировать рабочий процесс публикации (`publish`) для автоматического сохранения/обновления файла конфигурации и для проактивного создания/обновления кэшей (якорей и страниц) на основе изменений в контенте.

## 1. Автоматическое сохранение конфигурации при публикации

**Задача:** Любые параметры, переданные через командную строку в команду `publish` и относящиеся к конфигурации, должны быть автоматически сохранены в файл `.telegraph-publisher-config.json`.

### Шаг 1.1: Модификация логики обработки команды `publish`

**Файл для изменения:** `src/cli/EnhancedCommands.ts`
**Метод для изменения:** `handleUnifiedPublishCommand(options: any)`

**Логика:**
Перед созданием экземпляра `PublicationWorkflowManager` необходимо реализовать следующий алгоритм:

1.  **Загрузить существующую конфигурацию:** Получить текущую конфигурацию из файла `.telegraph-publisher-config.json` с помощью `ConfigManager.getMetadataConfig()`.
2.  **Сформировать объект обновлений:** Создать новый объект, содержащий только те параметры из `options`, которые должны быть сохранены в конфигурацию.
3.  **Объединить конфигурации:** Создать финальный объект конфигурации, объединив конфигурацию по умолчанию, существующую конфигурацию и параметры из командной строки. Параметры из командной строки имеют наивысший приоритет.
4.  **Сохранить новую конфигурацию:** Вызвать `ConfigManager.updateMetadataConfig()` для сохранения объединенной конфигурации в файл.
5.  **Передать финальную конфигурацию:** Передать объединенный объект конфигурации в конструктор `PublicationWorkflowManager`, чтобы текущая операция использовала актуальные настройки.

**Пример реализации (псевдокод для `handleUnifiedPublishCommand`):**

```typescript
// src/cli/EnhancedCommands.ts -> handleUnifiedPublishCommand

// ... (начало метода)

const fileDirectory = options.file ? dirname(resolve(options.file)) : process.cwd();

// 1. Загрузка существующей и стандартной конфигурации
const existingConfig = ConfigManager.getMetadataConfig(fileDirectory);

// 2. Формирование объекта обновлений из опций CLI
const updatesFromCli: Partial<MetadataConfig> = {};
if (options.author) {
    updatesFromCli.defaultUsername = options.author;
}
// Добавить другие релевантные опции: tocTitle, и т.д.

// 3. Объединение конфигураций (CLI опции имеют приоритет)
const finalConfig: MetadataConfig = {
    ...existingConfig,
    ...updatesFromCli
};

// 4. Сохранение полной, объединенной конфигурации
ConfigManager.updateMetadataConfig(fileDirectory, finalConfig);

// Загрузка токена (также может быть обновлена)
const accessToken = options.token || ConfigManager.loadAccessToken(fileDirectory);
if (options.token) {
    ConfigManager.saveAccessToken(fileDirectory, options.token);
}

if (!accessToken) {
    throw new Error("Access token is required...");
}

// 5. Передача финальной конфигурации в workflow
const workflowManager = new PublicationWorkflowManager(finalConfig, accessToken);

// ... (дальнейшая логика метода)
```

### Шаг 1.2: Обеспечение сохранения полной конфигурации

**Файл для изменения:** `src/config/ConfigManager.ts`
**Метод для изменения:** `updateMetadataConfig(directory: string, metadataConfig: Partial<MetadataConfig>)`

**Логика:**
Метод `saveConfig`, вызываемый из `updateMetadataConfig`, уже корректно объединяет существующую и новую конфигурации. Необходимо убедиться, что он сохраняет **все** поля, а не только обновленные. Текущая реализация `saveConfig` уже делает это правильно: `const mergedConfig = { ...existingConfig, ...config };`. Никаких изменений в `ConfigManager` не требуется, но важно правильно использовать его в `EnhancedCommands`.

## 2. Проактивное и интеллектуальное управление кэшем

**Задача:** Кэши (`.telegraph-anchors-cache.json` и `.telegraph-pages-cache.json`) должны всегда проверяться при запуске `publish`. Они должны создаваться, если отсутствуют, и обновляться только при изменении контента соответствующего файла.

### Шаг 2.1: Добавление `contentHash` в кэш страниц

**Файл для изменения:** `src/types/metadata.ts`
**Интерфейс для изменения:** `PublishedPageInfo`

**Логика:**
Для интеллектуального обновления кэша страниц необходимо отслеживать изменения в файлах. Добавим поле `contentHash` в интерфейс `PublishedPageInfo`.

**Изменение:**

```typescript
// src/types/metadata.ts

export interface PublishedPageInfo {
  // ... (существующие поля)
  views?: number;
  localFilePath?: string;
  contentHash?: string; // <-- ДОБАВИТЬ ЭТО ПОЛЕ
}
```

### Шаг 2.2: Модификация рабочего процесса для проактивного управления кэшем

**Файл для изменения:** `src/workflow/PublicationWorkflowManager.ts`
**Метод для изменения:** `publish(targetPath: string, options: any)`

**Логика:**
В самом начале метода `publish` необходимо добавить логику для инициализации и проверки кэшей для всех файлов, которые будут обработаны.

**Пример реализации (псевдокод для `publish`):**

```typescript
// src/workflow/PublicationWorkflowManager.ts -> publish

public async publish(targetPath: string, options: any): Promise<void> {
    // ... (логика определения filesToProcess)

    // НОВЫЙ ШАГ: Проактивная инициализация и проверка кэшей
    await this.initializeAndValidateCaches(filesToProcess);

    // ... (дальнейшая логика верификации ссылок и публикации)
}
```

### Шаг 2.3: Реализация `initializeAndValidateCaches`

**Файл для изменения:** `src/workflow/PublicationWorkflowManager.ts`
**Новый метод:** `initializeAndValidateCaches(filesToProcess: string[])`

**Логика:**
Этот новый приватный метод будет выполнять итерацию по всем файлам для обработки и выполнять следующие действия для каждого:

1.  **Кэш якорей (`AnchorCacheManager`):**
    *   Прочитать содержимое файла и вычислить его `contentHash`.
    *   Проверить `AnchorCacheManager`, действителен ли кэш для этого файла с текущим хэшем.
    *   Если кэш недействителен (или отсутствует), принудительно обновить его: прочитать файл, извлечь якоря и сохранить в кэш. Это "прогреет" кэш перед тем, как `LinkVerifier` его использует.
2.  **Кэш страниц (`PagesCacheManager`):**
    *   Убедиться, что `PagesCacheManager` инициализирован.
    *   Проверить, есть ли файл в кэше страниц.
    *   Если файл есть в кэше, сравнить текущий `contentHash` файла с `contentHash` из кэша.
    *   *Примечание:* Логика обновления кэша страниц после публикации останется в `EnhancedTelegraphPublisher`, но теперь она должна будет обновлять и `contentHash`.

**Пример реализации (псевдокод):**

```typescript
// src/workflow/PublicationWorkflowManager.ts

private async initializeAndValidateCaches(filesToProcess: string[]): Promise<void> {
    ProgressIndicator.showStatus("🔎 Initializing and validating caches...", "info");

    // Убедиться, что менеджеры кэша инициализированы для правильной директории
    const projectRoot = this.pathResolver.findProjectRoot(filesToProcess[0] || process.cwd());
    this.linkVerifier = new LinkVerifier(this.pathResolver, projectRoot);
    // this.publisher.initializeCacheManager(filesToProcess[0]); // Логика уже должна быть на месте

    for (const filePath of filesToProcess) {
        try {
            const content = readFileSync(filePath, 'utf-8');
            const contentWithoutMetadata = MetadataManager.removeMetadata(content);
            const currentHash = ContentProcessor.calculateContentHash(contentWithoutMetadata);

            // 1. Проверка и обновление кэша якорей
            // LinkVerifier сделает это автоматически при первом доступе,
            // поэтому явный вызов здесь не обязателен, но можно добавить для надежности.
            // this.linkVerifier.getAnchorsForFile(filePath); // Это вызовет логику кэширования

            // 2. Проверка кэша страниц (логика для будущего использования, т.к. обновление происходит после публикации)
            const pageInfo = this.publisher.getCacheManager()?.getPageByLocalPath(filePath);
            if (pageInfo && pageInfo.contentHash !== currentHash) {
                ProgressIndicator.showStatus(`ℹ️  Content of '${basename(filePath)}' has changed, will be republished.`, "info");
            }

        } catch (error) {
            ProgressIndicator.showStatus(`⚠️ Could not process cache for ${basename(filePath)}`, "warning");
        }
    }

    // Сохраняем кэш якорей после всех обновлений
    this.linkVerifier.getAnchorCacheManager()?.saveCache();
}
```

### Шаг 2.4: Обновление `contentHash` в кэше страниц после публикации

**Файл для изменения:** `src/publisher/EnhancedTelegraphPublisher.ts`
**Методы для изменения:** `publishWithMetadata` и `editWithMetadata`

**Логика:**
При создании или обновлении метаданных файла после успешной публикации, необходимо также сохранять `contentHash` в `PagesCacheManager`.

**Изменения в `publishWithMetadata`:**

```typescript
// src/publisher/EnhancedTelegraphPublisher.ts -> publishWithMetadata

// ... (после успешной публикации и создания metadata)
const metadata = MetadataManager.createMetadata(
    page.url,
    page.path,
    username,
    filePath,
    contentHash, // <-- contentHash уже вычисляется
    metadataTitle
);

// ... (после записи метаданных в файл)

// Обновляем addToCache для передачи contentHash
this.addToCache(filePath, page.url, page.path, metadataTitle, username, contentHash);
```

**Изменения в `editWithMetadata`:**

```typescript
// src/publisher/EnhancedTelegraphPublisher.ts -> editWithMetadata

// ... (после успешного редактирования)
const updatedContentHash = this.calculateContentHash(processed.contentWithoutMetadata);

const updatedMetadata: FileMetadata = {
    ...existingMetadata,
    publishedAt: new Date().toISOString(),
    title: metadataTitle,
    contentHash: updatedContentHash // <-- Обновленный хэш
};

// ... (после записи метаданных в файл)

if (this.cacheManager) {
    this.cacheManager.updatePage(page.url, {
        title: metadataTitle,
        authorName: username,
        lastUpdated: new Date().toISOString(),
        contentHash: updatedContentHash // <-- ДОБАВИТЬ ОБНОВЛЕНИЕ ХЭША В КЭШ
    });
}
```

**Изменения в `addToCache` и `PagesCacheManager`:**
Необходимо обновить сигнатуру метода `addToCache` и `addPage`, чтобы они принимали `contentHash`.

## Итоговый рабочий процесс (Workflow Summary)

1.  Пользователь запускает `telegraph-publisher publish [path] --author "New Author"`.
2.  **`EnhancedCommands`:**
    *   Загружает существующий `.telegraph-publisher-config.json`.
    *   Объединяет его с `defaultUsername: "New Author"`.
    *   Сохраняет новый, полный `.telegraph-publisher-config.json`.
    *   Создает `PublicationWorkflowManager` с этой новой конфигурацией.
3.  **`PublicationWorkflowManager`:**
    *   Определяет список файлов для обработки (`filesToProcess`).
    *   **(Новое)** Вызывает `initializeAndValidateCaches`, который "прогревает" кэш якорей для всех файлов.
    *   Запускает `LinkVerifier`, который теперь использует уже актуальный кэш якорей.
    *   После верификации, для каждого файла вызывает `publisher.publishWithMetadata` или `editWithMetadata`.
4.  **`EnhancedTelegraphPublisher`:**
    *   Вычисляет `contentHash` для файла.
    *   Сравнивает с хэшем в метаданных (если есть). Если хэши совпадают и `force` флаг не установлен, пропускает публикацию.
    *   После успешной публикации/редактирования:
        *   Обновляет метаданные в `.md` файле, включая новый `contentHash`.
        *   Обновляет `PagesCacheManager`, добавляя или обновляя запись о странице, включая `contentHash`.
5.  **`PagesCacheManager` и `AnchorCacheManager`:**
    *   Автоматически сохраняют свои обновленные состояния в `.json` файлы.

## Критерии приемки

*   ✅ При запуске `publish --author "Новое Имя"` файл `.telegraph-publisher-config.json` создается или обновляется, и поле `defaultUsername` устанавливается в "Новое Имя".
*   ✅ При запуске `publish` для директории, файлы `.telegraph-anchors-cache.json` и `.telegraph-pages-cache.json` создаются в этой директории, если они отсутствовали.
*   ✅ При повторном запуске `publish` для файла с неизмененным контентом, `EnhancedTelegraphPublisher` пропускает сетевой вызов (сообщение "Content unchanged").
*   ✅ После изменения `.md` файла и повторного запуска `publish`, `EnhancedTelegraphPublisher` выполняет сетевой вызов для обновления страницы.
*   ✅ После публикации, `contentHash` присутствует как в метаданных `.md` файла, так и в записи `.telegraph-pages-cache.json` для этого файла. 