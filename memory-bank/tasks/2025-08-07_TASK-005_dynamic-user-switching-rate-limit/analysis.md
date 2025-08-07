# VAN Analysis: Dynamic User Switching on Rate-Limit

**Phase:** VAN (Value Analysis Network)
**Date:** 2025-08-07_00-49
**Complexity:** Medium-High

## 1. Требования и декомпозиция

### Основные требования (R1-R7):

**R1 (Core Storage):** Сохранение `accessToken` в YAML front-matter каждого файла
- **Затрагиваемые компоненты:** `FileMetadata` type, `MetadataManager`
- **Приоритет:** Высокий (Foundation для всей логики)

**R2 (Update Logic):** При обновлении существующего файла использовать `accessToken` из его front-matter
- **Затрагиваемые компоненты:** `EnhancedTelegraphPublisher.editWithMetadata`
- **Приоритет:** Высокий (Обеспечивает консистентность для существующих статей)

**R3 (Rate-Limit Handling - New Files):** При FLOOD_WAIT ошибке на новых файлах автоматически создавать новый аккаунт Telegraph
- **Затрагиваемые компоненты:** `EnhancedTelegraphPublisher.publishWithMetadata`
- **Приоритет:** Высокий (Ядро новой функциональности)

**R4 (Workflow Continuation):** После создания нового аккаунта повторить публикацию с новым токеном
- **Затрагиваемые компоненты:** `EnhancedTelegraphPublisher.publishWithMetadata`
- **Приоритет:** Высокий (Обеспечивает resilience workflow)

**R5 (State Management):** Новый `accessToken` становится активным для всех последующих новых публикаций
- **Затрагиваемые компоненты:** `EnhancedTelegraphPublisher`
- **Приоритет:** Средний (Определяет поведение после переключения)

**R6 (Constraint - No User Switching for Updates):** Переключение пользователей НЕ должно срабатывать для обновлений опубликованных файлов
- **Затрагиваемые компоненты:** `EnhancedTelegraphPublisher.editWithMetadata`
- **Приоритет:** Критический (Предотвращает смену автора существующего контента)

**R7 (Initial Token Source):** Для новых файлов без метаданных использовать `accessToken` из глобальной конфигурации
- **Затрагиваемые компоненты:** `EnhancedTelegraphPublisher.publishWithMetadata`, `ConfigManager`
- **Приоритет:** Высокий (Определяет стартовую точку workflow)

## 2. Анализ связности и зависимостей

### Карта связности компонентов:

```
R1 (Data Foundation) → R2 (Update Logic) + R4 (Save New Token)
R7 (Initial Token) → R3 (Rate-Limit Handling) 
R3 → R4 → R5 (State Management)
R2 → R6 (Constraint Logic)
```

### Последовательность реализации (по приоритету связности):

1. **Data Model Update (R1):** Модификация `FileMetadata` и `MetadataManager` для поддержки поля `accessToken`
2. **Update Logic (R2, R6):** Реализация логики в `editWithMetadata` для использования file-specific токена
3. **New Publication Logic (R7, R3, R4, R5):** Полная реализация user-switching механизма для новых файлов

## 3. Анализ неопределенностей и граничных случаев

### Неопределенность 1: Именование новых аккаунтов
**Решение:** Использовать инкрементальную схему (`Username-2`, `Username-3`) для ясности управления аккаунтами

### Неопределенность 2: Обработка ошибок создания аккаунта
**Решение:** Abort при неудаче `createAccount` для безопасности (низкая вероятность двух consecutive API failures)

### Неопределенность 3: Сохранение истории переключений
**Решение:** Добавить счетчик переключений в EnhancedTelegraphPublisher для генерации unique имен

## 4. Анализ сложности задачи

### Критерии сложности:
- **Объем спецификации:** Средний (7 требований с четкими границами)
- **Количество компонентов:** 4 основных компонента + интеграция
- **Плотность зависимостей:** Средняя (linear dependency chain)
- **Требования интеграции:** Средние (расширение существующего pipeline)
- **Технический охват:** Фокусированный (rate-limiting + metadata management)

### Оценка сложности: **MEDIUM-HIGH**
**Обоснование:** Задача не требует декомпозиции на sub-phases, но требует careful integration с существующим workflow

## 5. Техническое воздействие

### Модифицируемые файлы:
- `src/types/metadata.ts` - добавление `accessToken?: string` в `FileMetadata`
- `src/metadata/MetadataManager.ts` - обработка нового поля в parse/serialize
- `src/publisher/EnhancedTelegraphPublisher.ts` - основная логика переключения
- `src/config/ConfigManager.ts` - поддержка `accessToken` в `ExtendedConfig`

### Новые методы:
- `EnhancedTelegraphPublisher.createNewUserAndSwitch()` - private method для создания аккаунтов
- Модификация `publishWithMetadata()` - добавление try/catch для FLOOD_WAIT
- Модификация `editWithMetadata()` - временное переключение токенов

## 6. Критерии качества

### Функциональные критерии:
- Новые файлы содержат `accessToken` в front-matter после публикации
- Существующие файлы используют сохраненный `accessToken` при обновлении
- FLOOD_WAIT на новых файлах вызывает создание нового аккаунта
- Обновления существующих файлов НЕ вызывают переключение пользователя

### Технические критерии:
- Минимальное вмешательство в существующий код
- Backward compatibility с файлами без `accessToken`
- Graceful error handling для API failures
- Logging для отслеживания переключений пользователей

## 7. Интеграционные точки

### Интеграция с существующим кодом:
- **MetadataManager:** Расширение YAML parsing/serialization
- **EnhancedTelegraphPublisher:** Расширение error handling в publication methods
- **ConfigManager:** Использование существующего `accessToken` management
- **Rate Limiter:** Координация с существующим FLOOD_WAIT handling

### Сохранение совместимости:
- Файлы без `accessToken` продолжают работать с токеном из конфигурации
- Существующие API methods сохраняют свои signatures
- Existing tests остаются валидными

## 8. План тестирования

### Unit Tests:
- `MetadataManager` - parsing/serialization `accessToken` field
- `EnhancedTelegraphPublisher.createNewUserAndSwitch()` method
- Token switching logic в `publishWithMetadata` и `editWithMetadata`

### Integration Tests:
- End-to-end workflow с user switching
- Backward compatibility с файлами без `accessToken`
- Rate limit simulation и automatic recovery

### Edge Cases:
- Multiple consecutive FLOOD_WAIT errors
- Network failures во время `createAccount`
- Файлы с corrupted metadata containing `accessToken`

## Заключение

Задача имеет **medium-high complexity** но не требует декомпозиции на sub-phases. Четкая linear dependency chain позволяет поэтапную реализацию с минимальными рисками. Основной риск - правильная интеграция с существующим rate limiting механизмом без нарушения backward compatibility. 