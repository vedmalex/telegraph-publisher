# Telegraph Publisher CLI

Инструмент командной строки для публикации Markdown файлов в Telegra.ph.

## Особенности

- 📝 Поддержка Markdown синтаксиса
- 🔄 Прямая конвертация в формат Telegraph Node (без промежуточного HTML)
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
bun run publish --file <путь> --title <заголовок> --author <автор> --author-url <url> --dry-run
```

### Параметры

- `--file <path>` - Путь к Markdown файлу (обязательный)
- `--title <title>` - Заголовок статьи (опциональный, по умолчанию - имя файла)
- `--author <name>` - Имя автора (опциональный, по умолчанию - "Аноним")
- `--author-url <url>` - URL автора (опциональный)
- `--dry-run` - Обработать файл, но не публиковать в Telegra.ph, показывая результирующие Telegraph Nodes в консоли.
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

### Dry Run (тестовый запуск)

```bash
bun run publish --file my-article.md --dry-run
```

### Показать справку

```bash
bun run publish --help
```

## Поддерживаемый Markdown

Инструмент поддерживает стандартный Markdown синтаксис, напрямую преобразуя его в формат, совместимый с Telegra.ph API:

- **Заголовки**: `# H1`, `## H2`, `### H3`, etc.
- **Жирный текст**: `**жирный**` или `__жирный__`
- **Курсив**: `*курсив*` или `_курсив_`
- **Ссылки**: `[текст](URL)`
- **Параграфы**: Обычный текст
- **Списки**: `- элемент списка` (нумерованные и маркированные)
- **Блок-цитаты**: `> Цитата`
- **Встроенный код**: `инлайн код`
- **Блоки кода**: (тройные обратные кавычки)
- **Горизонтальные линии**: `---` или `***`

## Разработка

### Запуск тестов

```bash
bun test
```

### Режим разработки

```bash
bun --watch src/cli.ts publish --file test-article.md --author "Dev User" --dry-run
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
│   ├── clean_mr.ts               # Функции для очистки Markdown
│   ├── markdownConverter.ts      # Конвертация Markdown в Telegraph Node
│   ├── markdownConverter.test.ts # Тесты конвертера Markdown
│   ├── telegraphPublisher.ts     # Работа с Telegraph API
│   ├── telegraphPublisher.test.ts # Тесты публикации Telegraph
│   └── integration.test.ts       # Интеграционные тесты
├── шлока1.1.1.md                 # Пример файла для тестирования структуры
├── package.json
└── README.md
```

## API

### TelegraphPublisher

```typescript
import { TelegraphPublisher } from "./src/telegraphPublisher";
import type { TelegraphNode } from "./src/telegraphPublisher";

const publisher = new TelegraphPublisher();

// Создание аккаунта
const account = await publisher.createAccount("Author Name", "Author Display Name", "https://author-url.com");

// Публикация Markdown (конвертирует в Telegraph Nodes)
const page = await publisher.publishMarkdown("Article Title", "# Hello\n\nWorld");

// Публикация напрямую Telegraph Nodes
const nodes: TelegraphNode[] = [
  { tag: "h1", children: ["Hello"] },
  { tag: "p", children: ["World"] }
];
const page = await publisher.publishNodes("Article Title", nodes);
```

### markdownConverter

```typescript
import { convertMarkdownToTelegraphNodes, validateContentStructure } from "./src/markdownConverter";
import type { TelegraphNode } from "./src/telegraphPublisher";

const markdownContent = "# Заголовок\n\n**Жирный текст**";
const nodes: TelegraphNode[] = convertMarkdownToTelegraphNodes(markdownContent);
// Пример результата: [{ tag: "h1", children: ["Заголовок"] }, { tag: "p", children: [{ tag: "strong", children: ["Жирный текст"] }] }]

const isValid = validateContentStructure("### **Связный пословный перевод Шримад-Бхагаватам 1.1.1**\n...\n### **Итоговый связный перевод в едином тексте:**");
// Результат: true или false в зависимости от структуры
```

### clean_mr

```typescript
import { cleanMarkdownString, cleanMarkdownFile } from "./src/clean_mr";
import { readFileSync, writeFileSync } from "fs";

// Очистка строки Markdown
const dirtyString = "# Hello **World**\n\n- item";
const cleanString = cleanMarkdownString(dirtyString);
// Результат: "# Hello **World**\n\n- item" (удаляет только избыточные пробелы и пустые строки в начале/конце)

// Очистка файла Markdown (удаляет только избыточные пробелы и пустые строки в начале/конце)
const filePath = "path/to/your/dirty/file.md";
cleanMarkdownFile(filePath);
// Файл file.md будет обновлен с очищенным содержимым
```

## Технологии

- **Bun** - JavaScript runtime и пакетный менеджер
- **TypeScript** - Типизированный JavaScript
- **Telegraph API** - Официальный API для публикации

## Лицензия

MIT

## Автор

Создано с использованием методологии Test-Driven Development (TDD).

---

*Response generated using Claude Sonnet 4*
