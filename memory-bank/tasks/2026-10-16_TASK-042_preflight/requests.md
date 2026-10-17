# User Requests

## UR-001
- Timestamp: 2026-10-16 14:48
- Source: user
- Text (verbatim): "Сохранить пустые заголовки таблиц и добавить preflight целостности"
- Superseded by: UR-002
- Continued from task: TASK-041

## UR-002
- Timestamp: 2026-10-16 14:48
- Source: user
- Text (verbatim): "Исправить parseTable: не фильтровать пустые заголовки, сохранять позиции/число колонок; optional leading/trailing pipes обрабатывать независимо для headers/data; пустой th оставлять пустым, Telegraph fallback —. Добавить TABLE_HEADER_EMPTY_ALL error, TABLE_HEADER_EMPTY_CELL warning, TABLE_COLUMN_MISMATCH warning в validator без autofix содержимого. Учесть delimiter/header ширину, escaped pipes, защита code/comments и тесты EPUB+Telegraph+JSON/JSONL. После rendererfix diagnostics отражают editorialheader policy, не ложное утверждение data loss. Не менять heading semantics."
