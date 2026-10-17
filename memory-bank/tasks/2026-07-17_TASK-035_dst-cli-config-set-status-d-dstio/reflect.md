# Reflect — TASK-035

## Lessons

<!-- section:Lessons -->

TASK-035 REFLECT (T3, DstIO-обвязка CLI-хендлеров):

Технические:
1. DstIO-шов по паттерну DependencyManager (опциональный io с node:fs fallback) масштабируется на CLI-хендлеры без рефакторинга ConfigManager/MetadataManager — извлечение IO-логики в отдельный модуль (CliStatusConfigOps) + тонкие позиционные делегаты для обратной совместимости (F-C2).
2. Классификацию статуса файла реплицировать из ЕДИНОГО прецедента (DependencyManager.createNode dstIO-ветка), не выводить заново — иначе два расходящихся сайта (F-C4).
3. production-wiring: определить+протестировать функцию НЕ значит посадить на путь — DA r01(IMPLEMENT) поймал мёртвый applyConfigSet (ISS-029). Тест обязан гонять реально ДОСТИЖИМЫЙ production-код (для glue — вызов приватного handleConfigCommand, не ручная реплика).

Процессные/инструментальные (MB3):
4. mb3-critic capture ФАЗО-ЗАВИСИМ: 0/6 на PLAN (da_extraction_failed), 3/3 на IMPLEMENT+QA. ISS-024. Рабочий обход сломанного PLAN-capture: Tier-1 arm + general-purpose роль → review advise --report-file (advisory persist) → внешнее ревью (codex) → user break-glass (capture_defect).
5. projection-lag: .md материализуется на переходах фаз, evidence-upsert'ы пишут в JSONL SoT без перерисовки → критик (read-only) читает stale .md → REVISE-deadlock. Обход: ручная синхронизация .md с SoT. Предложение MB3: evidence-upsert триггерит render, или render-верб не no-op при projection<SoT revision.
6. 19 orphaned daemon-процессов (до 15 дней) — гигиена: снимать периодически; рестарт НЕ починил render-баг (ортогонален daemon).
7. doctor_checks (MCP) игнорирует workDir — читал чужой проект; CLI trace diagnose корректен. Не запускать remediate по doctor_checks без проверки projectRoot.
