# VAN Analysis - Heading Conversion Fix for Telegraph API

**Task ID:** TASK-013
**Phase:** VAN (Analysis)
**Date:** 2025-08-03_09-49

## Problem Analysis

### Current Implementation Issues

Текущая реализация в `src/markdownConverter.ts` на строках 343-362:

```typescript
// Handle headings
const headingMatch = line.match(/^(#+)\s*(.*)/);
if (headingMatch?.[1] && headingMatch[2] !== undefined) {
    // Close any open blocks before adding a heading
    if (inList) {
        nodes.push({ tag: currentListTag, children: currentListItems });
        inList = false;
        currentListItems = [];
    }
    if (inBlockquote) {
        nodes.push({
            tag: "blockquote",
            children: processInlineMarkdown(blockquoteContent.join("\n")),
        });
        inBlockquote = false;
        blockquoteContent = [];
    }
    const level = Math.min(6, headingMatch[1].length); // Map # to h1, ## to h2, etc.
    const text = headingMatch[2] || "";
    nodes.push({ tag: `h${level}`, children: processInlineMarkdown(text) }); // ❌ ПРОБЛЕМА ЗДЕСЬ
    continue;
}
```

**Критическая проблема:** Строка 361 генерирует теги `h1`, `h2`, `h5`, `h6`, которые **НЕ поддерживаются Telegraph API**.

### Telegraph API Ограничения

Согласно официальной документации Telegraph API, для заголовков поддерживаются только:
- `<h3>` - заголовок верхнего уровня
- `<h4>` - заголовок нижнего уровня

**Все остальные теги заголовков (`h1`, `h2`, `h5`, `h6`) НЕ поддерживаются.**

### Последствия Проблемы

1. **API Rejection:** Telegraph API может отклонить контент с неподдерживаемыми тегами
2. **Неправильное Отображение:** Неподдерживаемые теги могут отображаться как обычный текст
3. **Потеря Структуры:** Иерархия документа теряется при публикации
4. **Пользовательский Опыт:** Плохое восприятие контента читателями

## Technical Analysis

### Current Code Structure

**Файл:** `src/markdownConverter.ts`
**Функция:** `convertMarkdownToTelegraphNodes` (строки ~95-450)
**Проблемная область:** Строки 343-362

### Существующие Тесты

Необходимо проверить:
1. `src/markdownConverter.test.ts` - основные тесты конвертации
2. Покрытие текущими тестами логики заголовков
3. Влияние изменений на существующие тесты

### Dependencies Analysis

**Прямые зависимости:**
- `TelegraphNode` interface из `telegraphPublisher.ts`
- `processInlineMarkdown` функция для обработки inline разметки

**Обратные зависимости:**
- Все модули, использующие `convertMarkdownToTelegraphNodes`
- Тесты в `markdownConverter.test.ts`
- Integration тесты

## Solution Requirements

### Functional Requirements

1. **Heading Mapping Strategy:**
   - `# H1` → `<h3>`
   - `## H2` → `<h3>`
   - `### H3` → `<h3>`
   - `#### H4` → `<h4>`
   - `##### H5` → `<p><strong>text</strong></p>`
   - `###### H6` → `<p><strong><em>text</em></strong></p>`

2. **API Compliance:**
   - Использовать только поддерживаемые теги: `h3`, `h4`, `p`, `strong`, `em`
   - Исключить генерацию `h1`, `h2`, `h5`, `h6` тегов

3. **Visual Hierarchy Preservation:**
   - Сохранить визуальную иерархию через альтернативные средства
   - H5 через жирный текст (`<strong>`)
   - H6 через жирный курсив (`<strong><em>`)

### Non-Functional Requirements

1. **Performance:** Не должно ухудшить производительность конвертации
2. **Maintainability:** Код должен быть понятным и поддерживаемым
3. **Testability:** Должны быть добавлены comprehensive тесты
4. **Backward Compatibility:** Существующие тесты должны продолжать проходить

## Risk Analysis

### High Risks
- **Breaking Changes:** Изменение может сломать существующие тесты
- **Visual Regression:** Изменение визуального представления контента

### Medium Risks
- **Performance Impact:** Дополнительная логика может замедлить конвертацию
- **Edge Cases:** Непредвиденные сценарии использования заголовков

### Low Risks
- **API Changes:** Telegraph API редко меняет поддерживаемые теги
- **Integration Issues:** Хорошо изолированная функция

## Implementation Strategy

### Phase 1: Code Analysis
- Детальный анализ существующих тестов
- Выявление всех использований текущей логики заголовков
- Подготовка test scenarios

### Phase 2: Implementation
- Замена строки 361 на switch-based логику
- Добавление mapping для всех уровней заголовков
- Сохранение логики закрытия блоков

### Phase 3: Testing
- Добавление новых тестов для всех уровней заголовков
- Проверка обратной совместимости
- Валидация против Telegraph API

### Phase 4: Documentation
- Обновление комментариев в коде
- Документирование mapping strategy
- Добавление примеров использования

## Acceptance Criteria Validation

✅ **Критерий 1:** H1, H2, H3 → h3 теги
✅ **Критерий 2:** H4 → h4 тег
✅ **Критерий 3:** H5 → `<p><strong>` структура
✅ **Критерий 4:** H6 → `<p><strong><em>` структура
✅ **Критерий 5:** Исключение неподдерживаемых тегов
✅ **Критерий 6:** Сохранение существующих тестов
✅ **Критерий 7:** Новые тесты для всех сценариев

## Next Steps

1. **PLAN Phase:** Создание детального плана реализации
2. **CREATIVE Phase:** Разработка элегантного решения mapping
3. **IMPLEMENT Phase:** Реализация изменений и тестов
4. **QA Phase:** Валидация и проверка качества

## Summary

Проблема четко определена и имеет ясное техническое решение. Изменения локализованы в одной функции, что минимизирует риски. Решение обеспечит полную совместимость с Telegraph API при сохранении функциональности и читаемости кода.