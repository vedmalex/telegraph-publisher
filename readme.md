# Telegraph Publisher CLI

Инструмент командной строки для публикации Markdown файлов в Telegra.ph.

## Особенности

- 📝 Поддержка Markdown синтаксиса
- 🔄 Автоматическая конвертация в HTML
- 🚀 Публикация через официальный API Telegraph
- 💻 Простой интерфейс командной строки
- ⚡ Быстрая работа с помощью Bun
- 🧪 Полное покрытие тестами (TDD)

## Установка

```bash
git clone <repository-url>
cd telegraph-publisher
bun install
```

## Использование

### Базовое использование

```bash
bun run publish --file article.md --title "Моя статья" --author "Ваше имя"
```

### Все опции

```bash
bun run publish --file <путь> --title <заголовок> --author <автор> --author-url <url>
```

### Параметры

- `--file <path>` - Путь к Markdown файлу (обязательный)
- `--title <title>` - Заголовок статьи (опциональный, по умолчанию - имя файла)
- `--author <name>` - Имя автора (опциональный, по умолчанию - "Аноним")
- `--author-url <url>` - URL автора (опциональный)
- `--help` - Показать справку

## Примеры

### Простая публикация

```bash
bun run publish --file my-article.md
```

### С полными параметрами

```bash
bun run publish --file content.md --title "Интересная статья" --author "Иван Иванов" --author-url "https://example.com"
```

### Показать справку

```bash
bun run publish --help
```

## Поддерживаемый Markdown

Инструмент поддерживает стандартный Markdown синтаксис:

- **Заголовки**: `# H1`, `## H2`, `### H3`, etc.
- **Жирный текст**: `**жирный**` или `__жирный__`
- **Курсив**: `*курсив*` или `_курсив_`
- **Ссылки**: `[текст](URL)`
- **Параграфы**: Обычный текст
- **Списки**: `- элемент списка`

## Разработка

### Запуск тестов

```bash
bun test
```

### Режим разработки

```bash
bun run dev --file test-article.md --author "Dev User"
```

### Очистка Markdown файлов

```bash
bun run clean-md --file <path_to_dirty_markdown_file>
```

### Сборка

```bash
bun run build
```

## Структура проекта

```
telegraph-publisher/
├── src/
│   ├── cli.ts                    # CLI интерфейс
│   ├── markdownConverter.ts      # Конвертация Markdown в HTML
│   ├── markdownConverter.test.ts # Тесты конвертера
│   ├── telegraphPublisher.ts     # Работа с Telegraph API
│   └── telegraphPublisher.test.ts # Тесты публикации
├── test-article.md               # Пример статьи
├── package.json
└── README.md
```

## API

### TelegraphPublisher

```typescript
import { TelegraphPublisher } from "./src/telegraphPublisher";

const publisher = new TelegraphPublisher();

// Создание аккаунта
const account = await publisher.createAccount("Author Name", "Author Display Name", "https://author-url.com");

// Публикация HTML
const page = await publisher.publishHtml("Article Title", "<h1>Hello</h1><p>World</p>");

// Публикация Markdown
const page = await publisher.publishMarkdown("Article Title", "# Hello\n\nWorld");
```

### markdownConverter

```typescript
import { convertMarkdownToHtml } from "./src/markdownConverter";

const html = convertMarkdownToHtml("# Hello\n\n**World**");
// Результат: "<h1>Hello</h1><p><strong>World</strong></p>"
```

## Технологии

- **Bun** - JavaScript runtime и пакетный менеджер
- **TypeScript** - Типизированный JavaScript
- **mrkdwny** - Библиотека для конвертации Markdown
- **Telegraph API** - Официальный API для публикации

## Лицензия

MIT

## Автор

Создано с использованием методологии Test-Driven Development (TDD).

---

*Response generated using Claude Sonnet 4*
