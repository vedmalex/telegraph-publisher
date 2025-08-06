# Task: Publication Pipeline Link Replacement Fix

**Task ID:** 2025-08-06_TASK-004_publication-pipeline-link-replacement-fix  
**Created:** 2025-08-06_17-12  
**Status:** 🟡 Active  
**Phase:** CREATIVE (Completed) → Ready for IMPLEMENT

## Problem Description

При публикации корневого файла (например, `песнь1.md`) с зависимостями через команду `telegraph-publisher publish`, ссылки внутри файлов-зависимостей не заменяются соответствующими Telegraph URL перед публикацией. Это приводит к ошибке валидации "Content validation failed: Unpublished dependencies".

## Updated Analysis Results (VAN Phase)

**Critical Discovery:** Проблема глубже изначального предположения. Замена ссылок НЕ РАБОТАЕТ вообще для всех файлов (не только зависимостей), несмотря на то, что код выглядит правильным.

**Evidence:** JSON отладочные файлы содержат локальные ссылки:
- `01.json`: `"href": "01/01.01.01.md"`  
- `песнь1.json`: `"href": "01.md"`

**Root Cause:** Один из компонентов в цепочке ContentProcessor → LinkResolver → CacheManager не функционирует корректно.

## Plan Summary (PLAN Phase)

Создан детальный иерархический план диагностики из 15 пунктов:

1. **Диагностика системы замены ссылок** (6 подпунктов)
   - Исследование ContentProcessor.processFile
   - Исследование replaceLinksWithTelegraphUrls
   - Анализ состояния PagesCacheManager

2. **Создание диагностических тестов** (4 подпункта)
   - Минимальный репродукционный тест
   - Юнит-тесты компонентов

3. **Исправление выявленных проблем** (3 подпункта)
   - По результатам диагностики

4. **Валидация исправлений** (2 подпункта)
   - Регрессионное тестирование

## Creative Design Summary (CREATIVE Phase)

**Архитектурное решение:** **Diagnostic-First Strategy**

### Root Cause Hypothesis Matrix:
| Component | Issue | Probability |
|-----------|-------|-------------|
| **replaceLinksWithTelegraphUrls** | Method not executing | 🔴 High |
| **PagesCacheManager** | Empty/corrupt cache | 🔴 High |
| **ContentProcessor.processFile** | localLinks array empty | 🟡 Medium |
| **Timing/Order** | Cache populated after replacement | 🟡 Medium |

### Diagnostic Architecture:
- **"Breadcrumb Trail Approach"** - Instrument each step 
- **LinkProcessingTracer** - Complete audit trail interface
- **Minimal Reproduction Framework** - Controlled test environment

### Implementation Strategy:
1. **Phase 1: Quick Diagnostic** (1-2h) - Enhanced logging + minimal reproduction
2. **Phase 2: Targeted Fix** (2-4h) - Based on root cause findings  
3. **Phase 3: Long-term** - Improved error handling and diagnostics

**Decision Matrix Winner:** Enhanced logging (Low risk, quick results, medium effectiveness)

## Success Criteria

- ✅ Все файлы (корневые и зависимости) проходят единый конвейер публикации
- ✅ Ссылки корректно заменяются во всех файлах независимо от их позиции в дереве зависимостей
- ✅ Команда `telegraph-publisher publish --file песнь1.md --force` успешно завершается
- ✅ Опубликованные зависимости содержат Telegraph URL вместо локальных ссылок

## Technical Requirements

- Диагностика и исправление системы замены ссылок
- Создание репродукционных тестов
- Обеспечение консистентности между publishWithMetadata и editWithMetadata
- Сохранение существующего механизма предотвращения рекурсии
- Покрытие тестами для предотвращения регрессий 