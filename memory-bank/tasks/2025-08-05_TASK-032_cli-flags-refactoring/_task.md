# Task Definition - CLI Flags Refactoring

**Task ID:** TASK-032
**Created:** 2025-08-05_11-55
**Status:** Active
**Current Phase:** IMPLEMENT

## Task Description

Рефакторинг CLI-флагов и настроек по умолчанию для утилиты `telegraph-publisher` с тремя ключевыми улучшениями:

1. **Унификация флагов принудительного выполнения**: Объединение функциональности флагов `--force` и `--force-republish` в один флаг `--force`
2. **Распространение флагов на зависимости**: Обеспечение применения флагов `--force` и `--debug` ко всей цепочке зависимостей
3. **Обновление настроек по умолчанию**: Изменение `maxDependencyDepth` с `1` на `20`

## Complexity Assessment
- **Specification Volume**: Высокий - детальное техническое задание с множественными требованиями
- **Component Count**: Средний - затрагивает 4 основных файла с взаимосвязанными изменениями
- **Dependency Density**: Высокий - изменения в CLI влияют на workflow и publisher
- **Technical Scope**: Средний - CLI рефакторинг, настройки конфигурации, распространение опций

**Complexity Conclusion**: MEDIUM COMPLEXITY - стандартная обработка без декомпозиции

## Affected Files
- `src/config/ConfigManager.ts`
- `src/cli/EnhancedCommands.ts`
- `src/workflow/PublicationWorkflowManager.ts`
- `src/publisher/EnhancedTelegraphPublisher.ts`

## Success Criteria
1. Флаг `--force-republish` удален, функциональность объединена с `--force`
2. Флаги `--force` и `--debug` применяются ко всей цепочке зависимостей
3. `maxDependencyDepth` по умолчанию установлен в 20
4. Все существующие тесты проходят
5. Новые тесты покрывают изменения функциональности
6. Критическое требование: `--force` использует путь редактирования для существующих страниц

## Phase History
- **VAN**: ✅ Completed (2025-08-05_11-55) - Comprehensive analysis with medium complexity assessment
- **PLAN**: ✅ Completed (2025-08-05_11-55) - 23-task hierarchical implementation plan created
- **CREATIVE**: ✅ Completed (2025-08-05_11-55) - Complete architectural design with implementation patterns
- **IMPLEMENT**: 🟡 Ready to Start - All architectural patterns designed, ready for implementation
- **QA**: 🔴 Not Started
- **REFLECT**: 🔴 Not Started

## VAN Analysis Summary
- **Complexity**: Medium - standard workflow without sub-phase decomposition
- **Technical Gaps Identified**: 3 main gaps mapped to requirements
- **File Dependencies**: Clear interaction patterns between 4 core files
- **Risk Assessment**: Medium risk with comprehensive mitigation strategies
- **Implementation Strategy**: Standard workflow recommended over fast-track

## PLAN Phase Summary
- **Implementation Plan**: 23 hierarchical tasks across 9 main sections
- **Risk Mitigation**: Progressive layer-by-layer approach (Config → CLI → Workflow → Publisher)
- **Task Dependencies**: Clear dependency chain with safe implementation order
- **Test Strategy**: Comprehensive coverage with unit, integration, and regression tests
- **Agreement Compliance**: All plan elements validated against user specifications

## CREATIVE Phase Summary
- **Architectural Design**: Complete interface and class design with implementation patterns
- **Core Components**: PublishDependenciesOptions, DeprecatedFlagError, OptionsPropagationChain
- **Design Patterns**: Options Object, Validator, Builder, Middleware, Factory, Error-First patterns
- **User Experience**: Migration guidance with friendly error messages
- **Implementation Guidelines**: Complete coding standards and organization principles 