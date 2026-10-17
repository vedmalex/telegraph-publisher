# User Requests

## UR-001
- Timestamp: 2026-10-16 11:48
- Source: user
- Text (verbatim): "Проверить разбор нумерованных списков с маркером скобкой и многострочными пунктами"
- Superseded by: UR-002

## UR-002
- Timestamp: 2026-10-16 11:48
- Source: user
- Text (verbatim): "Проверить подозрение пользователя: списки с маркерами 1) без пустых строк и многострочные пункты 7)–9) с отступами обрабатываются неверно. Текущий scope: диагностика и воспроизведение, без изменения кода."

## UR-003
- Timestamp: 2026-10-16 12:17
- Source: user
- Text (verbatim): "Добавить новые требования форматирования документов в обновлённый telegraph-publisher skill (/Users/vedmalex/work/agent-skills/skills/telegraph-publisher/SKILL.md, Markdown Formatting Standards) и references/formatting-standards.md: маркеры нумерации, отступы продолжений, внутренние абзацы/мантры/изображения, границы пунктов и ожидаемая структура; явно отличать требования исходника от подтверждённой поддержки текущего конвертера. Только документация skill, без исправления кода CLI."

## UR-004
- Timestamp: 2026-10-16 12:21
- Source: user
- Text (verbatim): "Устранить дублирование правил форматирования между SKILL.md и references/formatting-standards.md: подробные требования и примеры хранить в справочнике, в SKILL оставить краткую маршрутизацию к нему, без потери требований."

## UR-005
- Timestamp: 2026-10-16 12:24
- Source: user
- Text (verbatim): "Подготовить read-only validator скрипт на Python или TS на основе formatting-standards.md: Markdown-правила, списки и отступы, шлоки, media, hierarchy, target-specific ограничения. Хранить в telegraph-publisher skill; документировать CLI/границы, покрыть meaningful тестами; исходники пользователя и publisher не менять."

## UR-006
- Timestamp: 2026-10-16 12:28
- Source: user
- Text (verbatim): "Реализовать отсутствующую поддержку списков в publisher: распознавание N. и N), компактные и многострочные пункты, абзацы/мантры/изображения внутри пунктов, корректные границы и вложенность, сохранение meaningful starting/explicit numbers в пределах target API. Проверить Telegraph+EPUB regression tests и согласовать validator/reference с реально реализованными возможностями. Не захватывать unindented внешний текст в пункт без оснований."
