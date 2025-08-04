# Task: Fix Debug JSON Creation When Content Hash Unchanged

**Task ID**: 2025-08-04_TASK-002_debug-hash-skip-fix  
**Created**: 2025-08-04_15-48  
**Status**: Active  
**Phase**: VAN

## Problem Description
При использовании команды `--debug --force` с существующими файлами, у которых контент не изменился, JSON файл не создается. Это происходит из-за того, что проверка hash контента вызывает ранний возврат из функции, минуя логику создания Telegraph nodes и debug JSON.

## Real-World Example
**Команда**: 
```bash
telegraph-publisher publish --author "Веданта-крит дас" --file index.md --token xxx --debug --force
```

**Результат**: 
```
📄 Content unchanged. Skipping publication of index.md.
✅ Updated successfully!
```
**Проблема**: JSON файл НЕ создается, хотя `--debug` флаг указан.

## Root Cause Analysis
В методе `editWithMetadata` (строки 350-366):
1. Проверяется hash контента
2. Если контент не изменился, происходит ранний возврат
3. Debug логика (строки 395-404) НЕ выполняется
4. JSON файл НЕ создается

## Secondary Issue
Также обнаружена проблема с генерацией hash anchors в ссылках, вызывающая ошибки broken links verification.

## Expected Behavior
При использовании `--debug` флага, JSON файл должен создаваться ВСЕГДА, независимо от того, изменился контент или нет, так как цель debug режима - получить Telegraph nodes для отладки.

## Success Criteria
1. JSON файл создается при `--debug --force` даже для неизмененного контента
2. Исправлены проблемы с hash anchor генерацией
3. Debug режим работает консистентно во всех сценариях