# Creative Design Decisions - Link Anchor Validation Enhancement

## Executive Summary

В фазе CREATIVE принимаются ключевые дизайнерские решения для реализации валидации якорей в LinkVerifier. Основываясь на VAN-анализе и детальном плане, делаются окончательные выборы алгоритмов, паттернов и архитектурных подходов.

## 1. Algorithm Design Decisions

### 1.1 Slug Generation Algorithm

**РЕШЕНИЕ:** Многоступенчатая нормализация с Unicode-поддержкой

**Обоснование:**
- JavaScript имеет отличную встроенную поддержку Unicode
- Поэтапный подход обеспечивает читаемость и тестируемость
- Совместимость с большинством Markdown-парсеров

**Финальный алгоритм:**
```typescript
private generateSlug(text: string): string {
  return text
    .toLowerCase()                           // 1. Normalize case
    .trim()                                  // 2. Remove leading/trailing whitespace
    .replace(/<[^>]+>/g, '')                 // 3. Remove HTML tags
    .replace(/[^\p{L}\p{N}\s-]/gu, '')       // 4. Keep only letters, numbers, spaces, hyphens
    .replace(/\s+/g, '-');                   // 5. Replace spaces with hyphens
}
```

**Дизайнерские особенности:**
- **Unicode-aware:** Флаг `u` в regex обеспечивает корректную обработку Unicode
- **HTML-safe:** Удаление HTML-тегов обеспечивает чистоту якорей
- **Performance-optimized:** Цепочка методов без промежуточных переменных
- **Cyrillic-friendly:** `\p{L}` включает все Unicode-буквы, включая кириллицу

### 1.2 Heading Extraction Algorithm

**РЕШЕНИЕ:** Regex-based extraction с глобальным поиском

**Обоснование:**
- Regex быстрее парсеров для простых паттернов
- Глобальный поиск обрабатывает множественные заголовки эффективно
- Поддержка всех стандартных уровней Markdown-заголовков

**Финальный паттерн:**
```typescript
const headingRegex = /^(#{1,6})\s+(.*)/gm;
```

**Дизайнерские особенности:**
- **Levels 1-6:** Поддержка всех стандартных уровней заголовков
- **Flexible spacing:** `\s+` позволяет любое количество пробелов после #
- **Multiline:** Флаг `m` обеспечивает работу с многострочным контентом
- **Global:** Флаг `g` извлекает все заголовки за один проход

### 1.3 Fragment Processing Algorithm

**РЕШЕНИЕ:** Destructuring assignment с join восстановлением

**Обоснование:**
- Элегантно обрабатывает множественные # в URL
- Сохраняет оригинальную структуру фрагмента
- Более читаемо чем индексный доступ

**Финальная реализация:**
```typescript
const [pathPart, ...fragmentParts] = link.href.split('#');
const fragment = fragmentParts.join('#');
```

**Дизайнерские особенности:**
- **Multi-fragment safe:** Корректно обрабатывает `file.md#a#b`
- **Empty fragment safe:** Правильно работает с `file.md#`
- **Type safe:** TypeScript гарантирует корректность типов

## 2. Caching Strategy Design

### 2.1 Cache Structure

**РЕШЕНИЕ:** Map-based cache с Set значениями

```typescript
private anchorCache: Map<string, Set<string>> = new Map();
```

**Обоснование:**
- **Optimal lookup:** O(1) поиск по пути файла
- **Memory efficient:** Set избегает дублирования якорей
- **Type safe:** Четкие типы для ключей и значений
- **Native performance:** Использует встроенные структуры данных JavaScript

### 2.2 Cache Key Strategy

**РЕШЕНИЕ:** Absolute file path как ключ

**Обоснование:**
- Гарантирует уникальность между разными файлами
- Совместим с существующей логикой pathResolver
- Избегает коллизий relative vs absolute paths

### 2.3 Cache Population Strategy

**РЕШЕНИЕ:** Lazy loading с immediate caching

**Обоснование:**
- Минимизирует initial memory footprint
- Загружает только необходимые файлы
- Кэширует сразу для последующих обращений

## 3. Error Handling Design

### 3.1 File Reading Error Strategy

**РЕШЕНИЕ:** Graceful degradation с empty Set

**Обоснование:**
- Позволяет продолжить проверку других ссылок
- Файловые ошибки не прерывают весь процесс
- Empty Set означает "нет валидных якорей"

**Реализация:**
```typescript
try {
  const content = readFileSync(filePath, 'utf-8');
  // ... process content
} catch (error) {
  return new Set<string>(); // Graceful failure
}
```

### 3.2 URL Decoding Strategy

**РЕШЕНИЕ:** decodeURIComponent с error handling

**Обоснование:**
- Корректно обрабатывает encoded символы
- Поддерживает non-ASCII символы в URL
- Graceful fallback при malformed URLs

## 4. Integration Design Decisions

### 4.1 Method Placement Strategy

**РЕШЕНИЕ:** Private methods внутри LinkVerifier класса

**Обоснование:**
- Сохраняет existing API surface
- Encapsulation принципы
- Простая интеграция с existing pathResolver

### 4.2 Backward Compatibility Strategy

**РЕШЕНИЕ:** Additive enhancement без изменения existing behavior

**Обоснование:**
- Zero breaking changes для existing users
- Existing tests continue to pass
- Progressive enhancement approach

### 4.3 Performance Integration Strategy

**РЕШЕНИЕ:** Optional anchor checking при наличии fragment

**Обоснование:**
- Links без фрагментов не затрагиваются performance-wise
- Anchor checking активируется только при необходимости
- Сохраняет existing performance для 95% use cases

## 5. Testing Design Strategy

### 5.1 Test File Organization

**РЕШЕНИЕ:** Expand existing LinkVerifier.test.ts

**Обоснование:**
- Maintains test cohesion в одном файле
- Easier maintenance и discovery
- Consistent с existing patterns

### 5.2 Test Data Strategy

**РЕШЕНИЕ:** Create dedicated test files в beforeEach

**Обоснование:**
- Isolation между тестами
- Predictable test environment
- Easy cleanup и setup

### 5.3 Unicode Testing Strategy

**РЕШЕНИЕ:** Dedicated Cyrillic test cases

**Обоснование:**
- Explicit validation для user's use case
- Demonstrates international support
- Regression protection для Unicode scenarios

## 6. User Experience Design

### 6.1 Error Reporting Strategy

**РЕШЕНИЕ:** Consistent error format с existing BrokenLink structure

**Обоснование:**
- Seamless integration с existing reporting
- Users get consistent error experience
- No changes needed в downstream tools

### 6.2 Performance User Experience

**РЕШЕНИЕ:** Transparent caching без user configuration

**Обоснование:**
- Zero configuration burden для users
- Optimal performance out-of-the-box
- Automatic memory management

## 7. Technical Architecture Decisions

### 7.1 Dependency Strategy

**РЕШЕНИЕ:** Minimal new dependencies (только readFileSync)

**Обоснование:**
- Reduces bundle size impact
- Leverages Node.js built-ins
- Maintains project simplicity

### 7.2 TypeScript Integration

**РЕШЕНИЕ:** Full type safety с proper generics

**Обоснование:**
- Consistent с project standards
- Compile-time error prevention
- Better IDE support

### 7.3 Documentation Strategy

**РЕШЕНИЕ:** Comprehensive JSDoc для all new methods

**Обоснование:**
- Maintains documentation standards
- Enables better IDE tooltips
- Self-documenting code

## Implementation Readiness Assessment

### ✅ Algorithm Decisions Complete
- Slug generation algorithm finalized
- Heading extraction pattern confirmed
- Fragment processing approach decided

### ✅ Architecture Decisions Complete
- Caching strategy designed
- Error handling approach confirmed
- Integration pattern established

### ✅ Performance Decisions Complete
- Memory optimization strategy confirmed
- Caching efficiency approach finalized
- User experience impact minimized

### ✅ Quality Decisions Complete
- Testing strategy comprehensive
- Documentation approach established
- Backward compatibility guaranteed

## Conclusion

Все ключевые дизайнерские решения приняты. Система готова к переходу в фазу IMPLEMENT с четким пониманием:

- **How:** Конкретные алгоритмы и паттерны определены
- **Why:** Обоснования для каждого решения документированы
- **What:** Конкретные implementation details специфицированы

**Статус:** READY FOR IMPLEMENTATION PHASE

**Next Action:** Transition to IMPLEMENT phase для code development