# CLI команды

## Основные команды

| Команда | Описание | Флаги |
|---------|----------|-------|
| `pub` | Универсальная публикация | `-f, --file <path>`, `-a, --author <name>`, `-t, --title <title>`, `--with-dependencies`, `--force-republish`, `--dry-run`, `--debug`, `--generate-aside`, `--inline-toc`, `--toc-title <title>`, `--toc-separators` |
| `analyze` | Анализ зависимостей | `-f, --file <path>`, `--show-tree`, `--depth <n>`, `--verbose`, `--json` |
| `config` | Управление конфигурацией | `--show`, `--username <name>`, `--author-url <url>`, `--max-depth <n>`, `--default-depth <n>`, `--access-token <token>`, `--reset` |
| `status` | Статус файла | `-f, --file <path>`, `--with-dependencies` |
| `check-links` | Проверка ссылок | `-f, --file <path>`, `--fix`, `--interactive`, `--verbose` |
| `reset` | Сброс кэша | `--all`, `--anchors`, `--pages`, `--metadata` |
| `cache-validate` | Валидация кэша | `-f, --file <path>`, `--fix` |

## Дополнительные команды

| Команда | Описание | Флаги |
|---------|----------|-------|
| `epub` | Генерация EPUB | `-f, --file <path>`, `-o, --output <path>`, `--title <title>`, `--author <name>` |
| `svg` | Генерация SVG | `-f, --file <path>`, `-o, --output <path>` |
| `pdf` | Генерация PDF | `-f, --file <path>`, `-o, --output <path>` |
| `gist` | Публикация GitHub Gist | `-f, --file <path>`, `--token <token>`, `--public`, `--description <text>` |

## Легаси команды

| Команда | Описание |
|---------|----------|
| `publish-legacy` | Легаси публикация (через enhanced workflow) |
| `list-pages` | Список опубликованных страниц |
| `clean-md` | Очистка Markdown форматирования |
| `help-examples` | Примеры использования |

## Опции конфигурации (`config --show`)

| Параметр | Описание | По умолчанию |
|----------|----------|-------------|
| `author` | Имя автора по умолчанию | — |
| `author_url` | URL автора | — |
| `max_depth` | Максимальная глубина зависимостей | 10 |
| `default_depth` | Глубина по умолчанию | 3 |
| `dry_run` | Режим предпросмотра | false |
| `force_republish` | Принудительная перепубликация | false |
| `access_token` | Токен Telegra.ph | из config файла |
