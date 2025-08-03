# VAN Analysis: Fix Link Anchor Replacement

**Date:** 2025-08-03_22-31
**Phase:** VAN (Vision & Analysis)
**Task ID:** TASK-018

## Problem Validation

Анализ кода подтвердил точность диагноза пользователя. Проблема действительно находится в `src/content/ContentProcessor.ts` в методе `replaceLinksInContent` на строках 156-164.

### Root Cause Confirmed

**Проблемная логика в строках 156-164:**
```typescript
for (const link of processedContent.localLinks) {
  const telegraphUrl = linkMappings.get(link.resolvedPath);
  if (telegraphUrl) {
    replacementMap.set(link.originalPath, telegraphUrl); // ❌ ЗДЕСЬ ТЕРЯЕТСЯ ЯКОРЬ
    link.telegraphUrl = telegraphUrl;
    link.isPublished = true;
  }
}
```

**Что происходит:**
1. `link.originalPath` содержит полный путь с якорем: `"./page.md#section"`
2. `link.resolvedPath` содержит только путь файла без якоря: `"/full/path/to/page.md"`
3. `linkMappings.get(link.resolvedPath)` возвращает базовый Telegraph URL: `"https://telegra.ph/page"`
4. `replacementMap.set(link.originalPath, telegraphUrl)` заменяет `"./page.md#section"` на `"https://telegra.ph/page"`
5. **Якорь `#section` теряется!**

### Evidence Analysis

**Из BUG/index.md строка 19:**
```markdown
- [Вопрос 3: Что наиболее важного для себя Вы видите в стихах 4–5?](./class004.structured.md)
```

**Из BUG/index.json.md строки 108-115:**
```json
{
  "tag": "a",
  "attrs": {
    "href": "https://telegra.ph/Zanyatie-4-Glava-1-Voprosy-mudrecov-08-02"
  },
  "children": [
    "Вопрос 3: Что наиболее важного для себя Вы видите в стихах 4–5?"
  ]
}
```

Видно, что в оригинале ссылка должна была иметь якорь, но в финальном JSON он отсутствует.

### Technical Architecture Analysis

**Текущий поток замены ссылок:**
1. `ContentProcessor.processContent()` → находит локальные ссылки
2. `ContentProcessor.replaceLinksInContent()` → создает `replacementMap`
3. `LinkResolver.replaceLocalLinks()` → выполняет замену по regex

**Проблема:** На этапе 2 теряется якорь при создании `replacementMap`.

### Solution Requirements Validation

Пользователь правильно предложил решение:
1. Обнаруживать наличие `#` в `link.originalPath`
2. Извлекать якорь из оригинального пути
3. Добавлять якорь к Telegraph URL

### Code Quality Analysis

**Существующие тесты НЕ покрывают:**
- Ссылки с якорями
- Сохранение якорей при замене
- Unicode символы в якорях
- Граничные случаи с якорями

**Текущее тестовое покрытие включает:**
- Базовую замену ссылок без якорей
- Частичную замену (смешанные опубликованные/неопубликованные)
- Пустые карты замен

## Implementation Impact Assessment

**Файлы для изменения:**
- `src/content/ContentProcessor.ts` - метод `replaceLinksInContent`
- `src/content/ContentProcessor.test.ts` - добавить тесты для якорей

**Риски:**
- Минимальные: изменения локализованы в одном методе
- Обратная совместимость: сохраняется для ссылок без якорей

**Производительность:**
- Минимальное влияние: добавляется только проверка на `#` и substring

## Acceptance Criteria Validation

Все критерии приемки пользователя технически выполнимы:
1. ✅ Сохранение якорей при замене - простая логика substring
2. ✅ Обратная совместимость - проверка не влияет на ссылки без якорей
3. ✅ Поддержка Unicode - JavaScript natively поддерживает
4. ✅ Тестируемость - легко создать тестовые случаи

## Next Phase Requirements

**PLAN Phase должен определить:**
1. Точный код изменений в `replaceLinksInContent`
2. Полный набор тестовых случаев
3. Стратегию валидации изменений
4. План интеграционного тестирования

## VAN Phase Conclusion

✅ **Проблема полностью понята и валидна**
✅ **Решение пользователя технически корректно**
✅ **Риски минимальны, реализация straightforward**
✅ **Все требования технически выполнимы**

**Готовность к PLAN Phase:** 100%