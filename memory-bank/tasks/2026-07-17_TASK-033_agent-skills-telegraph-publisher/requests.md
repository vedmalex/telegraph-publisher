# User Requests

## UR-001
- Timestamp: 2026-07-17 08:10
- Source: user
- Text (verbatim): "Аудит скилов agent-skills на соответствие текущему функционалу telegraph-publisher"
- Superseded by: UR-002

## UR-002
- Timestamp: 2026-07-17 08:10
- Source: user
- Text (verbatim): "Найти скилы в ~/work/agent-skills/skills, которые используют библиотеку telegraph-publisher, и проверить, что они правильно и полно знают о текущем функционале библиотеки (аудит соответствия скилов реальному CLI/API)"

## UR-003
- Timestamp: 2026-07-17 09:06
- Source: user
- Text (verbatim): "Исправить критичные дефекты в 4 скиллах: telegraph-publisher (camelCase-поля фронт-маттера, семантика --force, иерархический конфиг, svg -o default, gist --description default), telegram-mtproto (рабочее извлечение URL через front-matter/status -f вместо grep stdout), jyoti-consultation-doc-util (убрать ложное утверждение о дедупликации SVG в pdf), current-date (убрать приписывание --template header к telegraph-publisher)"

## UR-004
- Timestamp: 2026-07-17 09:06
- Source: user
- Text (verbatim): "news-digest: задокументировать получение URL опубликованной статьи (front-matter telegraphUrl / status -f), предупредить о персистенции конфига в /tmp, исправить опечатку { дата} в строке 482"

## UR-005
- Timestamp: 2026-07-17 09:06
- Source: user
- Text (verbatim): "Доусилить полноту главного скилла telegraph-publisher: gist front-matter-поля и token-chain, флаги cache:validate, полные таблицы опций svg/pdf/epub/analyze/check-links, deprecated --force-republish (DeprecatedFlagError), отметить status directory-mode как заглушку"

## UR-006
- Timestamp: 2026-07-17 09:12
- Source: user
- Text (verbatim): "Библиотека mtproto тоже изменилась, лежит в ~/work/bs-bot — проверить скилл telegram-mtproto (и другие скилы, если ссылаются) на соответствие её текущему CLI/функционалу (аналогичный аудит ground-truth vs скилл)"

## UR-007
- Timestamp: 2026-07-17 09:36
- Source: user
- Text (verbatim): "Исправить скилл telegram-mtproto по аудиту против bs-bot @ 8460d22: (1) 4 фактические ошибки — error-объект {code,message,command,flag?} + timestamp в конверте, plain-text дефолт parse-mode, имя файла get-file (telegram_file_...), INTERACTIVE-рассинхрон + approval-prompt только при --live; (2) добавить недостающие команды (forward, get-reactions, create/close/reopen-topic, create/revoke-invite-link, ensure-student-topics), --config-db и :memory:-дефолты, скрытые флаги (delete --revoke, --save-attachments, search-hybrid --top-k, mute --until-date, invite-link опции, export --topic-id/--since/--until/--limit, contacts-audit --subscriptions); (3) references/commands.md — расширить до реального полного списка, исправить путь CLI и error-схему"
