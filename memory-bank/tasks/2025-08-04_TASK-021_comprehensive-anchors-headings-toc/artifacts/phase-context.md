# Integrated Phase Context - TASK-021

## User Specifications Summary

**Source**: Подробный пользовательский анализ в виде трех технических спецификаций
**Date**: 2025-08-04_00-11
**Priority**: High (критически важные проблемы навигации)

### Key Requirements:
1. **Корректная генерация якорей**: Исправить `generateSlug` для соответствия `anchors.md`
2. **Сохранение якорей H5/H6**: Конвертировать H5/H6 в `h4` с префиксами вместо `<p>`  
3. **Автоматическое оглавление**: Генерировать `<aside>` блоки для навигации

### Constraints:
- Должна быть поэтапная реализация (3 последовательные спецификации)
- Обратная совместимость с существующими публикациями
- Использование только тегов, поддерживаемых Telegra.ph API
- Минимизация breaking changes

## Previous Phase Results

### VAN Analysis: [✅ Complete]
- **Current Architecture**: Полный анализ LinkVerifier.ts и markdownConverter.ts
- **Problem Confirmation**: Все три проблемы подтверждены и локализованы
- **Technical Feasibility**: Все спецификации технически осуществимы
- **Risk Assessment**: Минимальные риски, четкие стратегии митигации
- **API Compatibility**: Telegraph API поддерживает все необходимые теги
- **Performance Impact**: Ожидаемое влияние <5ms для ToC генерации

### Plan Decisions: [✅ Complete]
- **Иерархический план**: 23 конкретные задачи в 7 основных блоков
- **Последовательная реализация**: FEAT-ANCHOR-REFACTOR-001 → FEAT-HEADING-STRATEGY-001 → FEAT-ASIDE-TOC-GENERATION-001
- **Временные оценки**: ~13 часов общего времени реализации
- **Стратегия тестирования**: Comprehensive test coverage для каждой спецификации
- **Quality Assurance**: 85% покрытие кода, 100% успешность тестов
- **Risk Mitigation**: Поэтапное тестирование, backwards compatibility проверки

### Creative Choices: [✅ Complete]
- **Pure Function Pattern**: Для anchor generation - predictable, testable
- **Strategy Pattern**: Для heading conversion с visual hierarchy preservation
- **Functional Pipeline**: Для ToC generation с separation of concerns
- **Shared Utility Pattern**: Для cross-component consistency
- **Graceful Degradation**: Для error handling без breaking поведения
- **Additive Changes**: Для backwards compatibility preservation

## Current Phase Objectives

**Phase**: IMPLEMENT (Implementation & Development)
**Goals**: 
- Реализовать три технические спецификации поэтапно
- Создать comprehensive test coverage для всех компонентов
- Обеспечить quality assurance с 85% покрытием кода
- Валидировать backwards compatibility и performance

**Success Criteria**:
- ✅ FEAT-ANCHOR-REFACTOR-001 полностью реализован и протестирован
- ✅ FEAT-HEADING-STRATEGY-001 полностью реализован и протестирован  
- ✅ FEAT-ASIDE-TOC-GENERATION-001 полностью реализован и протестирован
- ✅ Cross-specification integration протестирована
- ✅ Quality assurance requirements выполнены (85% coverage, 100% tests pass)

## Implementation Strategy Context

### Sequential Dependencies:
```
Phase 1: generateSlug fix (anchor generation)
    ↓ (provides correct anchor algorithm)
Phase 2: H5/H6 strategy (heading conversion)  
    ↓ (provides linkable headings for all levels)
Phase 3: ToC generation (uses phases 1+2)
```

### Risk Mitigation:
- Поэтапное тестирование после каждой спецификации
- Сохранение существующего поведения для совместимости
- Comprehensive test coverage для предотвращения регрессий

### Quality Assurance Focus:
- Validation против трех технических спецификаций
- Performance testing (ToC generation не должно замедлить конвертацию)
- Compatibility testing с существующими markdown файлами
- Edge case coverage (пустые заголовки, спецсимволы, etc.)

## Technical Architecture Context

### Core Files Analysis Needed:
- `src/links/LinkVerifier.ts` - Current `generateSlug` implementation  
- `src/markdownConverter.ts` - Current heading conversion logic
- `anchors.md` - Telegraph anchor specification requirements
- Existing test files for understanding current test patterns

### Integration Points:
- LinkVerifier использует `generateSlug` для валидации
- markdownConverter создает TelegraphNode структуры
- ToC generation должен использовать те же алгоритмы что и LinkVerifier

### API Constraints (Telegraph):
- Поддерживаемые теги: `h3`, `h4`, `p`, `strong`, `em`, `a`, `aside`, `ul`, `li`
- Anchor format requirements from `anchors.md`
- Node structure requirements for `TelegraphNode`

## Next Steps for VAN Phase

1. **Analyze Current Implementation**:
   - Read and understand `LinkVerifier.ts` current `generateSlug`
   - Read and understand `markdownConverter.ts` heading logic
   - Read `anchors.md` specification requirements

2. **Identify Integration Points**:
   - How `generateSlug` is used throughout codebase
   - Dependencies between LinkVerifier and markdownConverter
   - Potential conflicts with existing functionality

3. **Assess Technical Feasibility**:
   - Telegraph API limitations for supported tags
   - Performance implications of ToC generation
   - Memory and complexity considerations

4. **Risk Assessment**:
   - Breaking changes potential
   - Backwards compatibility challenges  
   - Test coverage gaps that need addressing

5. **Create Comprehensive Analysis Document**:
   - Technical architecture analysis
   - Risk assessment and mitigation strategies
   - Detailed implementation recommendations
   - Testing strategy for all three phases

## Success Validation Criteria

The VAN phase will be considered complete when:
- ✅ Complete technical understanding of current system documented
- ✅ All three specifications validated against technical constraints
- ✅ Risk assessment completed with mitigation strategies
- ✅ Clear implementation path defined for all three phases
- ✅ Testing strategy established for comprehensive coverage