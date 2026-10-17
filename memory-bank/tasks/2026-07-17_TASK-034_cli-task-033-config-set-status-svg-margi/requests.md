# User Requests

## UR-001
- Timestamp: 2026-07-17 09:55
- Source: user
- Text (verbatim): "Исправить CLI-баги, найденные аудитом TASK-033: config --set, status-заглушка, svg --margin/-o help"
- Superseded by: UR-002

## UR-002
- Timestamp: 2026-07-17 09:55
- Source: user
- Text (verbatim): "Исправить CLI-баги, найденные аудитом TASK-033 (эталон v1.5.0 @ da891c8): (1) `config --set <key=value>` — опция объявлена, но не реализована в handleConfigCommand (мёртвая опция) — реализовать или убрать; (2) `status -d/--directory` и `--recursive` принимаются, но не реализованы (заглушка «Directory status checking not implemented yet») — реализовать directory-режим или убрать опции; (3) `svg --margin`: help говорит default 3, внутренний fallback SvgGenerator — 5 (options.margin ?? 5) — унифицировать; (4) `svg -o` help-текст утверждает default «output.svg», реально <inputBasename>.svg в каталоге входного файла — починить help; (5) минор: help-examples содержит placeholder GitHub URL. При правках поведения учесть CD-63 (DST-покрытие для симулируемых изменений) и обновить скилл telegraph-publisher при изменении поведения (связь с TASK-033)."

## UR-003
- Timestamp: 2026-07-17 10:04
- Source: user
- Text (verbatim): "Решение пользователя: `config --set <key=value>` РЕАЛИЗОВАТЬ — generic setter с валидацией ключей и типов (включая вложенные ключи типа rateLimiting.*), с тестами на неверные/вложенные ключи и типы значений"

## UR-004
- Timestamp: 2026-07-17 10:04
- Source: user
- Text (verbatim): "Решение пользователя: directory-режим `status` (-d/--directory, --recursive) РЕАЛИЗОВАТЬ — обход .md-файлов каталога (рекурсивно по флагу), статус каждого через MetadataManager, сводка по статусам"

## UR-005
- Timestamp: 2026-07-17 10:19
- Source: user
- Text (verbatim): "Синхронно обновить скилл ~/work/agent-skills/skills/telegraph-publisher/SKILL.md после фиксов CLI: config --set теперь реализован (убрать «dead option», описать whitelist/типы/отказ токенов), status -d/--recursive реализован (убрать «stub», описать сводку), svg --margin расхождение 3/5 устранено"
