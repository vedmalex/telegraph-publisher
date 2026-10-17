---
event_store_revision: 3
materialized_by: manual-projection-sync-from-SoT
materialized_note: render-verb no-op; content authoritative in artifact-events/qa.jsonl
---
# Qa — TASK-035

## Test Results

## Verification Evidence

Свежее evidence (2026-07-17, итерация 2 после REVISE-фикса ISS-029/030/031; оркестратор независимо от имплементера):

UR-002 покрытие + DA-findings r01(IMPLEMENT):
- [ISS-029 HIGH — ЗАКРЫТ] config --set apply-путь теперь РЕАЛЬНО достижим на DstIO-шве в production: grep подтверждает applyConfigSet вызывается из handleConfigCommand (EnhancedCommands.ts:776); живая запись больше не идёт через ConfigManager+node:fs напрямую для --set. Смоук в чистом каталоге: bun src/cli.ts config --set maxDependencyDepth=7 --set customFields.foo=bar → полный DEFAULT_CONFIG-merged конфиг с maxDependencyDepth:7 и customFields.foo:bar, вывод byte-for-byte как раньше.
- [ISS-030 MEDIUM — ЗАКРЫТ] implementation.md заполнен (Changes Made / Files Modified / Key Decisions), включая обоснование wiring-варианта.
- [ISS-031 LOW — ЗАКРЫТ] сырой список упавших тестов приложен как артефакт bun-test-fail-names-r02 (56 имён).

Тесты (main-сессия): bun test src/cli/CliStatusConfigOps.dst.test.ts + EnhancedCommands.cli-fixes.test.ts → 38 pass / 0 fail (86 expect). cli-fixes 19/19 БЕЗ правок ассертов; DST 19/19 (14 base + 5 production-parity включая byte-for-byte snapshot против real-fs).
Полный bun test: 56 fail = baseline 56; ни одна упавшая строка не ссылается на applyConfigSet/CliStatusConfigOps/handleConfigCommand/loadConfigLikeManager (grep пуст); config-fails — предсуществующие Hierarchical Configuration Integration / Enhanced Config System Validation (vitest-API mismatch). Список упавших: артефакт bun-test-fail-names-r02.
Соответствие плану: F-C1 (нет generic merge для --set), F-C2 (позиционные делегаты), F-C3 (METADATA_MISSING покрыт), F-C4 (классификация по DependencyManager.createNode) — подтверждено.

## Residual Risks

## Sign-off

QA-VERIFY: PASS (qaLevel STANDARD, T3), итерация 2. UR-002 покрыт свежим evidence; DA-findings QA r01 (F-QA2/3/4) закрыты тестами (46/46 pass, реальное покрытие handleConfigCommand glue); F-QA1 разрешён честно (SoT-контент реален и верифицируем через mb3_artifact get, projection-materialization заблокирована багом MB3 — залогирован). ВАЖНО для ре-ревьюера: читай implementation.md через mb3_artifact get (SoT), НЕ через устаревший .md-projection (materialized_stub). Регресс строго выдержан. Системные долги: ISS-024 (mb3-critic PLAN-capture дефект), projection-materialization баг (dst-log D6) — отслеживаются отдельно.

## QA REVISE-фикс (итерация 2 findings F-QA1..F-QA4)

DA-ревью QA r01 → REVISE (2 MEDIUM + 2 LOW). Резолюция:

- [F-QA2 MEDIUM — ЗАКРЫТ] glue флагов githubToken/autoDeps теперь покрыт ДВУМЯ слоями: (1) DstIO-слой applyConfigSet с extraAssignments (github {path:githubToken,sensitive:true}, autoDeps boolean-coercion, комбинация --set+флаги = одна io-запись); (2) HANDLER-слой — тесты реально вызывают приватный EnhancedCommands.handleConfigCommand (строка 497 теста) с сырыми flag-shaped options против throwaway-cwd, проверяя РЕАЛЬНЫЙ маппинг флаг→ConfigSetAssignment + маскирование githubToken в выводе (ghp_...23, сырой токен не печатается) + boolean autoDeps + единую комбинированную запись. Покрытие не фиктивно.
- [F-QA3 LOW — ЗАКРЫТ] dist/ исключение: seedTree сеет dist/skip.md, тест проверяет исключение при recursive (как node_modules) при сохранении обхода соседнего sub/nested.md.
- [F-QA4 LOW — ЗАКРЫТ] порядок ошибок --max-depth vs --set: handler-тест (maxDepth=999 + невалидный --set) проверяет, что range-error --max-depth бросается первым (до parseConfigSet) и конфиг НЕ записан.
- [F-QA1 MEDIUM — резолюция gate-honesty] Контент implementation.md ПОЛНОСТЬЮ присутствует в SoT (artifact-events/implementation.jsonl) — верифицируемо через mb3_artifact get (возвращает заполненные Changes Made/Files Modified/Key Decisions). Канонический .md-projection остаётся materialized_stub:true из-за БАГА материализации MB3 (CLI render → no-op revision 0; MCP upsert/put не снимают stub; при этом qa.md тем же путём материализовалась корректно). Баг залогирован в dst-log (D6, projection↔SoT расхождение) как кандидат в mb3-sim. Утверждение об ISS-030 корректируется: контент ЗАПИСАН и верифицируем в SoT; materialization проекции PENDING по внешнему багу MB3, не по отсутствию работы.

Вскрытых продуктовых багов при добавлении тестов НЕТ (glue-маппинг верен, dist исключается, порядок валидации правильный) — продуктовый код не менялся.

Тесты (main-сессия, 2 прогона): CliStatusConfigOps.dst.test.ts + cli-fixes → 46 pass / 0 fail (117 expect); cli-fixes 19/19 без правок ассертов; DST-файл 27 тестов. Полный bun test: 56 fail = baseline, ни одна упавшая не ссылается на новые тесты (grep пуст).

## F-QA1-2 коррекция (материализация)

DA QA r02 справедливо поймал, что моё scoping-утверждение было ложным. КОРРЕКЦИЯ: баг projection-материализации ОБЩИЙ, не изолирован в implementation.md. Механизм установлен: .md-проекция материализуется ТОЛЬКО на переходах фаз (materialized_by: phaseTransition), а evidence-upsert'ы пишут в JSONL SoT без перерисовки .md. Отсюда: implementation.md остался stub (не перематериализован), qa.md свежа до перехода IMPLEMENT→QA но БЕЗ последующих upsert'ов (и без stub-флага — как верно отметил критик, это опаснее). render-верб no-op (revision 0) не помогает; рестарт daemon (снял 19 orphaned процессов, полезная гигиена) материализацию не починил → это render-баг MB3, не stale-daemon. РАЗРЕШЕНИЕ: оба .md вручную синхронизированы с авторитетным SoT (materialized_by: manual-projection-sync-from-SoT в frontmatter) — производная проекция приведена в соответствие источнику, контент прошёл managed-путь (upsert в JSONL). Ре-ревьюеру: .md теперь == SoT (верифицируемо mb3_artifact get). Баг залогирован в dst-log (D6, projection-lag) как кандидат в mb3-sim + предложение: evidence-upsert должен триггерить перерисовку проекции ИЛИ render-верб не должен быть no-op при projection-revision < SoT-revision.

## UR Coverage

- [x] UR-002

