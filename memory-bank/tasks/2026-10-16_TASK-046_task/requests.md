# User Requests

## UR-001
- Timestamp: 2026-10-16 17:48
- Source: user
- Text (verbatim): "Эвристика абзацев буллетов с вложенностью и явными границами"
- Superseded by: UR-002
- Continued from task: TASK-045

## UR-002
- Timestamp: 2026-10-16 17:48
- Source: user
- Text (verbatim): "Implement missing bullet paragraph ownership heuristic. For ASCII unordered markers -,*,+ nested by indentation, subsequent prose paragraphs belong to current bullet until next bullet (same/dedent/new nested owner), ordered marker, ATX heading, or two consecutive whitespace-only blank lines. New nested bullet starts its own ownership; after it do not silently resume parent ownership on dedented prose. No need following sibling confirmation, EOF allowed. Recognize later paragraphs after single blank, reindent their underindented lines to owner canonical continuation; preserve correctly indented prose, initial paragraph, headings and markers. Default warning/manual candidate, --heuristic proposals, --fix --heuristic applies; plain --fix no paragraph reindent. Retain shields/structural safeguards and bounded scanning. JSON/JSONL candidate metadata and applied changes; tests nesting/boundaries/readonly/idempotence/BOMCRLF; canonical reference only. Converter outside scope."

## UR-003
- Timestamp: 2026-10-16 17:49
- Source: user
- Text (verbatim): "Clarification to UR-002: dedented prose alone is not a boundary. Current nested bullet retains all subsequent paragraphs even when indentation is fully lost to column0, until one of the specified boundaries. Never silently reattach these paragraphs to parent. Reindent underindented lines to current nested owner's required indent; preserve already sufficient indentation. This supersedes the conservative dedented-prose stop in UR-002."
