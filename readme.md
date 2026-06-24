# Telegraph Publisher CLI

Современный инструмент командной строки для публикации Markdown файлов в Telegra.ph с расширенной системой управления зависимостями, метаданными и интеллектуальной обработкой ссылок.

## 🚀 Ключевые особенности

### Основные функции
- 📝 **Полная поддержка Markdown** с прямой конвертацией в Telegraph Node (без промежуточного HTML)
- 🔗 **Умное управление зависимостями** - автоматическая публикация связанных файлов
- 📊 **Система метаданных** - автоматическое добавление YAML front-matter к опубликованным файлам
- 🔄 **Кэширование страниц** - быстрый доступ к информации о публикациях
- ⚡ **Оптимизация производительности** - пропуск публикации неизменённых файлов (hash-based)

### Интеллектуальная обработка ссылок
- 🔍 **Автоматическая проверка ссылок** - валидация локальных и внешних ссылок перед публикацией
- 🔧 **Автоматическое исправление** - интеллектуальный ремонт сломанных ссылок
- 🔄 **Замена локальных ссылок** - автоматическая замена на Telegraph URLs в опубликованном контенте
- 📋 **Подробная отчётность** - детальные отчёты о состоянии всех ссылок

### Расширенные возможности
- 📑 **Table of Contents (ToC)** - автоматическая генерация оглавления с якорными ссылками
- 📊 **Анализ зависимостей** - визуализация дерева зависимостей между файлами
- 📚 **Генерация EPUB** - создание электронных книг из Markdown файлов с переиспользованием механизма публикации
- 🐙 **Публикация в GitHub Gist** - создание/обновление одного markdown-файла (по умолчанию приватный gist)
- ⚙️ **Гибкая конфигурация** - настройка по умолчанию для автора, глубины зависимостей и других параметров
- 🛠️ **Режимы работы** - dry-run, debug, force-republish и другие
- 🧪 **Полное покрытие тестами** (472+ тестов) с методологией TDD

### Техническое совершенство
- ⚡ **Bun runtime** - максимальная производительность
- 🔒 **TypeScript** - полная типизация и безопасность
- 📏 **Проактивная валидация** - проверка размера контента (64 КБ лимит)
- 🎯 **Telegraph API** - прямая работа с официальным API

## 📦 Установка

```bash
git clone <repository-url>
cd telegraph-publisher
bun install
```

## 🎯 Быстрый старт

### Первичная настройка
```bash
# Установить автора по умолчанию
telegraph-publisher config --username "Ваше имя"

# Опубликовать первый файл с токеном
telegraph-publisher pub -f article.md --token YOUR_TOKEN
```

### Основное использование
```bash
# Публикация одного файла (с автоматической регистрацией если токен отсутствует)
telegraph-publisher pub -f article.md -a "Автор"

# Публикация со всеми зависимостями
telegraph-publisher pub -f main.md -a "Автор" --with-dependencies

# Публикация всей директории
telegraph-publisher pub -a "Автор"

# Принудительная перепубликация
telegraph-publisher pub -f article.md --force-republish

# Отключение автоматической регистрации
telegraph-publisher pub -f article.md --no-auto-register

# Генерация EPUB книги из Markdown файлов
telegraph-publisher epub -f chapter1.md chapter2.md -a "Автор" -o book.epub

# Публикация merged-markdown в приватный GitHub Gist
telegraph-publisher gist -f index.md --token GITHUB_TOKEN
```

## 📚 Подробное руководство

### 🎯 Унифицированная команда `publish` (рекомендуется)

Основная команда для всех операций публикации:

```bash
telegraph-publisher publish [опции]
telegraph-publisher pub [опции]  # короткая форма
```

**Основные опции:**
- `-f, --file <path>` - Путь к Markdown файлу (если не указан, публикует всю директорию)
- `-a, --author <name>` - Имя автора (переопределяет настройки по умолчанию)
- `--title <title>` - Заголовок статьи (автоматически извлекается из файла если не указан)
- `--author-url <url>` - URL автора
- `--token <token>` - Access token (сохраняется автоматически после первого использования)
- `--no-auto-register` - Отключить автоматическое создание аккаунта Telegraph при отсутствии токена

**Управление зависимостями:**
- `--with-dependencies` - Автоматически публиковать связанные файлы (по умолчанию: true)
- `--no-with-dependencies` - Пропустить публикацию зависимостей

**Режимы публикации:**
- `--force-republish` - Принудительная перепубликация даже для неизменённых файлов
- `--force` - Обход проверки ссылок (для отладки)
- `--dry-run` - Предварительный просмотр без фактической публикации
- `--debug` - Сохранить сгенерированный Telegraph JSON в файл (подразумевает --dry-run)

**Table of Contents:**
- `--aside` - Автоматически генерировать оглавление (по умолчанию: true)
- `--no-aside` - Отключить генерацию оглавления

**Проверка ссылок:**
- `--no-verify` - Пропустить обязательную проверку локальных ссылок
- `--no-auto-repair` - Отключить автоматическое исправление ссылок

### 📊 Анализ зависимостей

```bash
telegraph-publisher analyze [опции]
```

**Опции:**
- `-f, --file <path>` - Путь к файлу для анализа
- `--depth <number>` - Максимальная глубина анализа зависимостей (по умолчанию: 1)
- `--show-tree` - Показать визуализацию дерева зависимостей

**Пример вывода:**
```
📊 Dependency Analysis Results:
📄 main.md (PUBLISHED)
├── 📄 chapter1.md (NOT PUBLISHED)
│   ├── 📄 appendix1.md (PUBLISHED)
│   └── 📄 references.md (NOT PUBLISHED)
└── 📄 chapter2.md (PUBLISHED)
    └── 📄 images/diagram.png (EXTERNAL)
```

### 📚 Генерация EPUB
Команда для создания электронных книг в формате EPUB из Markdown файлов. Полностью переиспользует механизм публикации Telegraph, включая обработку контента, метаданных и зависимостей.

```bash
telegraph-publisher epub [опции]
```

**Основные опции:**
- `-f, --file <path...>` - Путь(и) к Markdown файлу(ам) (обязательно, можно указать несколько файлов)
- `-o, --output <path>` - Путь к выходному EPUB файлу (по умолчанию: `book.epub`)
- `-t, --title <title>` - Название книги (автоматически извлекается из первого файла если не указано)
- `-a, --author <name>` - Имя автора (обязательно)
- `--cover <path>` - Путь к файлу обложки (cover.jpg или cover.png)
- `--debug` - Режим отладки (сохранить временные файлы для анализа)
- `--language <lang>` - Код языка книги (по умолчанию: `ru`)

**Управление зависимостями:**
- `--with-dependencies` - Автоматически включать связанные локальные файлы (по умолчанию: true)
- `--no-with-dependencies` - Пропустить автоматическое включение зависимостей

**Table of Contents:**
- `--toc-title <title>` - Заголовок для оглавления (по умолчанию: `Содержание`)
- `--toc-separators` - Добавить горизонтальные разделители вокруг оглавления (по умолчанию: true)
- `--no-toc-separators` - Отключить разделители вокруг оглавления

**Примеры использования:**

```bash
# Простая генерация EPUB из одного файла
telegraph-publisher epub -f chapter.md -a "Автор" -o book.epub

# Генерация EPUB из нескольких файлов
telegraph-publisher epub -f chapter1.md chapter2.md chapter3.md -a "Автор" -t "Название книги"

# Генерация с обложкой
telegraph-publisher epub -f chapter1.md chapter2.md -a "Автор" --cover cover.jpg -o book.epub

# Генерация с зависимостями (автоматически включит связанные файлы)
telegraph-publisher epub -f main.md -a "Автор" --with-dependencies

# Генерация без зависимостей
telegraph-publisher epub -f main.md -a "Автор" --no-with-dependencies

# Генерация с кастомным языком и заголовком оглавления
telegraph-publisher epub -f chapter.md -a "Author" --language en --toc-title "Table of Contents"

# Генерация в режиме отладки (сохранить временные файлы)
telegraph-publisher epub -f chapter.md -a "Author" --debug -o debug-book.epub
```

**Особенности:**
- ✅ **Переиспользование механизма публикации** - использует тот же конвертер Markdown, обработчик метаданных и систему зависимостей
- ✅ **Отдельные HTML файлы** - каждый Markdown файл становится отдельной главой в EPUB (поддерживается всеми читалками)
- ✅ **Поддержка обложки** - возможность добавить файл обложки (JPG/PNG) для профессионального вида книги
- ✅ **Режим отладки** - опция `--debug` сохраняет временные файлы для анализа структуры EPUB и HTML
- ✅ **Автоматическая обработка** - метаданные, ссылки и форматирование обрабатываются автоматически
- ✅ **Валидный EPUB 3.0** - соответствует стандарту EPUB для совместимости со всеми читалками
- ✅ **Без внешних зависимостей** - использует только встроенные возможности Node.js/Bun для создания ZIP архива

### 📄 Генерация PDF
Команда для создания PDF документов из Markdown файлов с поддержкой объединения множества файлов и автоматического разрешения зависимостей (аналогично EPUB/Publish режимам).

```bash
telegraph-publisher pdf [опции]
```

**Основные опции:**
- `-f, --file <path...>` - Путь(и) к Markdown файлу(ам) (обязательно)
- `-o, --output <path>` - Путь к выходному PDF файлу (по умолчанию: `book.pdf`)
- `-t, --title <title>` - Название документа
- `--with-dependencies` - Автоматически включать связанные локальные файлы (по умолчанию: true)
- `--save-merged` - Сохранить промежуточный объединенный Markdown файл
- `-w, --width <mm>` - Ширина бумаги в мм
- `--page-height <mm>` - Высота страницы в мм
- `--paper <size>` - Пресет бумаги (a4, a5, thermal-57 и др.)

**Примеры использования:**

```bash
# Простая генерация PDF из одного файла
telegraph-publisher pdf -f document.md

# Генерация из множества файлов с зависимостями
telegraph-publisher pdf -f index.md --with-dependencies

# Указание формата бумаги
telegraph-publisher pdf -f document.md --paper a4
```

### 🐙 Публикация в GitHub Gist
Команда публикует один markdown-файл в gist. Контент собирается тем же способом, что и в `pdf` (объединение зависимостей + переписывание локальных ссылок на якоря).

```bash
telegraph-publisher gist [опции]
```

**Основные опции:**
- `-f, --file <path...>` - Путь(и) к входным Markdown-файлам (обязательно)
- `--token <token>` - GitHub token (или сохраните через `config --github-token`)
- `--with-dependencies` - Включать локальные markdown-зависимости (по умолчанию: true)
- `--no-with-dependencies` - Не включать зависимости
- `--filename <name>` - Имя файла внутри gist (по умолчанию: `*_pdf.md`)
- `--description <text>` - Описание gist
- `--public` - Сделать gist публичным (по умолчанию gist приватный)
- `--save-merged` - Сохранить merged markdown локально перед публикацией

**Поведение:**
- При первом запуске создается gist и выводится ссылка.
- При следующих запусках команда обновляет тот же gist (ID хранится в front-matter исходного файла).
- В gist всегда отправляется один markdown-файл.

#### Как получить `GITHUB_TOKEN`

Рекомендуемый вариант: **Fine-grained Personal Access Token**.

1. Откройте GitHub: `Settings` → `Developer settings` → `Personal access tokens` → `Fine-grained tokens`.
2. Нажмите `Generate new token`.
3. В `Resource owner` выберите свой пользовательский аккаунт.
4. В разделе `Permissions` задайте:
   - `Account permissions` → `Gists` → `Read and write`.
5. Сгенерируйте токен и сразу сохраните его в безопасном месте (GitHub показывает его один раз).

Альтернатива: **Personal access token (classic)** с scope `gist`.

Важно:
- Для API создания/обновления gist fine-grained токену нужен permission `Gists (write)`.
- Если у вас organization-политики на токены, доступ может требовать approval администратора.

#### Какие настройки нужны

Можно использовать любой из способов (приоритет: CLI флаг → config → переменные окружения):

1. Через конфиг проекта (рекомендуется):
```bash
telegraph-publisher config --github-token YOUR_TOKEN
```

2. Через переменную окружения:
```bash
export GITHUB_TOKEN=YOUR_TOKEN
# или
export GH_TOKEN=YOUR_TOKEN
```

3. Через флаг команды:
```bash
telegraph-publisher gist -f index.md --token YOUR_TOKEN
```

Проверка:
```bash
# Проверить без публикации
telegraph-publisher gist -f index.md --dry-run

# Реальная публикация/обновление
telegraph-publisher gist -f index.md
```

### 🔐 Автоматическая регистрация

#### Что такое автоматическая регистрация?
Telegraph Publisher автоматически создает аккаунт Telegraph, если у вас нет токена доступа. Это позволяет начать публикацию без предварительной настройки.

#### Как это работает:
1. **При первом запуске** без токена система автоматически создаст новый аккаунт Telegraph
2. **Токен сохраняется** в конфигурационном файле для последующего использования
3. **Уникальные имена** генерируются автоматически для избежания конфликтов

#### Преимущества:
- ✅ **Быстрый старт** - не нужно предварительно получать токен
- ✅ **Автоматическая настройка** - все происходит в фоне
- ✅ **Безопасное хранение** - токен сохраняется локально
- ✅ **Умная генерация** - уникальные имена для каждого пользователя

#### Управление автоматической регистрацией:
```bash
# Включена по умолчанию - просто начните публиковать
telegraph-publisher pub -f article.md

# Отключить автоматическую регистрацию
telegraph-publisher pub -f article.md --no-auto-register

# Использовать собственный токен (авторегистрация отключится)
telegraph-publisher pub -f article.md --token YOUR_TOKEN
```

#### Пример автоматической регистрации:
```
🔐 Токен не найден. Создаю новый аккаунт Telegraph...
📝 Регистрация аккаунта: TelegraphPublisher_1703123456_abc123 (Digital Writer)
✅ Аккаунт успешно создан! Токен: bbbcccddd...
💾 Токен сохранен в конфигурации
```

### ⚙️ Управление конфигурацией

```bash
telegraph-publisher config [опции]
```

**Опции:**
- `--show` - Показать текущую конфигурацию
- `--username <name>` - Установить автора по умолчанию
- `--github-token <token>` - Сохранить GitHub token для команды `gist`
- `--max-depth <number>` - Установить максимальную глубину зависимостей
- `--auto-deps <boolean>` - Включить/отключить автоматическую публикацию зависимостей
- `--set <key=value>` - Установить значение конфигурации
- `--reset` - Сбросить конфигурацию к настройкам по умолчанию

### 📋 Проверка статуса

```bash
telegraph-publisher status [опции]
```

**Опции:**
- `-f, --file <path>` - Путь к файлу для проверки статуса
- `--show-deps` - Показать статус зависимостей
- `--show-cache` - Показать информацию о кэше

### 🔧 Проверка и исправление ссылок

```bash
telegraph-publisher check-links [path] [опции]
```

**Опции:**
- `--fix` - Автоматически исправить найденные проблемы
- `--apply-fixes` - Применить исправления интерактивно
- `--report` - Создать подробный отчёт о ссылках

### 🔄 Сброс состояния

```bash
telegraph-publisher reset [опции]
```

**Опции:**
- `--cache` - Очистить кэш страниц
- `--metadata` - Удалить метаданные из файлов
- `--config` - Сбросить конфигурацию
- `--all` - Сбросить все данные

### 🧹 Очистка Markdown

```bash
telegraph-publisher clean-md --file <path>
```

Удаляет избыточные пробелы и пустые строки из Markdown файлов.

### 📋 Список страниц (Legacy)

```bash
telegraph-publisher list-pages --token <token>
```

## 🎨 Поддерживаемый Markdown

### Стандартные элементы
- **Заголовки**: `# H1` - `###### H6` с автоматической генерацией якорей
- **Текстовое форматирование**: `**жирный**`, `*курсив*`, `` `код` ``
- **Ссылки**: `[текст](URL)` с автоматической заменой локальных путей
- **Списки**: Нумерованные и маркированные с поддержкой вложенности
- **Цитаты**: `> Блок-цитата`
- **Горизонтальные линии**: `---` или `***`
- **Блоки кода**: Тройные обратные кавычки с подсветкой синтаксиса

### Расширенные функции

#### Table of Contents (ToC)
Автоматическая генерация оглавления в виде `<aside>` блока:
- Поддержка заголовков всех уровней (H1-H6)
- H5/H6 отображаются как H4 с визуальными префиксами (`> H5`, `>> H6`)
- Автоматические якорные ссылки
- Интеллектуальная обработка ссылок в заголовках (предотвращение вложенных ссылок)

#### Таблицы
Автоматическое преобразование в читаемый формат:

**Входные данные:**
```markdown
| Продукт | Цена | Количество |
| ------- | ---- | ---------- |
| Яблоки  | 100  | 5 кг       |
| Бананы  | 80   | 2 кг       |
```

**Результат:**
- 1
  - Продукт: Яблоки
  - Цена: 100
  - Количество: 5 кг
- 2
  - Продукт: Бананы
  - Цена: 80
  - Количество: 2 кг

## 🔗 Интеллектуальное управление ссылками

### Типы ссылок
- **Локальные файлы**: `[текст](./file.md)` → автоматическая замена на Telegraph URL
- **Якорные ссылки**: `[текст](#section)` → проверка существования якорей
- **Внешние URL**: `[текст](https://example.com)` → проверка доступности
- **Относительные пути**: `[текст](../folder/file.md)` → разрешение путей

### Автоматические исправления
- Исправление регистра файлов (`File.md` → `file.md`)
- Добавление расширений (`.md`, `.markdown`)
- Исправление путей (`file` → `./file.md`)
- Обновление устаревших ссылок

### Проверки безопасности
- Обнаружение циклических зависимостей
- Валидация существования файлов
- Проверка доступности внешних ресурсов
- Анализ целостности структуры проекта

## 📁 Структура файлов и метаданные

### YAML Front-matter
Автоматически добавляется к опубликованным файлам:

```yaml
---
telegraphUrl: "https://telegra.ph/article-title-01-01"
editPath: "article-title-01-01"
username: "author-name"
publishedAt: "2025-01-01T12:00:00.000Z"
originalFilename: "article.md"
title: "Article Title"
contentHash: "sha256-hash-of-content"
---
```

### Кэш страниц
Система автоматически кэширует информацию о публикациях:
- Быстрый доступ к метаданным
- Отслеживание изменений контента
- Оптимизация повторных публикаций

## 🎯 Практические примеры

### Генерация EPUB книги

Создание электронной книги из нескольких Markdown файлов:

```bash
# Генерация EPUB из всех глав книги
telegraph-publisher epub \
  -f chapter1.md chapter2.md chapter3.md \
  -a "Автор Книги" \
  -t "Название Книги" \
  -o "МояКнига.epub" \
  --with-dependencies

# Генерация EPUB с обложкой
telegraph-publisher epub \
  -f chapter1.md chapter2.md chapter3.md \
  -a "Автор Книги" \
  -t "Название Книги" \
  --cover cover.jpg \
  -o "МояКнига.epub"

# Генерация с кастомными настройками
telegraph-publisher epub \
  -f intro.md main.md conclusion.md \
  -a "Иван Иванов" \
  --language ru \
  --toc-title "Содержание" \
  --toc-separators

# Генерация в режиме отладки (для анализа структуры)
telegraph-publisher epub \
  -f chapter1.md chapter2.md \
  -a "Автор" \
  --debug \
  -o "debug-book.epub"
```

**Результат:** Валидный EPUB файл, готовый для чтения в любой читалке электронных книг.

### Публикация книги по главам
```bash
# Настройка
telegraph-publisher config --username "Автор Книги" --max-depth 5

# Публикация главной страницы со всеми зависимостями
telegraph-publisher pub -f book/index.md --with-dependencies

# Анализ структуры
telegraph-publisher analyze -f book/index.md --show-tree
```

### Работа с блогом
```bash
# Публикация отдельного поста
telegraph-publisher pub -f posts/2025-01-01-new-post.md

# Проверка и исправление ссылок
telegraph-publisher check-links posts/ --apply-fixes

# Массовая публикация
telegraph-publisher pub posts/
```

### Отладка и тестирование
```bash
# Предварительный просмотр
telegraph-publisher pub -f article.md --dry-run

# Отладка с сохранением JSON
telegraph-publisher pub -f article.md --debug

# Принудительная переиндексация
telegraph-publisher pub -f article.md --force-republish
```

## 🛠️ Разработка

### Запуск тестов
```bash
# Все тесты
bun test

# С покрытием
bun test --coverage

# В режиме наблюдения
bun test --watch

# Только unit тесты
bun test src/**/*.test.ts
```

### Режим разработки
```bash
# Запуск с перезагрузкой
bun --watch src/cli.ts pub --file test-article.md --dry-run

# Сборка
bun run build
```

### Структура проекта
```
telegraph-publisher/
├── src/
│   ├── cli/                     # CLI интерфейс и команды
│   │   ├── EnhancedCommands.ts  # Все современные команды
│   │   └── ProgressIndicator.ts # Индикация прогресса
│   ├── workflow/                # Рабочие процессы
│   │   └── PublicationWorkflowManager.ts
│   ├── publisher/               # Система публикации
│   │   └── EnhancedTelegraphPublisher.ts
│   ├── dependencies/            # Управление зависимостями
│   │   └── DependencyManager.ts
│   ├── links/                   # Система обработки ссылок
│   │   ├── LinkScanner.ts       # Сканирование ссылок
│   │   ├── LinkVerifier.ts      # Проверка ссылок
│   │   ├── AutoRepairer.ts      # Автоисправление
│   │   └── BidirectionalLinkResolver.ts
│   ├── metadata/                # Управление метаданными
│   │   └── MetadataManager.ts
│   ├── cache/                   # Система кэширования
│   │   └── PagesCacheManager.ts
│   ├── content/                 # Обработка контента
│   │   └── ContentProcessor.ts
│   ├── config/                  # Управление конфигурацией
│   │   └── ConfigManager.ts
│   ├── utils/                   # Утилиты
│   ├── types/                   # TypeScript типы
│   ├── markdownConverter.ts     # Конвертация Markdown
│   ├── telegraphPublisher.ts    # Базовый Telegraph API
│   ├── clean_mr.ts              # Очистка Markdown
│   └── cli.ts                   # Главный CLI
├── dist/                        # Собранные файлы
├── tests/                       # Интеграционные тесты
└── package.json
```

## 🔧 API для разработчиков

### EnhancedTelegraphPublisher
```typescript
import { EnhancedTelegraphPublisher } from "./src/publisher/EnhancedTelegraphPublisher";

const publisher = new EnhancedTelegraphPublisher();

// Публикация с метаданными
const result = await publisher.publishWithMetadata(
  "article.md",
  "author-name",
  {
    withDependencies: true,
    generateAside: true,
    dryRun: false
  }
);
```

### DependencyManager
```typescript
import { DependencyManager } from "./src/dependencies/DependencyManager";

const manager = new DependencyManager(config, pathResolver);
const analysis = await manager.analyzeDependencies("main.md");
console.log(analysis.publishOrder); // Порядок публикации
```

### LinkVerifier
```typescript
import { LinkVerifier } from "./src/links/LinkVerifier";

const verifier = new LinkVerifier();
const results = await verifier.verifyFile("article.md");
console.log(results.brokenLinks); // Сломанные ссылки
```

## ⚡ Производительность и оптимизация

### Кэширование
- Автоматическое кэширование метаданных страниц
- Hash-based определение изменений контента
- Пропуск публикации неизменённых файлов

### Оптимизация сети
- Batch-обработка зависимостей
- Параллельная проверка ссылок
- Rate limiting для Telegraph API

### Память и производительность
- Потоковая обработка больших файлов
- Эффективное управление памятью
- Быстрый Bun runtime

## 🔒 Безопасность

### Валидация контента
- Проверка на недопустимый HTML
- Валидация размера контента (64 КБ лимит)
- Санитизация пользовательского ввода

### Управление токенами
- Автоматическое сохранение access token
- Безопасное хранение конфигурации
- Поддержка переменных окружения

## 📋 Конфигурация

### Файл конфигурации (`.telegraph-publisher-config.json`)
```json
{
  "accessToken": "your-access-token", // Создается автоматически при первой публикации если отсутствует
  "defaultUsername": "Default Author",
  "maxDependencyDepth": 10,
  "autoPublishDependencies": true
}
```

**Примечание:** Поле `accessToken` создается автоматически при первом запуске команды публикации, если токен отсутствует. Вы можете установить собственный токен или позволить системе создать его автоматически.

### Переменные окружения
- `TELEGRAPH_TOKEN` - Access token
- `TELEGRAPH_USERNAME` - Автор по умолчанию
- `TELEGRAPH_MAX_DEPTH` - Максимальная глубина зависимостей

## 📈 Статистика проекта

- **Тестов**: 472+ (100% покрытие критического кода)
- **Файлов**: 50+ TypeScript модулей
- **Команд**: 8 основных команд CLI
- **Функций**: 200+ документированных функций
- **Типов**: 50+ TypeScript интерфейсов

## 🏆 Преимущества

- **Полная автоматизация** рабочего процесса публикации
- **Интеллектуальное управление** зависимостями и ссылками
- **Высокая производительность** благодаря кэшированию и оптимизации
- **Безопасность и надёжность** с комплексной валидацией
- **Гибкость конфигурации** под любые потребности
- **Отличное покрытие тестами** для стабильности

## 🤝 Вклад в проект

Проект развивается с использованием методологии Test-Driven Development (TDD).
Приветствуются pull requests, bug reports и предложения по улучшению.

## 📄 Лицензия

MIT

## 👨‍💻 Автор

Создано с использованием современных подходов к разработке CLI инструментов и методологии TDD.

---

*Response generated using Claude 3.5 Sonnet*
