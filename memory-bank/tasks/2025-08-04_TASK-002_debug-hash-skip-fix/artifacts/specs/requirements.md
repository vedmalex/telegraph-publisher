# Technical Specification: Debug Hash Skip and Link Regex Fix

**ID Задачи:** DEBUG-HASH-LINK-FIX-001  
**Дата:** 2025-08-04  
**Автор:** User Bug Report Analysis  
**Статус:** Готово к реализации

## 1. Описание проблем

### Проблема 1: Debug JSON не создается для неизмененного контента
При выполнении команды `publish --debug --force` для файла с неизмененным контентом (hash совпадает), JSON файл не создается из-за раннего возврата из функции, который минует debug логику.

**Команда**: 
```bash
telegraph-publisher publish --author "Веданта-крит дас" --file index.md --token xxx --debug --force
```

**Проблемное поведение**:
```
📄 Content unchanged. Skipping publication of index.md.
✅ Updated successfully!
```
JSON файл НЕ создается.

### Проблема 2: Некорректный парсинг ссылок со скобками в якорях
Regex для парсинга markdown ссылок не корректно обрабатывает URL с сбалансированными скобками в якорных частях.

**Примеры поломанных ссылок**:
```
Источник: [текст](./file.md#anchor-(содержащий-скобки))
Парсится: "./file.md#anchor-(содержащий-скобки"  ❌ (пропущена последняя `)`)
```

## 2. Анализ первопричин

### Проблема 1: Root Cause
В методе `editWithMetadata` (строки 350-366):
1. Проверяется hash контента
2. Если контент не изменился, происходит ранний возврат
3. Debug логика (строки 395-404) НЕ выполняется
4. JSON файл НЕ создается

### Проблема 2: Root Cause  
В методе `LinkScanner.extractLinks()` (строка 100):
```typescript
const linkRegex = /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^)]+)\)/g;
```
Паттерн `([^)]+)` останавливается на первой `)`, не учитывая сбалансированные скобки в href.

## 3. Предлагаемые решения

### Решение 1: Модификация условия hash check
**Файл**: `src/publisher/EnhancedTelegraphPublisher.ts`  
**Метод**: `editWithMetadata`  
**Строка**: 350

**Текущий код (проблемный)**:
```typescript
if (!options.forceRepublish) {
  const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);
  
  if (existingMetadata.contentHash && existingMetadata.contentHash === currentHash) {
    // Early return - BYPASSES debug logic
    return { /* ... */ };
  }
}
```

**Исправленный код**:
```typescript
if (!options.forceRepublish && !debug) { // Add !debug condition
  const currentHash = this.calculateContentHash(processed.contentWithoutMetadata);
  
  if (existingMetadata.contentHash && existingMetadata.contentHash === currentHash) {
    // Early return only when NOT in debug mode
    return { /* ... */ };
  }
}
```

### Решение 2: Исправление regex для сбалансированных скобок
**Файл**: `src/links/LinkScanner.ts`  
**Метод**: `extractLinks`  
**Строка**: 100

**Текущий regex (проблемный)**:
```typescript
const linkRegex = /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^)]+)\)/g;
```

**Исправленный regex**:
```typescript
const linkRegex = /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
```

**Объяснение исправления**:
- `([^()]*(?:\([^()]*\)[^()]*)*)*` - обрабатывает один уровень сбалансированных скобок
- Позволяет корректно парсить URL типа `file.md#anchor-(with-parens)`

## 4. Детали реализации

### A. Debug Hash Skip Fix

**Технические требования**:
1. Добавить проверку `!debug` к условию hash check
2. Извлечь переменную `debug` из options в начале метода
3. Сохранить performance оптимизацию для non-debug случаев
4. Обеспечить выполнение debug логики при debug=true

**Код изменений**:
```typescript
// В начале метода editWithMetadata
const { withDependencies = true, dryRun = false, debug = false, generateAside = true } = options;

// Изменение условия hash check
if (!options.forceRepublish && !debug) {
  // hash check logic remains the same
}
```

### B. Link Regex Pattern Fix

**Технические требования**:
1. Обновить regex pattern для обработки сбалансированных скобок
2. Сохранить backward compatibility для простых ссылок
3. Поддержать кириллические символы и специальные знаки
4. Обработать edge cases и некорректные ссылки

**Альтернативные подходы**:
Для сложных случаев с множественной вложенностью можно использовать функциональный подход:
```typescript
const extractBalancedParentheses = (text: string, startIndex: number): string => {
  let depth = 0;
  let i = startIndex;
  
  while (i < text.length) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.substring(startIndex + 1, i);
    }
    i++;
  }
  
  return text.substring(startIndex + 1);
};
```

## 5. Критерии приемки

### Проблема 1: Debug Hash Skip Fix
1. **Команда**: `telegraph-publisher publish --file <existing_file.md> --debug --force` **ДОЛЖНА** создавать JSON файл даже для неизмененного контента
2. **Performance**: Оптимизация hash check должна по-прежнему работать для non-debug случаев
3. **Backward Compatibility**: Существующее поведение не должно изменяться

### Проблема 2: Link Regex Pattern Fix
1. **Простые ссылки**: `[text](file.md)` должны работать как раньше
2. **Якорные ссылки**: `[text](file.md#anchor)` должны работать как раньше  
3. **Скобки в якорях**: `[text](file.md#anchor-(with-parens))` должны теперь работать корректно
4. **Пользовательский случай**: Ссылки из баг-репорта должны парситься корректно
5. **Кириллица**: Поддержка кириллических символов в якорях

### Интеграционные критерии
1. **Пользовательский сценарий**: Команда пользователя должна выполняться без ошибок broken links
2. **JSON Creation**: Debug JSON должен создаваться для реального файла пользователя
3. **Link Verification**: Все ссылки должны проходить верификацию
4. **End-to-End**: Полный workflow должен работать корректно

## 6. Тестовые сценарии

### Тестирование Debug Fix
1. **Unchanged Content + Debug**: Файл с неизмененным контентом + `--debug --force`
2. **Changed Content + Debug**: Файл с измененным контентом + `--debug`
3. **No Debug + Unchanged**: Файл с неизмененным контентом без debug (performance test)
4. **Real User Scenario**: Точная команда пользователя

### Тестирование Link Regex Fix
1. **Simple Links**: `[text](file.md)`
2. **Anchor Links**: `[text](file.md#section)`
3. **Parentheses in Anchors**: `[text](file.md#section-(subsection))`
4. **User Examples**: Конкретные ссылки из баг-репорта
5. **Cyrillic Anchors**: `[текст](файл.md#раздел-(подраздел))`
6. **Edge Cases**: Unbalanced parentheses, multiple levels, special chars

### Интеграционное тестирование
1. **Combined Fix**: Оба исправления работают вместе
2. **Performance Impact**: Нет значительного снижения производительности
3. **Regression Testing**: Существующая функциональность не нарушена
4. **Cross-Platform**: Работа на разных операционных системах

## 7. Дополнительные требования

### Качество кода
- Все импорты должны быть проверены и корректны
- Код должен следовать существующим паттернам обработки ошибок
- Сообщения об ошибках должны быть понятными пользователю
- Комментарии и код только на английском языке

### Производительность
- Debug fix не должен влиять на производительность в non-debug режиме
- Link regex fix не должен значительно замедлять парсинг ссылок
- Memory usage должен оставаться на том же уровне

### Совместимость
- Полная backward compatibility для существующих ссылок
- Сохранение API интерфейсов
- Никаких breaking changes для пользователей

## 8. Процедура развертывания

### Поэтапное внедрение
1. **Phase 1**: Implement debug hash skip fix
2. **Phase 2**: Implement link regex pattern fix  
3. **Phase 3**: Combined integration testing
4. **Phase 4**: User acceptance testing

### Rollback Plan
- Сохранить оригинальный regex pattern как fallback
- Возможность быстрого отката debug logic при проблемах
- Comprehensive logging для диагностики проблем

### Validation Steps
1. Unit testing для каждого исправления
2. Integration testing для combined functionality
3. Real-world testing с файлами пользователя
4. Performance benchmarking before/after changes