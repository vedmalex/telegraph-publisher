# TASK-047 — Handoff исполнителю

Это **бриф будущей реализации**; его создание не является разрешением начать её в сессии планирования. Полный контракт: `.plan/TASK-047-epub-large-files-plan.md`, канонический MB3 artifact `plan` задачи TASK-047. Parent requirement UR-002. Baseline: `.plan/TASK-047-epub-source-baseline.json` (HEAD + hashes 141 текущих файлов, включая dirty content).

## Готовый prompt для следующего исполнителя

Ты реализуешь исправления и новые возможности больших EPUB в `/Users/vedmalex/work/BhaktiVaibhava/telegraph-publisher`. Сначала прочитай AGENTS.md, skill mb3, semantic TASK-047 requests/plan/status. Работай по текущему dirty tree: HEAD `954520d6106c143ed45b0d0d1f5b11c1fe99ca44` — только якорь, не исходная версия файлов. Не выполнять reset/clean/stash и не заменять dirty files версиями HEAD. Сравни source baseline SHA перед своим WU. Сообщи о дрейфе и перечитай соответствующие изменения; сохраняй чужую работу.

Задача включает **оба** этапа:

1. A: исправить адресацию `(source,fragment)→реальный XHTML`, safe Markdown splitter/fences, полный registry anchors, auto split по UTF8 bytes **финального** XHTML, semantic outline независимо от частей, EPUB2/3 nav/NCX/ToC/page/spine, validation/report/dry-run.
2. B: убрать whole-file reads из generator **и CLI title/BFS**, accumulation всех chapter nodes и ZIP Buffers; реализовать source snapshot→spool/два прохода→одна unit за раз→stream ZIP, cancellation/cleanup/atomic final output. Нарезка A сама по себе не streaming.

Не менять ключевые решения без явного plan/spec amendment:

- default maxChapterBytes=307200, CLI `--max-chapter-size 300KiB`; `--no-auto-split` opt-out; конфликт явно заданных обоих flags — E_OPTION; `--split-at 1..6` добавляет обязательные heading cuts, не меняет heading level;
- финальный UTF8 size включает wrapper, title, IDs, rewritten links/images и встроенный ToC; monotonic cuts с конечной мерой прогресса, повторный final-byte check;
- неделимые paragraph/code/list/blockquote/table сохраняются целиком: warn по умолчанию, `--oversize-policy error` запрещает commit; oversized mandatory navigation тоже отчётен;
- одно AST EPUB (marked+проектные extensions) для content/anchors/links/outline. Telegraph/SVG поведение сохраняется; AST адаптер EPUB не импортирует legacy markdownConverter обратно;
- aliases Unicode/ASCII/percent decode exactly once; IDs stable per source, duplicate headings suffix, explicit duplicate ID в source error; pure fragments адресуют source, а не physical part; unresolved никогда не маскируются ссылкой на первую часть;
- semantic ToC не включает технические continuation roots, source headings/level/order/text сохраняются; forward/back/reference links и pages используют общий registry;
- final output заменяется только atomic rename после проверок, до commit любая ошибка/cancel сохраняет existing output; no direct output stream; debug artifacts только session-owned dir;
- bounded body payload memory, но O(max indivisible block + indexes) остаётся явным ограничением; 20MiB single paragraph не режется произвольно;
- 300KiB — проектный default, не стандарт EPUB/гарантия читалок.

Полные DTO/signatures/error codes: plan §4–5. Не вводи `any` для обхода контрактов. Public generate Promise<void> сохраняется, report через getLastReport; analyze для dry-run; dispose идемпотентен. Report schemaVersion=1, stable diagnostics, counters actual bytes/links/anchors/images/parts/passes; user output не обещает непроверенную совместимость.

## Ownership и порядок запуска

Оркестратор назначает конкретный WU/child task из plan §6 и его `allowed_files`. Только этот manifest разрешает записи. Общие `EpubGenerator.ts`, `markdownConverter.ts`, `EnhancedCommands.ts` редактирует один owner за раз. `.llm-wiki/**`, книги, caches/logs, чужие tests, AGENTS/CLAUDE, SVG/HTML modules запрещены. Canonical MB3 projections не редактировать filesystem tools: explicit taskId через semantic artifact/evidence API. Commits/push/publish не входят в поручение.

Порядок: W0 baseline → W1 AST/types → parallel W2 registry/W3 navigation/W4 options → W5 packer+renderer → W6 integration A → parallel W7 IO/session/spool/ZIP и W8 framer/scanner → W9 integration B → W10 verification и W11 docs (окончательные docs claims после W10).

Перед fanout нужны task-backed units, frozen shared DTO и `mb3_model_routing plan` с actual child taskIds. Планировщик проверил runtime resolve opus/high для cross-cutting implementer; top architecture critic fallback fable-unavailable→opus/raised. Основной агент выбирает реально доступный transport и не приписывает advisory review authoritative clearance. Исполнитель не запускает критиков и не закрывает задачу самостоятельно.

TASK-047 на снимке pending/phase empty/T4/full-spec/qaLevel STANDARD. Это **не** разрешение менять код вне IMPLEMENT. Основной оркестратор восстанавливает runtime, уточняет depth mismatch, проводит CREATIVE→PLAN→TECH_SPEC и required exits, затем назначает IMPLEMENT. Gates из свежего task snapshot обязательны, фазы нельзя «проставить» по факту существования документа. Все следующее — claims-to-verify, ни один дефект ещё не закрыт.

## Минимальный обязательный evidence пакет

- D1: межфайловый `book.md#later` и `#later` приводят в фактическую позднюю часть; D2: fence 4 ticks с вложенными 3 и `## inside` даёт ровно реальные headings.
- Generated >=20MiB Russian input без headings, разбитый на paragraphs: текст весь ровно один раз, каждый ordinary XHTML<=307200 actual bytes. Отдельно giant single paragraph/fence/list/table warn/error; L−1/L/L+1 bytes; 9→10 filename growth; full ToC overhead.
- ASCII/Кириллица/NFC/NFD/encoded fragments, duplicate headings/explicit IDs/pages, refs/definitions через split, lists/table/quotes/стихи, title/levels preserved.
- Full real ZIP inspection всех entries/manifest/spine/hrefs/IDs/CRC/first stored mimetype; обе версии EPUB2/3, все semantic navigation targets. Python inspector не заменяет EPUBCheck/reader smoke.
- Real module DST с injected EpubIO на настоящем generator: seeded schedules/chunk boundaries, cancellation/backpressure/rename/cleanup/report errors, output sentinel unchanged до commit, no leaked handles/temp. Mock parity + real filesystem coverage.
- M01…M16 из plan §7.2: baseline PASS, exact mutated diff/hash, subprocess assertion RED, restored-tree hash и PASS. Compile failure/timeout не counted killed.
- Separate-process peak RSS: A vs B 20/80MiB, 3 samples, host+Bun+fingerprints+args; B80<=60% A80, B20<=110% A20, throughput<=2x A. Instrumented payload-count invariant отдельно от RSS. Huge indivisible unit memory limitation честно записана.
- Exact commands/exit/test counts: `bun test src/epub`, CLI suite, `bun test tests/integration/epub-large-files.test.ts`, `bun test`, `bun run test:coverage`, `bun run build`, mutation/benchmark scripts после их создания. `test:integration` сегодня не содержит существующего каталога tests — подтвердить после W10, что тесты собраны. Build не typecheck.
- EPUBCheck сейчас не найден в PATH; availability prerequisite, не выдумывать PASS/JAR path. Реальный reader smoke с app/device/version — отдельный receipt.

Каждый WU возвращает base/candidate fingerprints, actualChangedFiles против allowlist, команды+exit/assertion receipts, `executed/failed/skipped/unverified`, открытые риски и canonical evidence refs. Полный JSON receipt template в plan §8. Parent UR-002 выполнен только после A+B и свежих обязательных gates. Не объявляй product fixed или QA complete по одному зелёному narrow suite.

## Что уже сделано планировщиком

Source inventory, две read-only reproductions D1/D2, tools availability, MB3 status/requests/model-routing reads и этот документ. Product code/tests/build/EPUB output не менялись/не запускались. План и handoff — передача работ, а не реализация.
