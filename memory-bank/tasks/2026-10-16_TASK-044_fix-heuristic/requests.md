# User Requests

## UR-001
- Timestamp: 2026-10-16 16:36
- Source: user
- Text (verbatim): "Разрешить восстановление отступов через fix heuristic"
- Superseded by: UR-002
- Continued from task: TASK-043

## UR-002
- Timestamp: 2026-10-16 16:37
- Source: user
- Text (verbatim): "Owner подтвердил: при --fix и включённой эвристике автоматически восстанавливать отступы найденных list-paragraph-indent абзацев. Добавить явный --heuristic; без него прежнее manual-only. Check с --heuristic не пишет, показывает разрешённые предложения; fix --heuristic применяет expected_indent и логирует изменения, сохраняя слова/номера/lineendings/BOM. Границы/лимиты/барьеры прежней эвристики не расширять; ambiguous dialogue/list candidates не автофиксить. JSON/JSONL фиксируют включённый режим; extraction conflict reject. Tests+skill/reference update."
