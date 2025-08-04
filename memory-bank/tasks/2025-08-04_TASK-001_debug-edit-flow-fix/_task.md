# Task: Fix Debug Edit Flow

**Task ID**: 2025-08-04_TASK-001_debug-edit-flow-fix  
**Created**: 2025-08-04_15-29  
**Status**: Active  
**Phase**: VAN

## Problem Description
При выполнении команды `publish --debug --force` для уже опубликованного файла, отладочный JSON-файл не создается. Проблема в том, что логика сохранения debug JSON присутствует только в `publishWithMetadata`, но отсутствует в `editWithMetadata`.

## Root Cause Analysis
1. Команда с `--force` корректно пропускает link verification
2. Для уже опубликованного файла вызывается `editWithMetadata` вместо `publishWithMetadata`
3. В `editWithMetadata` отсутствует блок кода для сохранения debug JSON файла

## Technical Specification Reference
- **Spec ID**: FIX-DEBUG-EDIT-FLOW-001
- **Target File**: `src/publisher/EnhancedTelegraphPublisher.ts`
- **Target Method**: `editWithMetadata`

## Success Criteria
1. Команда `--debug --force` должна создавать JSON файл для уже опубликованных файлов
2. Команда `--debug` должна по-прежнему работать для новых файлов
3. В обоих случаях должен выполняться dry run без реальных запросов к API

## Current Phase Objectives
- Провести детальный анализ кода
- Подтвердить местоположение проблемы
- Создать план исправления