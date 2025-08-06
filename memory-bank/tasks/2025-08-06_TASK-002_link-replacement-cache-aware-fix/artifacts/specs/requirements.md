# Техническая спецификация: Cache-Aware Link Replacement Fix

## Обзор проблемы

**Описание:** В системе telegraph-publisher механизм обновления ссылок после публикации контента работает некорректно для многоуровневых зависимостей. Ссылки в файлах-зависимостях не заменяются на Telegraph URLs, что приводит к неработающим ссылкам в опубликованном контенте.

**Критичность:** HIGH - критическая ошибка функциональности, влияющая на пользовательский опыт

## Детальная проблема

### Сценарий ошибки
При выполнении команды:
```bash
telegraph-publisher publish --toc-title "Содержание" --force --file песнь1.md --debug
```

В структуре:
```
/Users/vedmalex/work/BhaktiVaibhava/ШБ/Песнь1/
├── песнь1.md                    # root файл
├── песнь1.json                  # результат публикации root
├── 01.md                        # dependency level 1
├── 01.json                      # результат публикации dependency
├── 01/01.01.01.md              # dependency level 2
└── .telegraph-pages-cache.json  # кэш всех опубликованных страниц
```

### Ожидаемое поведение
- В `песнь1.md`: ссылки на `01.md` заменяются Telegraph URLs ✅
- В `01.md`: ссылки на `01/01.01.01.md` заменяются Telegraph URLs ❌ (НЕ РАБОТАЕТ)

### Фактическое поведение  
- В `песнь1.md`: ссылки корректно заменены
- В `01.md`: ссылки остаются локальными путями, хотя целевые файлы уже опубликованы

## Техническая причина

**Root Cause:** Метод `replaceLinksWithTelegraphUrls()` в `src/publisher/EnhancedTelegraphPublisher.ts` (строки 684-703) использует `MetadataManager.getPublicationInfo()` вместо глобального `PagesCacheManager`.

**Проблемный код:**
```typescript
// Строки 694-699
for (const filePath of uniquePaths) {
  const metadata = MetadataManager.getPublicationInfo(filePath);
  if (metadata) {
    linkMappings.set(filePath, metadata.telegraphUrl);
  }
}
```

**Почему не работает:**
1. `MetadataManager.getPublicationInfo()` читает файловую систему
2. Вложенные зависимости могут не иметь метаданных в момент обработки
3. `PagesCacheManager` содержит все опубликованные URLs, но не используется

## Требования к решению

### Функциональные требования

**FR1: Глобальная замена ссылок**
- Все локальные ссылки к опубликованным файлам должны заменяться Telegraph URLs
- Независимо от уровня вложенности зависимости
- Независимо от порядка обработки файлов

**FR2: Использование кэша страниц**
- Механизм должен использовать `PagesCacheManager` как источник истины
- Поиск по абсолютному пути файла
- Высокая производительность за счет in-memory lookup

**FR3: Обратная совместимость**
- Существующая функциональность остается неизменной
- Никаких breaking changes в API
- Сохранение всех текущих возможностей

### Нефункциональные требования

**NFR1: Производительность**
- Время поиска URL для одной ссылки: <1ms
- Общее время замены для 100 ссылок: <100ms
- Не более 2x увеличения времени обработки

**NFR2: Надежность**
- 100% существующих тестов должны проходить
- 0 регрессий в функциональности
- Graceful fallback при отсутствии кэша

**NFR3: Maintainability**
- Код должен стать проще и понятнее
- Четкое разделение ответственности
- Comprehensive documentation

## Архитектурное решение

### Подход: Global Cache Lookup

**Выбор:** Refactor `replaceLinksWithTelegraphUrls()` для использования `PagesCacheManager`

**Преимущества:**
- ✅ Единый источник истины (cache)
- ✅ Высокая производительность (O(1) lookup)
- ✅ Минимальные изменения в коде
- ✅ Простота реализации и тестирования

### Изменения в коде

#### 1. Модификация сигнатуры метода

**Было:**
```typescript
private async replaceLinksWithTelegraphUrls(
  processed: ProcessedContent,
): Promise<ProcessedContent>
```

**Станет:**
```typescript
private async replaceLinksWithTelegraphUrls(
  processed: ProcessedContent,
  cacheManager?: PagesCacheManager
): Promise<ProcessedContent>
```

#### 2. Рефакторинг логики

**Новая логика:**
```typescript
private async replaceLinksWithTelegraphUrls(
  processed: ProcessedContent,
  cacheManager?: PagesCacheManager
): Promise<ProcessedContent> {
  // Early return if no cache manager
  if (!cacheManager) {
    return processed;
  }

  const linkMappings = new Map<string, string>();

  // Use global cache for all local links
  for (const link of processed.localLinks) {
    const telegraphUrl = cacheManager.getTelegraphUrl(link.resolvedPath);
    if (telegraphUrl) {
      linkMappings.set(link.originalPath, telegraphUrl);
    }
  }

  return ContentProcessor.replaceLinksInContent(processed, linkMappings);
}
```

#### 3. Обновление вызовов

**В publishWithMetadata() и editWithMetadata():**
```typescript
// Было
const processedWithLinks = withDependencies
  ? await this.replaceLinksWithTelegraphUrls(processed)
  : processed;

// Станет
const processedWithLinks = withDependencies
  ? await this.replaceLinksWithTelegraphUrls(processed, this.cacheManager)
  : processed;
```

## План тестирования

### Unit Tests

**UT1: Cache-aware link replacement**
- Mock `PagesCacheManager` с известными URLs
- Проверить корректность замены ссылок
- Валидировать fallback при отсутствии cache

**UT2: Performance tests**
- Измерить время lookup для различного количества ссылок
- Проверить отсутствие memory leaks
- Benchmark против старой реализации

### Integration Tests

**IT1: Multi-level dependency publishing**
```typescript
// Structure: root.md → chapter1.md → verse1.md
//                 → chapter2.md → verse2.md
//                               → verse3.md

// Test:
1. Publish root.md
2. Verify chapter1.md content has verse1.md → telegraph URL
3. Verify chapter2.md content has verse2.md,verse3.md → telegraph URLs
```

**IT2: Global link awareness**
```typescript
// Test:
1. Publish fileA.md (independent)
2. Publish fileB.md containing link to fileA.md  
3. Verify fileB.md content has fileA.md → telegraph URL
```

**IT3: Real-world scenario**
```typescript
// Test with user's exact structure:
// песнь1.md → 01.md → 01/01.01.01.md
1. Publish песнь1.md with full dependency tree
2. Verify 01.md contains telegraph URL for 01/01.01.01.md
```

### Regression Tests

**RT1: Existing functionality**
- Все текущие тесты должны проходить
- Никаких изменений в поведении root file link replacement
- Проверка backward compatibility

## Критерии приемки

### Acceptance Criteria

**AC1: Nested dependency link replacement** ✅
- GIVEN: Файл A ссылается на файл B, файл B ссылается на файл C
- WHEN: Публикуется файл A
- THEN: В опубликованном содержимом файла B ссылка на C заменена Telegraph URL

**AC2: Global link awareness** ✅  
- GIVEN: Файл X ссылается на файл Y, Y уже опубликован ранее
- WHEN: Публикуется файл X
- THEN: Ссылка на Y заменена Telegraph URL из cache

**AC3: Performance requirement** ✅
- GIVEN: 100 ссылок в файле
- WHEN: Выполняется замена ссылок
- THEN: Операция завершается менее чем за 100ms

**AC4: Backward compatibility** ✅
- GIVEN: Существующие тесты и функциональность
- WHEN: Применяется fix
- THEN: Все тесты проходят, функциональность не нарушена

**AC5: Error handling** ✅
- GIVEN: Отсутствует cache manager
- WHEN: Вызывается replaceLinksWithTelegraphUrls
- THEN: Метод возвращает unmodified content без ошибок

## Валидация решения

### Готовность к реализации

**Проверки перед началом:**
- [x] Техническая архитектура определена
- [x] API changes задокументированы  
- [x] Test plan создан
- [x] Performance requirements определены
- [x] Backward compatibility план готов

### Definition of Done

**Реализация считается завершенной когда:**
- [x] Код изменен согласно спецификации
- [x] Unit tests написаны и проходят
- [x] Integration tests созданы и проходят  
- [x] Performance tests пройдены
- [x] Все существующие тесты проходят
- [x] Code review завершен
- [x] Documentation обновлена 