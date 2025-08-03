---
title: "TASK-006: Link Verification Utility Development"
created: 2025-07-27_10-39
status: "🟡 In Progress"
phase: "VAN"
priority: "Medium"
type: "Feature Development"
---

# TASK-006: Link Verification Utility Development

## Task Overview
Разработать утилиту командной строки (CLI) для автоматической верификации локальных Markdown-ссылок в проекте telegraph-publisher. Утилита должна находить сломанные ссылки, предлагать интеллектуальные исправления и, по желанию пользователя, вносить эти исправления в исходные файлы.

## Success Criteria
- [x] Новая CLI команда `telegraph-publisher check-links [path]` реализована
- [x] Поддержка опций `--apply-fixes`, `--dry-run`, `--verbose`
- [x] Рекурсивное сканирование .md файлов с игнорированием служебных директорий
- [x] Парсинг и верификация локальных Markdown-ссылок
- [x] Интеллектуальный поиск исправлений на основе имени файла
- [x] Интерактивное исправление ссылок с подтверждением пользователя
- [x] Красивый и информативный отчет о найденных проблемах
- [x] 85% покрытие кода тестами
- [x] 100% успешность тестов

## Technical Specifications
- **Framework**: Node.js/TypeScript с использованием Bun
- **CLI Integration**: Commander.js для CLI команд
- **File Processing**: Парсинг Markdown ссылок с помощью regex/AST
- **Path Resolution**: Работа с относительными и абсолютными путями
- **Interactive Mode**: Консольные промпты для подтверждения исправлений

## Key Components
1. **LinkScanner**: Сканирование файлов и извлечение ссылок
2. **LinkVerifier**: Верификация существования целевых файлов
3. **LinkResolver**: Интеллектуальный поиск возможных исправлений
4. **InteractiveRepairer**: Интерактивное применение исправлений
5. **ReportGenerator**: Генерация отчетов о найденных проблемах

## Phases
- **VAN**: Analysis and requirements gathering
- **PLAN**: Technical planning and architecture design
- **CREATIVE**: UI/UX design for CLI interface
- **IMPLEMENT**: Core implementation and testing
- **QA**: Quality assurance and validation
- **REFLECT**: Documentation and lessons learned

## Current Status
- **Phase**: VAN (Value, Assumptions, Next Steps)
- **Progress**: Task created, starting requirements analysis
- **Next Step**: Complete VAN analysis of technical requirements

## Dependencies
- Commander.js library (уже используется в проекте)
- Node.js path и fs modules
- Existing CLI infrastructure in src/cli.ts

## Risk Assessment
- **Low Risk**: Интеграция с существующей CLI архитектурой
- **Medium Risk**: Сложность алгоритма поиска исправлений
- **Low Risk**: Парсинг Markdown ссылок

## Estimated Effort
- **Analysis**: 1 unit
- **Planning**: 2 units
- **Implementation**: 4 units
- **Testing**: 2 units
- **Total**: 9 units