# Технические спецификации для улучшений Telegraph Publisher

**Дата:** 2025-08-04  
**Версия:** 1.0  
**Статус:** Готово к реализации  

## Обзор требований

Данный документ содержит комплексные технические спецификации для реализации четырех ключевых улучшений системы публикации Telegraph, основанные на детальном анализе пользователя и готовые к непосредственной реализации.

## Спецификация №1: Улучшение генерации оглавления (FEAT-ASIDE-ENHANCEMENT-001)

### Описание проблемы

Функция генерации оглавления (`<aside>`) имеет две критические проблемы:

1. **Некорректные якоря для заголовков-ссылок:** Если заголовок является ссылкой (например, `## [Текст](./file.md)`), текущая логика формирует якорь из всей Markdown-строки (`#[Текст](./file.md)`), что приводит к неработающим ссылкам в оглавлении.

2. **Отсутствие контроля:** Пользователь не может отключить автоматическую генерацию оглавления.

### Предлагаемое решение

1. Изменить логику `generateTocAside` для корректного извлечения текстовой части из заголовков-ссылок
2. Добавить опцию `--[no-]aside` в команду `publish` для контроля генерации оглавления

### Детали реализации

#### A. Добавление CLI опции

**Файл:** `src/cli/EnhancedCommands.ts`  
**Метод:** `addPublishCommand`

```typescript
// Добавить в .command("publish")
.option("--aside", "Automatically generate a Table of Contents (aside block) at the start of the article (default: true)")
.option("--no-aside", "Disable automatic generation of the Table of Contents")
```

#### B. Передача опции в WorkflowManager

**Файл:** `src/workflow/PublicationWorkflowManager.ts`  
**Метод:** `publish`

```typescript
// Передать опцию в publishWithMetadata
const result = await this.publisher.publishWithMetadata(file, this.config.defaultUsername, {
  generateAside: options.aside !== false,
  debug: options.debug || false
});
```

#### C. Обновление EnhancedTelegraphPublisher

**Файл:** `src/publisher/EnhancedTelegraphPublisher.ts`  
**Методы:** `publishWithMetadata`, `editWithMetadata`

```typescript
// Добавить generateAside в опции
options: {
  generateAside?: boolean;
} = {}

// Передать в convertMarkdownToTelegraphNodes
const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication, { 
  generateToc: options.generateAside 
});
```

#### D. Основное исправление в markdownConverter

**Файл:** `src/markdownConverter.ts`

1. **Обновить `convertMarkdownToTelegraphNodes`:**
```typescript
export function convertMarkdownToTelegraphNodes(
  markdown: string,
  options: { generateToc?: boolean } = { generateToc: true }
): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];
  
  // Генерировать TOC только если включено
  if (options.generateToc !== false) {
    const tocAside = generateTocAside(markdown);
    if (tocAside) {
      nodes.push(tocAside);
    }
  }
  // ... остальная логика
}
```

2. **Обновить `generateTocAside`:**
```typescript
// Внутри цикла обработки заголовков
if (headingMatch?.[1] && headingMatch[2] !== undefined) {
  const originalText = headingMatch[2].trim();
  let textForAnchor = originalText;
  
  // Проверить, является ли заголовок ссылкой
  const linkInHeadingMatch = originalText.match(/^\[(.*?)\]\((.*?)\)$/);
  if (linkInHeadingMatch) {
    // Для якоря использовать только текстовую часть
    textForAnchor = linkInHeadingMatch[1] || '';
  }

  let displayText = originalText;
  
  // Обработка префиксов для H5/H6
  if (level === 5) {
    displayText = `» ${originalText}`;
    if (linkInHeadingMatch) {
      textForAnchor = `» ${linkInHeadingMatch[1]}`;
    }
  }
  
  headings.push({ level, text: originalText, displayText, textForAnchor });
}

// При генерации ссылок использовать textForAnchor
const anchor = heading.textForAnchor
  .trim()
  .replace(/[<>]/g, '')
  .replace(/ /g, '-');
```

### Критерии приемки

1. Заголовок `## [Структура](./file.md)` должен генерировать ссылку с `href="#Структура"`
2. `publish` без `--no-aside` должен генерировать оглавление
3. `publish --no-aside` не должен включать `<aside>` в статью

## Спецификация №2: Улучшение логики contentHash (FEAT-HASH-ENHANCEMENT-001)

### Описание проблемы

1. Хеш не создается автоматически для файлов, опубликованных до внедрения функции
2. При публикации зависимостей файлы без `contentHash` не обновляются

### Предлагаемое решение

Объединить логику автоматического создания и обратного заполнения хешей.

### Детали реализации

**Файл:** `src/publisher/EnhancedTelegraphPublisher.ts`

#### A. Метод `publishWithMetadata`

```typescript
// После успешного publishNodes(), перед createMetadata()
const newHash = this.calculateContentHash(processedWithLinks.contentWithoutMetadata);
const metadata = MetadataManager.createMetadata(..., newHash, ...);
```

#### B. Метод `editWithMetadata`

```typescript
// В начале метода
const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);

// Проверка необходимости обновления
if (!options.forceRepublish && existingMetadata.contentHash && 
    existingMetadata.contentHash === currentHash) {
  // Пропустить публикацию
  return;
}

// После успешного editPage()
const updatedContentHash = this.calculateContentHash(processed.contentWithoutMetadata);
const updatedMetadata: FileMetadata = {
  ...existingMetadata,
  contentHash: updatedContentHash
};
```

#### C. Метод `publishDependencies`

```typescript
// Внутри цикла по analysis.publishOrder
const status = MetadataManager.getPublicationStatus(fileToProcess);

if (status === PublicationStatus.PUBLISHED) {
  const metadata = MetadataManager.getPublicationInfo(fileToProcess);
  
  if (metadata && !metadata.contentHash) {
    // Принудительно обновить файл для добавления хеша
    await this.editWithMetadata(fileToProcess, username, { 
      forceRepublish: true 
    });
  }
}
```

### Критерии приемки

1. Все новые публикации получают `contentHash` в метаданных
2. При редактировании `contentHash` обновляется
3. Зависимости без хеша автоматически обновляются при публикации

## Спецификация №3: Опция --force для обхода проверки ссылок (FEAT-FORCE-PUBLISH-001)

### Описание проблемы

Необходимость публикации файлов с проблемными ссылками для отладки без блокировки `LinkVerifier`.

### Предлагаемое решение

Добавить опцию `--force` для полного пропуска верификации ссылок.

### Детали реализации

#### A. Добавление CLI опции

**Файл:** `src/cli/EnhancedCommands.ts`

```typescript
.option("--force", "Bypass link verification and publish anyway (for debugging)")
```

#### B. Обновление WorkflowManager

**Файл:** `src/workflow/PublicationWorkflowManager.ts`

```typescript
// Изменить условие проверки ссылок
if (!options.noVerify && !options.force) {
  ProgressIndicator.showStatus("🔎 Verifying local links...", "info");
  // ... существующая логика ...
} else if (options.force) {
  ProgressIndicator.showStatus("⚠️ Bypassing link verification due to --force flag.", "warning");
}
```

### Критерии приемки

1. `publish --force` с неработающими ссылками должен продолжать публикацию
2. Предупреждение о пропуске верификации должно отображаться
3. Без `--force` поведение остается прежним

## Спецификация №4: Валидация исправлений якорей (Подтверждение FIX-ANCHOR-GENERATION-002)

### Контекст

Ранее была проблема с обработкой ссылок со сложными символами:
```
./аналогии.md#Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)
```

### Требования валидации

1. **Тестирование сложных символов:** Проверить корректную обработку скобок, кавычек, русского текста
2. **Проверка соответствия якорей:** Убедиться, что генерируемые якоря соответствуют ссылкам
3. **Регрессионное тестирование:** Подтвердить отсутствие регрессий в простых случаях

### Тестовые сценарии

1. Заголовок: `## Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)`
2. Ссылка: `./file.md#Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)`
3. Ожидаемое поведение: Ссылка должна работать корректно

## Общие требования качества

### Тестирование

- **Минимальное покрытие:** 85% для всего нового кода
- **Успешность тестов:** 100% прохождение всех тестов
- **Типы тестов:** Unit, integration, edge cases

### Производительность

- **Минимальное влияние** на существующие workflow
- **Эффективные операции** с хешами и метаданными
- **Умная обработка** зависимостей без избыточных операций

### Совместимость

- **100% обратная совместимость** с существующим API
- **Сохранение поведения** всех существующих функций
- **Плавная интеграция** с текущей архитектурой

## План валидации

1. **Функциональное тестирование** всех новых возможностей
2. **Регрессионное тестирование** существующего функционала
3. **Интеграционное тестирование** CLI и workflow
4. **Пользовательское тестирование** сценариев использования

## Заключение

Представленные спецификации готовы к непосредственной реализации и содержат все необходимые детали для успешного внедрения улучшений в систему публикации Telegraph. Каждая спецификация включает конкретные изменения в коде, критерии приемки и требования к тестированию.