# Task: Change Detection System Fix

## Task Information
- **ID**: 2025-08-06_TASK-001_change-detection-fix  
- **Title**: Fix Change Detection System in Telegraph Publisher
- **Created**: 2025-08-06_11-23
- **Status**: 🔴 VAN Phase (Active)
- **Priority**: High
- **Complexity**: Medium

## Problem Statement
Система обнаружения изменений в Telegraph Publisher работает некорректно:

1. **Неточная детекция изменений**: Система проверяет только наличие hash'а, но не сравнивает содержимое файлов, что приводит к пропуску обновлённых файлов
2. **Нерабочий флаг --force**: Флаг `--force` не распространяется на зависимости, показывая "(already have content hash)" даже при принудительном обновлении  
3. **Отсутствие валидации зависимостей**: В обычном режиме без --force система не проводит полную валидацию связанного контента

## User Requirements
1. Двойная проверка: дата обновления (mtime) + content hash для точной детекции изменений
2. Хранение дат создания и обновления в кэшах для быстрой первичной проверки
3. Корректная работа флага --force: принудительное обновление всех файлов в цепочке зависимостей
4. Полная валидация связанного контента в обычном режиме с обновлением только изменённых файлов

## Success Criteria
- ✅ Система точно определяет изменённые файлы по timestamp + hash
- ✅ Флаг --force корректно обновляет все зависимости  
- ✅ В обычном режиме валидируются все зависимости
- ✅ Обновляются только действительно изменённые файлы
- ✅ 85% test coverage для новой логики
- ✅ 100% test success rate

## Technical Context
- **Project**: Telegraph Publisher  
- **Core Files**: `EnhancedTelegraphPublisher.ts`, `AnchorCacheManager.ts`, `PublicationWorkflowManager.ts`
- **Framework**: TypeScript/Node.js with bun
- **Testing**: vitest framework 