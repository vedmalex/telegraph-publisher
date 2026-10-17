# Plan — TASK-035

## Overview


## Requirements (UR refs)


## Implementation Steps


## Dependencies


## Risks


## Preamble

Updated: 2026-07-17

## План (UR-002)

<!-- section:План (UR-002) -->

Цель: посадить IO-пути новых CLI-хендлеров TASK-034 (status directory-режим, config --set apply-путь) на DstIO-шов и обеспечить детерминированное DST-покрытие на MockDstIO (CD-63; закрытие части DST-debt из ISS-018). Ревизия 2 — учтены findings DA r02 (F-C1..F-C4, ISS-025…028).

Дизайн (паттерн — DependencyManager: опциональный dstIO с fallback на node:fs):
1. Новый модуль src/cli/CliStatusConfigOps.ts с IO-параметризованными функциями:
   - scanMarkdownFiles(dir, {recursive}, io?) — обход через io.readdir/io.stat (fallback fs), пропуски dot/node_modules/dist, СОРТИРОВКА имён для детерминизма.
   - computeFileStatus(path, io?) — чтение через io.readFile; классификация ПО ШАБЛОНУ DependencyManager.createNode dstIO-ветки (DependencyManager.ts:255-275): MetadataManager.parseMetadata(content) + validateMetadata → PUBLISHED/METADATA_CORRUPTED/NOT_PUBLISHED, catch → METADATA_MISSING. [F-C4: parse-from-content API СУЩЕСТВУЕТ — реплицировать именно этот прецедент, не выводить заново; поведение обоих сайтов классификации должно быть идентичным.]
   - applyConfigSet(dir, pairs, io?) — чтение/запись .telegraph-publisher-config.json через io + существующая чистая parseConfigSet. [F-C1, РЕШЕНИЕ по merge]: НЕ создаём новый генерический deep-merge и НЕ тянем IntelligentConfigMerger.deepMerge: apply-путь --set мержит ТОЛЬКО валидированные whitelisted-пути (узкая семантика per-path nested-object из текущего handleConfigCommand, EnhancedCommands.ts:750-763) — извлекается КАК ЕСТЬ в чистую функцию без изменения семантики. IntelligentConfigMerger.deepMerge остаётся единственным генерическим merge (hierarchical load); в коде новой функции — комментарий-граница почему генерик здесь не нужен.
   - ConfigManager/MetadataManager НЕ рефакторятся.
2. [F-C2, ОБЯЗАТЕЛЬНО] Обратная совместимость: EnhancedCommands.findMarkdownFiles(dir, recursive) и computeFileStatus ОСТАЮТСЯ статическими тонкими делегатами с СОХРАНЕНИЕМ текущих ПОЗИЦИОННЫХ сигнатур (real-fs default, без io-параметра) — потребители handleDirectoryReset (EnhancedCommands.ts:1056) и 2 позиционных теста (cli-fixes.test.ts:148,155) работают БЕЗ ИЗМЕНЕНИЙ. Перенос-без-обёртки запрещён.
3. handleStatusCommand/handleConfigCommand делегируют в новые функции без изменения поведения/вывода; все 19 тестов cli-fixes остаются зелёными БЕЗ правок ассертов (регресс-критерий).
4. Новые DST-тесты src/cli/CliStatusConfigOps.dst.test.ts на MockDstIO (seed 42):
   - status: in-memory дерево с ПОЛНЫМ покрытием ВСЕХ 4 статусов [F-C3]: PUBLISHED, NOT_PUBLISHED, METADATA_CORRUPTED (битый front-matter), METADATA_MISSING (файл исчез/нечитаем между листингом и чтением — io.readFile бросает DstError) + counts сводки; recursive vs non-recursive; пропуск node_modules;
   - config: существующий config с rateLimiting → applyConfigSet → соседние поля сохранены; отказ токенов; неверные ключи;
   - детерминизм: два прогона с одним seed → идентичные результаты и порядок;
   - существующие real-fs тесты cli-fixes остаются интеграционными.

Не-цели: рефакторинг links/cache/publisher (TASK-004 Phase 3), fault injection (Phase 5), env pinning (TASK-005), рефакторинг MetadataManager/ConfigManager/IntelligentConfigMerger.

Риски: (1) недетерминизм readdir — лечится обязательной сортировкой в scanMarkdownFiles; (2) поведенческая регрессия — гейтится зелёными тестами cli-fixes без правок + запретом переноса-без-обёртки [F-C2].

Исполнение: 1 единица, mb3-implementer model=opus; затем QA с DA-гейтом. DA-трейл: r02 REVISE (advisory, ISS-025…028) → ревизия 2 (этот текст) → re-gate.
