# TASK-021: Comprehensive Anchors, Headings & ToC System

**Task ID:** TASK-021  
**Date Created:** 2025-08-04_00-11  
**Priority:** High  
**Status:** 🔴 Not Started  
**Phase:** VAN Analysis  

## Overview

Комплексное решение трех взаимосвязанных критически важных проблем в системе обработки якорей, заголовков и автоматической генерации оглавления для Telegraph-Publisher. Задача включает три последовательные технические спецификации, которые должны быть реализованы поэтапно для обеспечения полной функциональности навигации в публикуемых статьях.

## Problem Statement

### Проблема 1: Неправильная генерация якорей (anchors)
Текущий механизм создания "slug" из заголовков в `LinkVerifier.ts` не соответствует спецификации `anchors.md`, что приводит к поломке валидации ссылок на заголовки.

### Проблема 2: Потеря якорей для H5/H6 заголовков  
Конвертация заголовков 5-го и 6-го уровней в параграфы (`<p>`) делает их некликабельными, что приводит к нерабочим ссылкам даже если валидация их пропускает.

### Проблема 3: Отсутствие автоматического оглавления (`<aside>`)
Упущенная возможность улучшения навигации, которая становится реализуемой после решения первых двух проблем.

## Technical Specifications

Задача включает три технические спецификации, которые должны быть реализованы последовательно:

1. **FEAT-ANCHOR-REFACTOR-001** - Корректная генерация якорей
2. **FEAT-HEADING-STRATEGY-001** - Улучшенная стратегия конвертации заголовков
3. **FEAT-ASIDE-TOC-GENERATION-001** - Автоматическая генерация оглавления

## Success Criteria

### Phase 1 (FEAT-ANCHOR-REFACTOR-001):
- ✅ Заголовок `"Мой якорь"` преобразуется в якорь `"Мой-якорь"`
- ✅ Заголовок `"Пример заголовка №1"` преобразуется в якорь `"Пример-заголовка-№1"`
- ✅ Регистр символов сохраняется: `"Section Title"` -> `"Section-Title"`
- ✅ Функция используется для валидации ссылок и генерации оглавления

### Phase 2 (FEAT-HEADING-STRATEGY-001):
- ✅ `##### Заголовок 5` преобразуется в `{ tag: 'h4', children: ['» Заголовок 5'] }`
- ✅ `###### Заголовок 6` преобразуется в `{ tag: 'h4', children: ['»» Заголовок 6'] }`
- ✅ Заголовки H1-H4 обрабатываются как раньше (H1-H3 -> `h3`, H4 -> `h4`)
- ✅ Все заголовки генерируют якоря на стороне Telegra.ph

### Phase 3 (FEAT-ASIDE-TOC-GENERATION-001):
- ✅ При наличии 2+ заголовков в начале страницы появляется блок `<aside>`
- ✅ Блок `<aside>` содержит неупорядоченный список (`<ul>`) ссылок
- ✅ Каждая ссылка указывает на правильный якорь из Phase 1
- ✅ Текст ссылок соответствует заголовкам с префиксами из Phase 2
- ✅ При <2 заголовках блок `<aside>` не создается

## Quality Assurance Requirements

- **Code Coverage:** 85% minimum
- **Test Success Rate:** 100%
- **Test Types:** Unit tests, integration tests, edge cases
- **Test Placement:** Colocated with source files
- **Specification Compliance:** Complete validation against all three technical specs

## File Modification Scope

### Files to be Modified:
- `src/links/LinkVerifier.ts` - Phase 1: Функция `generateSlug`
- `src/markdownConverter.ts` - Phase 2: Логика конвертации заголовков
- `src/markdownConverter.ts` - Phase 3: Добавление функции `generateTocAside`

### Test Files to be Created/Updated:
- `src/links/LinkVerifier.test.ts` - Тесты для корректной генерации якорей
- `src/markdownConverter.test.ts` - Тесты для новой стратегии заголовков и оглавления

## Dependencies and Constraints

- Должна использовать существующую структуру `TelegraphNode`
- Должна соответствовать API ограничениям Telegra.ph
- Должна сохранить обратную совместимость с существующими публикациями
- Реализация должна быть поэтапной для минимизации рисков

## Expected Deliverables

1. Обновленная функция `generateSlug` в `LinkVerifier.ts`
2. Новая стратегия конвертации заголовков в `markdownConverter.ts`
3. Функция автоматической генерации оглавления `generateTocAside`
4. Комплексный набор тестов с покрытием 85%+
5. Документация изменений в спецификациях

## Task Structure

```
📋 TASK-021: Comprehensive Anchors, Headings & ToC System
├── 🔍 Phase 1: VAN Analysis
├── 📝 Phase 2: PLAN Implementation Strategy  
├── 🎨 Phase 3: CREATIVE Design Decisions
├── ⚙️ Phase 4: IMPLEMENT (3 Sequential Sub-phases)
│   ├── Sub-phase 4.1: FEAT-ANCHOR-REFACTOR-001
│   ├── Sub-phase 4.2: FEAT-HEADING-STRATEGY-001
│   └── Sub-phase 4.3: FEAT-ASIDE-TOC-GENERATION-001
├── ✅ Phase 5: QA Comprehensive Testing
└── 🤔 Phase 6: REFLECT Documentation & Lessons
```

## Notes

Эта задача критически важна для улучшения навигации в публикуемых статьях и обеспечения корректной работы всех внутренних ссылок. Поэтапная реализация позволит тестировать каждый компонент отдельно и минимизировать риски поломки существующей функциональности.