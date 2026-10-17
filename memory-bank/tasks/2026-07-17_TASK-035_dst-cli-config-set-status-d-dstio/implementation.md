---
materialized_by: manual-projection-sync-from-SoT
materialized_note: render-verb no-op (revision 0); content authoritative in artifact-events/implementation.jsonl (+ legacy implementation.evidence.jsonl sidecar from a failed put — UR Coverage section); synced to match SoT for gate-readability
---
# Implementation — TASK-035

## Changes Made

Итерация 2 (REVISE-фикс ISS-029 HIGH): config --set apply-путь посажен на DstIO-шов в PRODUCTION (ранее applyConfigSet был определён и покрыт DST-тестами, но не вызывался — живая запись шла через ConfigManager+node:fs).

- src/cli/CliStatusConfigOps.ts: добавлен loadConfigLikeManager(dir, io?) — io-параметризованное зеркало ConfigManager.loadConfig/loadHierarchicalConfigSync (single-file read → IntelligentConfigMerger.deepMerge поверх свежего DEFAULT_CONFIG, те же override-диагностики и parse-warn, fallback DEFAULT_CONFIG). applyConfigSet расширен до (dir, pairs, io?, extraAssignments?): parse --set → concat [...pairs, ...extraAssignments] (порядок сохранён) → guarded load#1 (только при наличии --set пар, зеркалит старое поведение) → fold mergeConfigSetAssignments → load#2 + shallow-spread + io-write. Убрано старое разреженное raw-чтение (источник byte-дивергенции).
- src/cli/EnhancedCommands.ts: handleConfigCommand заменил ветку ConfigManager.loadConfig/mergeConfigSetAssignments/updateMetadataConfig на построение extraAssignments из флагов (--username/--github-token/--max-depth[валидация 1-20]/--auto-deps) + один вызов applyConfigSet(directory, setPairs, undefined, extraAssignments). Пользовательский вывод (✅ Configuration saved/updated, 📝 Applied settings) byte-for-byte идентичен, тот же порядок.
- src/cli/CliStatusConfigOps.dst.test.ts: новый describe «production path (handleConfigCommand parity)» (5 тестов) гоняет реально достижимый production-путь, включая byte-for-byte snapshot против реального fs-прогона и single-write assertion через io.ops.

## Files Modified

- src/cli/CliStatusConfigOps.ts (НОВЫЙ, TASK-035): scanMarkdownFiles, computeFileStatus, mergeConfigSetAssignments, applyConfigSet, loadConfigLikeManager — io-параметризованный DstIO-шов.
- src/cli/CliStatusConfigOps.dst.test.ts (НОВЫЙ): 19 тестов MockDstIO seed 42 (14 base + 5 production-parity).
- src/cli/EnhancedCommands.ts: findMarkdownFiles/computeFileStatus → тонкие позиционные делегаты; handleStatusCommand → scanMarkdownFiles/computeFileStatus; handleConfigCommand --set → applyConfigSet (production wiring).
- (из TASK-034, в том же дереве, не относится к scope 035: src/cli.ts, src/svg/SvgGenerator.ts.)

## Key Decisions

1. [F-C1] applyConfigSet НЕ вводит новый generic deep-merge для --set-путей: whitelisted/pre-validated per-path assignments мержатся узкой семантикой mergeConfigSetAssignments (извлечена verbatim из старого handleConfigCommand). IntelligentConfigMerger.deepMerge используется ТОЛЬКО в loadConfigLikeManager для воспроизведения DEFAULT_CONFIG-merge (паритет с ConfigManager), не для --set-значений.
2. [F-C2] EnhancedCommands.findMarkdownFiles/computeFileStatus сохранили позиционные сигнатуры как тонкие делегаты — handleDirectoryReset и позиционные cli-fixes тесты (148/155) не тронуты.
3. [ISS-029 отклонение→разрешено] Первая итерация делегировала только merge-fold (applyConfigSet не был production-wired). Итерация 2: выбран вариант A (wire) с extraAssignments — non-set флаги конвертируются в те же per-path assignments и складываются в ЕДИНУЮ io-seated запись; ConfigManager не рефакторится (запрет плана); вывод и содержимое конфига byte-for-byte идентичны легаси (включая дублированные override-диагностики от двух load-вызовов).
4. [F-C4] computeFileStatus классифицирует по шаблону DependencyManager.createNode dstIO-ветки (255-275) — поведение идентично.
5. Микро-краевой случай (untested, вывод не изменён): при одновременно невалидных --max-depth и --set первым бросается --max-depth range-error (флаги валидируются до parseConfigSet).

## Commit Trail

Не закоммичено (решение о коммите — за пользователем). Итерация 2 завершена: ISS-029/030/031 закрыты, IMPLEMENT-гейт PROCEED.

## Реализация и UR Coverage

Исполнитель: mb3-implementer (opus); оркестраторская верификация выполнена (bun test повторён из main-сессии).

Правки:
- НОВЫЙ src/cli/CliStatusConfigOps.ts: scanMarkdownFiles(dir,{recursive},io?) — DstIO-first readdir/stat с node:fs fallback, пропуски dot/node_modules/dist, лексикографическая сортировка (детерминизм); computeFileStatus(path,io?) — классификация по шаблону DependencyManager.createNode dstIO-ветки (parseMetadata+validateMetadata → PUBLISHED/METADATA_CORRUPTED/NOT_PUBLISHED, catch → METADATA_MISSING); mergeConfigSetAssignments — узкий per-path merge, извлечённый verbatim из handleConfigCommand, с комментарием-границей (без generic deep-merge/IntelligentConfigMerger, F-C1); applyConfigSet(dir,pairs,io?) — io-чтение/запись конфига + parseConfigSet.
- src/cli/EnhancedCommands.ts: findMarkdownFiles/computeFileStatus — тонкие делегаты с СОХРАНЁННЫМИ позиционными сигнатурами (F-C2, handleDirectoryReset и позиционные тесты не тронуты); handleConfigCommand --set делегирует в shared mergeConfigSetAssignments.
- НОВЫЙ src/cli/CliStatusConfigOps.dst.test.ts: MockDstIO seed 42, 14 тестов — все 4 статуса (вкл. METADATA_MISSING, F-C3), recursive/non-recursive, пропуски, сортировка, config sibling-preservation, отказ токенов/неверных ключей без записи, двухпрогонный детерминизм.

Отклонение от плана (принято оркестратором): handleConfigCommand делегирует в shared-core mergeConfigSetAssignments, а не в applyConfigSet напрямую — combinable-опции config (--set вместе с --username и т.п.) требуют единой записи через ConfigManager; семантика идентична (общее ядро), вывод byte-for-byte, DstIO-покрытие apply-пути обеспечено через applyConfigSet в DST-тестах.

UR Coverage:
- UR-001 (superseded by UR-002): покрыт через UR-002.
- UR-002 (DstIO-шов + детерминированные тесты + закрытие DST-debt ISS-018 для этих хендлеров): ВЫПОЛНЕН — шов реализован, 14 DST-тестов на MockDstIO, DST-debt по status/config закрыт.

Верификация (свежая, main-сессия): CliStatusConfigOps.dst.test.ts 14/14 pass; EnhancedCommands.cli-fixes.test.ts 19/19 pass БЕЗ правок ассертов; SvgGenerator.test.ts 0 fail; полный bun test — 56 предсуществующих падений, diff множества упавших имён с baseline (чистый revert-прогон имплементера) ПУСТ — новых падений нет.

## UR Coverage

- [x] UR-001
- [x] UR-002

