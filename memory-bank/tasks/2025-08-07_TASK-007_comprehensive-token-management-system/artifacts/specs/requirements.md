# Comprehensive Token Management System - Technical Specification

## Оптимальная Последовательность Реализации Задач

### Этап 1: Фундамент — Модели Данных и Конфигурация

Эти задачи создают основу, на которую будут опираться все остальные. Их нужно делать в первую очередь.

1. **Задача №2: Интеграция Токена в Метаданные и Кэш**
   - **Что делаем:** Расширяем интерфейсы `FileMetadata` и `PublishedPageInfo`. Учим `MetadataManager` и `PagesCacheManager` читать и записывать новое поле `accessToken`.
   - **Почему первая:** Это самое базовое изменение на уровне структур данных. Без него нельзя реализовать ни сохранение токена в файл (Задача №1), ни его чтение (Задача №3).

2. **Задача №6: Иерархическая Загрузка Конфигурации**
   - **Что делаем:** Реализуем в `ConfigManager` новый метод `loadHierarchicalConfig`, который ищет и объединяет `.telegraph-publisher-config.json` вверх по дереву каталогов.
   - **Почему вторая:** Эта задача определяет, как система получает конфигурацию по умолчанию, включая `accessToken` из конфигов. Ее нужно реализовать до того, как мы будем строить полную иерархию разрешения токенов (Задача №3), так как она предоставляет один из ключевых источников.

### Этап 2: Логика Выбора и Сохранения Токенов

Теперь, когда структуры данных и конфигурация готовы, можно реализовать основную логику работы с токенами.

3. **Задача №3: Иерархия Разрешения Токенов (Token Context Manager)**
   - **Что делаем:** Создаем метод `getEffectiveAccessToken` в `EnhancedTelegraphPublisher`, который реализует строгую иерархию выбора токена (метаданные -> кэш -> иерархический конфиг -> сессия).
   - **Почему третья:** Она напрямую зависит от Задач №2 (для чтения токена из метаданных/кэша) и №6 (для чтения из иерархической конфигурации). Это центральный "мозг" системы управления токенами.

4. **Задача №1: Добавление `accessToken` в YAML Front-Matter (Сохранение и Бэкфил)**
   - **Что делаем:** Интегрируем вызов `getEffectiveAccessToken` в `publishWithMetadata` и `editWithMetadata`. Реализуем логику сохранения токена для новых файлов и "бэкфила" для старых.
   - **Почему четвертая:** Эта задача является "замыкающей" для цикла работы с токенами. Она использует `getEffectiveAccessToken` (Задача №3) для выбора токена, а затем сохраняет его в структуры, подготовленные в Задаче №2.

### Этап 3: Продвинутая Логика Обработки Очереди

Эта задача самая сложная и зависит от уже работающей системы публикации. Ее следует выполнять последней.

5. **Задача №4: Интеллектуальный Менеджер Очереди Публикации**
   - **Что делаем:** Создаем новый класс `IntelligentRateLimitQueueManager` для управления очередью и принятия решений при `rate-limit`.
   - **Почему пятая (почти последняя):** Эта логика работает "поверх" уже существующего механизма публикации. Она перехватывает ошибки и управляет порядком вызовов, но сам вызов `publish` для каждого файла должен уже корректно работать с токенами.

6. **Задача №5: Интеграция Новой Логики в `EnhancedTelegraphPublisher`**
   - **Что делаем:** Перерабатываем `publishDependencies` для использования `IntelligentRateLimitQueueManager`. Модифицируем `publishNodes` и `editPage` для новой логики обработки `FLOOD_WAIT` и `PAGE_ACCESS_DENIED`.
   - **Почему последняя:** Это финальный шаг, который "склеивает" все вместе. Он интегрирует менеджер очереди (Задача №4) в основной рабочий процесс, который уже умеет правильно работать с токенами (благодаря задачам 1, 2, 3, 6).

## Детальные Технические Спецификации

### Задача №1: Реализация сохранения и "бэкфила" `accessToken` в метаданных файла

**Цель:** Модифицировать рабочий процесс публикации и редактирования таким образом, чтобы `accessToken`, использованный для успешной операции, сохранялся непосредственно в YAML-заголовке markdown-файла.

**Компоненты для модификации:**
- `src/publisher/EnhancedTelegraphPublisher.ts` (основная логика)
- `src/metadata/MetadataManager.ts` (вспомогательная логика)

#### 1. Ключевые Сценарии

1. **Новая Публикация:** Когда файл публикуется впервые, `accessToken`, использованный для создания страницы, должен быть немедленно сохранен в его метаданных.
2. **Обновление Существующей Страницы (Бэкфил):** Когда редактируется файл, который был опубликован ранее (до внедрения этого функционала) и **не содержит** `accessToken` в своих метаданных, система должна добавить использованный для редактирования токен в его front-matter.

#### 2. Детальная Логика Реализации

##### 2.1. Логика для Новых Публикаций

**Файл:** `src/publisher/EnhancedTelegraphPublisher.ts`
**Метод:** `publishWithMetadata(...)`

**Алгоритм:**
1. **Внутри `try` блока, после успешного вызова `this.publishNodes(...)`:**
   - К этому моменту у нас есть объект `page` (результат от API) и `effectiveToken`, который был определен логикой из Задачи №3 и использован для публикации.
2. **Вызов `MetadataManager.createMetadata(...)`:**
   - При вызове этого метода **обязательно** передать `effectiveToken` в качестве нового, последнего параметра.
3. **Запись в файл:** Дальнейшие вызовы `ContentProcessor.injectMetadataIntoContent` и `writeFileSync` автоматически запишут в файл метаданные, которые теперь содержат `accessToken`.
4. **Обновление кэша:** При вызове `this.addToCache(...)` также необходимо передать `effectiveToken`, чтобы кэш и файл были консистентны.

##### 2.2. Логика для Существующих Публикаций (Бэкфил)

**Файл:** `src/publisher/EnhancedTelegraphPublisher.ts`
**Метод:** `editWithMetadata(...)`

**Алгоритм:**
1. **В начале метода:** Загрузить существующие метаданные: `const existingMetadata = MetadataManager.getPublicationInfo(filePath);`.
2. **После успешного вызова `this.editPage(...)`:** К этому моменту у нас есть `effectiveToken`, который был использован для успешного редактирования.
3. **Проверка на необходимость "бэкфила":** Добавить условие: `if (existingMetadata && !existingMetadata.accessToken)`.
4. **Выполнение "бэкфила":**
   - Если условие истинно:
     a. Вывести информационное сообщение в лог
     b. Создать объект `updatedMetadata`, скопировав `existingMetadata` и добавив/перезаписав в нем `accessToken`.
     c. Использовать `ContentProcessor.injectMetadataIntoContent` и `writeFileSync` для перезаписи файла с уже полными метаданными.
5. **Обновление кэша:** При вызове `this.cacheManager.updatePage(...)` убедиться, что `accessToken` также передается в объекте `updates`.

### Задача №2: Интеграция `accessToken` в Модели Данных, Метаданные и Кэш

**Цель:** Расширить существующие структуры данных (`FileMetadata`, `PublishedPageInfo`) и связанные с ними механизмы (парсер YAML, менеджер кэша) для поддержки хранения и извлечения `accessToken` для каждой отдельной страницы.

**Компоненты для модификации:**
- `src/types/metadata.ts`
- `src/metadata/MetadataManager.ts`
- `src/cache/PagesCacheManager.ts`
- `src/publisher/EnhancedTelegraphPublisher.ts` (метод `addToCache`)

#### 1. Расширение Интерфейсов (Модель Данных)

**Файл:** `src/types/metadata.ts`

**1.1. Модификация `FileMetadata`**
```typescript
export interface FileMetadata {
  // ... существующие поля (telegraphUrl, editPath, etc.)
  contentHash?: string;

  /**
   * Access token used for publication. Stored directly in the file's
   * front-matter to ensure the correct user context is always used for edits.
   * @optional
   */
  accessToken?: string;
}
```

**1.2. Модификация `PublishedPageInfo`**
```typescript
export interface PublishedPageInfo {
  // ... существующие поля (telegraphUrl, editPath, title, etc.)
  contentHash?: string;

  /**
   * Access token associated with this page. Used for restoring metadata
   * and ensuring the correct user context during dependency publishing.
   * @optional
   */
  accessToken?: string;
}
```

#### 2. Интеграция в Управление Метаданными (YAML Front-Matter)

**Файл:** `src/metadata/MetadataManager.ts`

**2.1. Чтение Токена из YAML (`parseYamlMetadata`)**
```typescript
// Внутри parseYamlMetadata
switch (key) {
    // ... существующие case'ы
    case 'contentHash':
      metadata.contentHash = value;
      break;
    case 'accessToken': // <-- НОВЫЙ CASE
      metadata.accessToken = value;
      break;
}
```

**2.2. Запись Токена в YAML (`serializeMetadata`)**
```typescript
// Внутри serializeMetadata
if (metadata.contentHash) {
  lines.push(`contentHash: "${metadata.contentHash}"`);
}

if (metadata.accessToken) { // <-- НОВАЯ ЛОГИКА
  lines.push(`accessToken: "${metadata.accessToken}"`);
}
```

**2.3. Обновление `createMetadata`**
```typescript
static createMetadata(
  url: string,
  path: string,
  username: string,
  filePath: string,
  contentHash: string,
  title?: string,
  description?: string,
  accessToken?: string // <-- НОВЫЙ ПАРАМЕТР
): FileMetadata {
  return {
    // ... существующие поля
    contentHash,
    accessToken // <-- ПРИСВОЕНИЕ
  };
}
```

### Задача №3: Token Context Manager

**Цель:** Создать иерархическую систему для определения наиболее подходящего `accessToken` для публикации или редактирования файла, с четко определенными приоритетами.

**Расположение:** `src/publisher/EnhancedTelegraphPublisher.ts` (основная логика) и `src/config/ConfigManager.ts` (вспомогательная логика).

#### 1. Иерархия Источников Токенов (по убыванию приоритета)

1. **Токен из Метаданных Файла (`FileMetadata`):** Поле `accessToken` в YAML front-matter самого markdown-файла. **Приоритет: Высший.**

2. **Токен из Кэша (`PublishedPageInfo`):** Поле `accessToken` в записи, соответствующей файлу, в `.telegraph-pages-cache.json`. **Приоритет: Высокий.**

3. **Токен из Иерархической Конфигурации:** Поле `accessToken` из объединенной конфигурации, полученной иерархическим поиском файлов `.telegraph-publisher-config.json`. **Приоритет: Средний.**

4. **Токен Текущей Сессии:** Токен, хранящийся в свойстве `this.currentAccessToken` экземпляра `EnhancedTelegraphPublisher`. **Приоритет: Низкий (fallback).**

#### 2. Реализация

##### 2.1. Приватный Метод `getEffectiveAccessToken`

```typescript
private getEffectiveAccessToken(
  filePath: string,
  metadata: FileMetadata | null,
  cacheInfo: PublishedPageInfo | null,
  hierarchicalConfig: MetadataConfig
): { token: string; source: 'metadata' | 'cache' | 'config' | 'session' } {
  if (metadata?.accessToken) return { token: metadata.accessToken, source: 'metadata' };
  if (cacheInfo?.accessToken) return { token: cacheInfo.accessToken, source: 'cache' };
  if ((hierarchicalConfig as any).accessToken) return { token: (hierarchicalConfig as any).accessToken, source: 'config' };
  if (this.currentAccessToken) return { token: this.currentAccessToken, source: 'session' };
  
  throw new Error('No access token available for ' + basename(filePath));
}
```

##### 2.2. Интеграция в `publishWithMetadata` и `editWithMetadata`

**Алгоритм:**
1. **Сохранить контекст:** В начале метода сохранить текущий токен сессии.
2. **Определить и установить рабочий токен:** Внутри блока `try`.
3. **Выполнить операцию:** Выполнить все действия по публикации или редактированию.
4. **Восстановить контекст:** В блоке `finally` **обязательно** восстановить исходный токен.

### Задача №4: IntelligentRateLimitQueueManager

**Цель:** Создать отказоустойчивый, неблокирующий механизм обработки очереди публикации, который максимизирует пропускную способность путем интеллектуального переноса файлов с длительными задержками (`FLOOD_WAIT`) в конец очереди.

**Расположение файла:** `src/publisher/IntelligentRateLimitQueueManager.ts`

#### 1. Основные Обязанности Компонента

- **Отслеживание состояния:** Вести учет общего количества файлов, обработанных файлов и файлов, отложенных из-за `rate-limit`.
- **Принятие решений:** На основе длительности задержки `FLOOD_WAIT` и состояния очереди принимать решение: ожидать (`wait`) или отложить и переупорядочить (`postpone`).
- **Управление очередью:** Предоставлять логику для переупорядочивания массива-очереди.
- **Управление повторными попытками:** Отслеживать количество попыток для отложенных файлов.
- **Финальная обработка:** Обеспечить механизм для повторной обработки всех отложенных файлов в конце основного цикла публикации.

#### 2. Определение Класса и Интерфейсов

```typescript
// Информация об отложенном файле
export interface PostponedFileInfo {
  originalWaitTime: number; // Исходное время ожидания в секундах
  retryAfter: number;       // Timestamp (ms), после которого можно повторить
  postponedAt: number;      // Timestamp (ms), когда файл был отложен
  attempts: number;         // Количество попыток
}

// Решение, принимаемое менеджером
export interface QueueDecision {
  action: 'wait' | 'postpone';
  waitSeconds?: number; // Время ожидания (только для action: 'wait')
}

// Статистика очереди для логирования
export interface QueueStats {
  total: number;
  processed: number;
  postponed: number;
  remaining: number;
}

export class IntelligentRateLimitQueueManager {
  private static readonly POSTPONE_THRESHOLD_SECONDS = 30;
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  
  private postponedFiles: Map<string, PostponedFileInfo> = new Map();
  private processedCount = 0;
  private totalFiles = 0;
  
  public initialize(totalFiles: number): void;
  public async handleRateLimit(filePath: string, waitSeconds: number, processingQueue: string[]): Promise<QueueDecision>;
  public markSuccessful(filePath: string): void;
  public markFailed(filePath: string, error: string): void;
  public shouldRetryNow(filePath: string): boolean;
  public isPostponed(filePath: string): boolean;
  public async processFinalRetries(publishFn: (filePath: string) => Promise<PublicationResult>): Promise<PublicationResult[]>;
  public getQueueStats(): QueueStats;
  public getPostponedSummary(): string[];
}
```

### Задача №5: Интеграция Новой Логики в `EnhancedTelegraphPublisher`

**Цель:** Интегрировать интеллектуальное управление токенами, новую логику обработки `rate-limit` и менеджер очереди в основной рабочий процесс `EnhancedTelegraphPublisher`.

#### Шаг 5.1: Модификация Метода `publishDependencies`

**Логика реализации:**
1. **Инициализация:** Создать экземпляр `IntelligentRateLimitQueueManager`.
2. **Основной Цикл Обработки:** Использовать цикл с обработкой каждого файла.
3. **Логика внутри `try`:**
   - **Определение токена:** Получить метаданные и информацию из кэша, вызвать `getEffectiveAccessToken(...)`.
   - **Проверка на `force`:** Если опция `force` активна, напрямую вызывать `publishWithMetadata`.
   - **Стандартный режим:** Вызвать `processFileByStatus(fileToProcess, ...)`.
4. **Логика внутри `catch (error)`:** Проверить, является ли ошибка `FLOOD_WAIT_X` и обработать соответственно.

#### Шаг 5.2: Модификация Методов `publishNodes` и `editPage`

**Модификация `publishNodes`:**
- В `catch (error)` блоке добавить проверку `FLOOD_WAIT`.
- Если `waitSeconds > THRESHOLD`, вызвать `createNewUserAndSwitch(triggerFile)`.
- Если `waitSeconds <= THRESHOLD`, использовать существующую логику.

**Модификация `editPage`:**
- Оставить существующую логику для `FLOOD_WAIT` без изменений.
- Добавить новый блок для `PAGE_ACCESS_DENIED` с подробным диагностическим сообщением.

### Задача №6: Иерархическая Загрузка Конфигурации

**Цель:** Реализовать механизм, который ищет файл `.telegraph-publisher-config.json` вверх по дереву каталогов от текущего файла, объединяя найденные конфигурации.

#### 6.1. Модификация `ConfigManager.ts`

1. **Создать новый метод `loadHierarchicalConfig(startPath: string): MetadataConfig`**
2. **Алгоритм:**
   - Начать с конфигурации по умолчанию
   - Построить список всех родительских директорий вплоть до корня
   - Итерировать от корня к самой вложенной
   - В каждой директории проверять наличие файла конфигурации
   - Выполнять глубокое слияние (deep merge) найденных конфигураций
   - Кэшировать результат для повышения производительности

#### 6.2. Интеграция в `EnhancedCommands.ts`

Заменить вызов `ConfigManager.getMetadataConfig(fileDirectory)` на новый иерархический метод:

```typescript
// Было:
// const existingConfig = ConfigManager.getMetadataConfig(fileDirectory);

// Стало:
const hierarchicalConfig = ConfigManager.loadHierarchicalConfig(fileDirectory);
```

## Критерии Приемки

### Общие Критерии
- ✅ Все 6 под-задач реализованы согласно спецификации
- ✅ Полная обратная совместимость с существующими файлами
- ✅ 85% покрытие тестами для всех новых компонентов
- ✅ Нулевые breaking changes в существующем API
- ✅ Оптимизация производительности через интеллектуальное управление очередью
- ✅ Комплексная диагностика ошибок

### Специфические Критерии по Задачам

#### Задача №1 (Token Backfill)
- ✅ После первой публикации в файле появляется YAML front-matter с `accessToken`
- ✅ Старые файлы автоматически получают `accessToken` после редактирования
- ✅ Консистентность между файлом и кэшем

#### Задача №2 (Data Models)
- ✅ Интерфейсы содержат необязательное поле `accessToken`
- ✅ Корректное чтение/запись токена из/в YAML и кэш
- ✅ Обратная совместимость со старыми файлами

#### Задача №3 (Token Context Manager)
- ✅ Правильный приоритет источников токенов
- ✅ Изоляция операций между файлами
- ✅ Автоматический бэкфил токенов

#### Задача №4 (Queue Manager)
- ✅ Длительные задержки приводят к переносу в конец очереди
- ✅ Короткие задержки обрабатываются стандартным ожиданием
- ✅ Финальная обработка отложенных файлов

#### Задача №5 (Integration)
- ✅ Корректная интеграция всех компонентов
- ✅ Обработка `PAGE_ACCESS_DENIED` с диагностикой
- ✅ Сохранение контекста токенов

#### Задача №6 (Hierarchical Config)
- ✅ Поиск конфигов вверх по дереву каталогов
- ✅ Правильное слияние конфигураций
- ✅ Приоритет CLI-опций над файловыми конфигами

## План Реализации: 2 → 6 → 3 → 1 → 4 → 5

Эта последовательность обеспечивает построение функционала на уже готовом и протестированном фундаменте на каждом шаге. 