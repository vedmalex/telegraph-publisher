# User Requests

## UR-001
- Timestamp: 2026-10-16 12:47
- Source: user
- Text (verbatim): "Добавить предварительную эвристику поиска плохо оформленных списков"
- Superseded by: UR-002
- Continued from task: TASK-038

## UR-002
- Timestamp: 2026-10-16 12:48
- Source: user
- Text (verbatim): "Добавить предварительную эвристику поиска плохо оформленных списков до обычной проверки, особенно ненумерованных. Выявлять кандидаты Unicode bullets и типографские тире, маркеры без пробела, смешанные отступы/разрывы групп и возможные перечисления; JSON/JSONL explainable candidate metadata, confidence/evidence/proposed normalization. --fix применять только однозначные marker+space corrections preserving text/numbers/indent; не превращать диалог, стихи, математику, даты/версии, код и обычную прозу в списки. Неоднозначные cases manual review. Existing safe-fix/report byte/idempotence contracts remain."
