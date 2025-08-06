# Change Detection System Requirements Specification

## Version 1.0  
**Task ID**: 2025-08-06_TASK-001_change-detection-fix  
**Created**: 2025-08-06_11-23  
**Status**: Active

## 1. Executive Summary

Система обнаружения изменений в Telegraph Publisher работает некорректно, что приводит к пропуску обновлённых файлов и неправильной работе флага `--force`. Требуется реализация двухэтапной системы валидации (timestamp + hash) для точного определения изменений и корректной работы принудительного обновления.

## 2. Problem Statement from User Logs

### 2.1 Observed Issues

#### Issue 1: Изменённые файлы не обнаруживаются
```
ℹ️ ⭐️ Skipping '01.md' (content hash already present)  
ℹ️ ⭐️ Skipping '00.сюжетная арка.1.md' (content hash already present)
ℹ️ ⭐️ Skipped 51 dependencies (already have content hash)
```

**Problem**: Пользователь изменил файлы, но система показывает "content hash already present" и пропускает обновление.

#### Issue 2: Флаг --force не работает
```
Generated code
ℹ️ ⭐️ Skipped 51 dependencies (already have content hash)
```

**Problem**: Даже с флагом `--force` зависимости показывают "(already have content hash)" вместо принудительного обновления.

### 2.2 Root Cause Analysis  

1. **Неточная логика детекции**: Система проверяет только *наличие* hash'а, но не *содержимое*
2. **Отсутствие timestamp проверки**: Нет первичной проверки времени изменения файла
3. **Неправильная передача --force**: Флаг не распространяется на зависимости

## 3. Functional Requirements

### FR-001: Двойная проверка изменений (КРИТИЧНО)
**Описание**: Система ДОЛЖНА использовать двухэтапную проверку для определения изменений:
1. **Первичная проверка**: Сравнение mtime (время модификации файла)
2. **Вторичная проверка**: Сравнение content hash (только при изменении mtime)

**Acceptance Criteria**:
- ✅ При неизменном mtime файл пропускается без расчёта hash
- ✅ При изменном mtime выполняется расчёт и сравнение hash
- ✅ Файл обновляется только при изменении hash (после изменения mtime)

### FR-002: Корректная работа флага --force (КРИТИЧНО)
**Описание**: Флаг `--force` ДОЛЖЕН принудительно обновлять все файлы в цепочке зависимостей.

**Acceptance Criteria**:
- ✅ `--force` применяется к основному файлу
- ✅ `--force` распространяется на все зависимости  
- ✅ При `--force` пропускаются все проверки timestamp и hash
- ✅ Логи показывают "Force republication" вместо "already have content hash"

### FR-003: Полная валидация зависимостей (КРИТИЧНО)
**Описание**: В обычном режиме (без --force) система ДОЛЖНА валидировать все зависимости.

**Acceptance Criteria**:
- ✅ Проверяются все файлы в дереве зависимостей
- ✅ Применяется двойная проверка (mtime + hash) к каждому файлу
- ✅ Обновляются только действительно изменённые файлы
- ✅ Неизменённые файлы корректно пропускаются с информативными сообщениями

### FR-004: Хранение timestamp в кэше (ВЫСОКИЙ ПРИОРИТЕТ)
**Описание**: Кэш ДОЛЖЕН хранить дату создания и дату обновления для быстрой валидации.

**Acceptance Criteria**:
- ✅ В кэше сохраняется mtime для каждого файла
- ✅ Реализована обратная совместимость с существующими кэшами
- ✅ Автоматическая миграция кэша без потери данных

## 4. Technical Requirements

### TR-001: Performance Requirements
- **Primary Check**: Timestamp validation < 1ms per file
- **Secondary Check**: Hash calculation only when timestamp changed
- **Cache Migration**: Automatic, zero-downtime upgrade
- **Error Recovery**: < 100ms fallback for failed operations

### TR-002: API Requirements
```typescript
interface ChangeDetectionAPI {
  shouldRepublish(filePath: string, forceContext: ForceContext): Promise<RepublishDecision>;
  validateWithResilience(filePath: string): Promise<ValidationResult>;
  propagateForceFlag(parentForce: boolean, depth: number): ForceContext;
}
```

### TR-003: Cache Schema Enhancement
```typescript
interface EnhancedCacheEntry {
  contentHash: string;
  anchors: string[];
  mtime: string;        // NEW: File modification time  
  createdAt: string;    // NEW: Entry creation timestamp
  version: string;      // NEW: Schema version for migration
}
```

## 5. Quality Requirements

### QR-001: Test Coverage Requirements
- **Unit Tests**: 85% minimum coverage для новой логики
- **Integration Tests**: Все сценарии user workflow
- **Regression Tests**: Сохранение существующей функциональности
- **Performance Tests**: Валидация performance targets

### QR-002: Reliability Requirements  
- **Accuracy**: 100% точность определения изменений
- **Force Propagation**: 100% надёжность работы --force флага
- **Data Integrity**: 0% потери данных при миграции кэша
- **Error Handling**: Graceful degradation при ошибках файловой системы

### QR-003: Compatibility Requirements
- **Backward Compatibility**: Поддержка существующих кэш-файлов
- **API Compatibility**: Сохранение существующих CLI интерфейсов
- **Node.js Compatibility**: Работа с текущей версией Node.js
- **TypeScript Compatibility**: Строгая типизация для всех новых API

## 6. User Experience Requirements

### UX-001: Informative Logging
```bash
# Желаемый вывод для --force
🔄 FORCE: Republishing 'example.md' (force flag enabled)
🔄 FORCE: Republishing dependency '01.md' (force propagated)

# Желаемый вывод для обычного режима  
⚡ UNCHANGED: Skipping 'example.md' (mtime: unchanged)
🔄 CHANGED: Republishing 'modified.md' (content hash changed)
📝 TIMESTAMP: Checking 'touched.md' (mtime changed, hash unchanged)
```

### UX-002: Progress Indicators
- Чёткие индикаторы процесса для больших проектов
- Разделение на "fast path" и "validation path"  
- Прозрачная отчётность по каждому файлу

## 7. Success Metrics

### Primary Success Criteria:
1. **Accurate Detection**: Все изменённые файлы корректно обнаруживаются
2. **Force Respect**: Флаг --force работает для всех файлов в цепочке
3. **Performance**: ≥99% файлов проходят fast path (timestamp only)
4. **Zero Regression**: Все существующие workflow продолжают работать

### Secondary Success Criteria:
1. **User Satisfaction**: Интуитивное поведение системы
2. **Developer Experience**: Чёткие логи и error messages
3. **Maintainability**: Простота добавления новых типов валидации
4. **Extensibility**: Готовность к будущим enhancement'ам

## 8. Implementation Constraints

### Technical Constraints:
- Сохранение существующей архитектуры Telegraph Publisher
- Использование TypeScript с строгой типизацией
- Минимальные изменения в public API
- Поддержка всех существующих CLI флагов

### Quality Constraints:
- Код и комментарии только на английском языке
- Использование vitest для тестирования
- Покрытие кода не менее 85%
- Все тесты должны проходить на 100%

---

*Данная спецификация базируется на реальных проблемах пользователя и предоставляет чёткие критерии для валидации исправлений.* 