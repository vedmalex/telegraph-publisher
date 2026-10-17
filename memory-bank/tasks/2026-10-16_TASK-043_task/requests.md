# User Requests

## UR-001
- Timestamp: 2026-10-16 16:31
- Source: user
- Text (verbatim): "Выявлять абзацы с потерянным отступом между нумерованными пунктами"
- Superseded by: UR-002
- Continued from task: TASK-041

## UR-002
- Timestamp: 2026-10-16 16:31
- Source: user
- Text (verbatim): "Устранить пропуск эвристики: ненумерованные абзацы без отступа после пустой строки между последовательными ordered пунктами одного уровня должны давать manual warning о возможном потерянном отступе. Показывать диапазон/expected indentation в JSON/JSONL и candidate metadata; не менять неоднозначный текст в --fix. Не предупреждать на корректные продолжения, реальный конец списка без следующего пункта, смену раздела/HR/code/table/list type/несовпадающую нумерацию; nested/wide markers проверить. Сохранить все текущие check/fix/extract контракты."
