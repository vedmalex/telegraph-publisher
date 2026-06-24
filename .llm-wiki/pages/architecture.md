# Архитектура Telegraph Publisher

## Обзор

**Telegraph Publisher** — CLI-инструмент на Bun/TypeScript для публикации Markdown в Telegra.ph. Поддерживает EPUB, GitHub Gist, PDF/SVG, управление зависимостями, кэширование и валидацию ссылок.

## Стек

- **Runtime:** Bun
- **Язык:** TypeScript (ESNext, strict)
- **CLI:** Commander.js
- **Markdown:** marked v17
- **PDF/SVG:** Puppeteer-core
- **Тесты:** Bun test + Vitest coverage
- **Линтер:** Biome

## Модульная структура

```
src/
├── cli.ts                          # Entry point, Commander program
├── cli/                            # Команды и прогресс-индикатор
├── publisher/                      # Ядро публикации
├── workflow/                       # Оркестрация workflow
├── markdownConverter.ts            # MD → Telegraph Node
├── telegraphPublisher.ts           # Базовый клиент Telegra.ph API
├── content/                        # Препроцессинг контента
├── links/                          # Сканирование/валидация/ремонт ссылок
├── cache/                          # Кэширование страниц и якорей
├── metadata/                       # YAML front-matter
├── dependencies/                   # Дерево зависимостей
├── config/                         # Иерархическая конфигурация
├── epub/                           # Генерация EPUB
├── svg/                            # Генерация SVG/PDF
├── ratelimiter/                    # Rate limiting Telegra.ph API
├── utils/                          # Утилиты (AnchorGenerator, PathResolver)
├── types/                          # TypeScript типы
├── errors/                         # Кастомные ошибки
├── optimization/                   # Hash-based оптимизация
├── patterns/                       # Паттерны (OptionsPropagation)
├── tests/                          # Edge case и stress тесты
└── integration/                    # E2E интеграционные тесты
```

## Слои архитектуры

### 1. CLI слой (cli.ts + cli/)

Точка входа. Использует `commander` для парсинга аргументов. Регистрирует команды через `EnhancedCommands`:

- `pub` — универсальная публикация
- `analyze` — анализ зависимостей
- `config` — управление конфигурацией
- `status` — статус файла
- `reset` — сброс кэша
- `check-links` — проверка ссылок
- `cache-validate` — валидация кэша
- `epub` — генерация EPUB
- `svg` / `pdf` — генерация изображений/PDF
- `gist` — публикация в GitHub Gist

### 2. Workflow слой (workflow/)

`PublicationWorkflowManager` оркестрирует полный цикл публикации:
1. Инициализация и валидация кэшей
2. Сканирование и верификация ссылок
3. Авторемонт битых ссылок
4. Публикация через `EnhancedTelegraphPublisher`
5. Замена локальных ссылок на Telegraph URL

### 3. Publisher слой (publisher/)

`EnhancedTelegraphPublisher` — расширение базового `TelegraphPublisher`:
- Управление метаданными (YAML front-matter)
- Публикация с зависимостями
- Hash-based оптимизация (пропуск неизменённых файлов)
- Rate limiting с интеллектуальной очередью
- Auto-registration страниц
- Поддержка force-republish

### 4. Конвертация (markdownConverter.ts)

Прямая конвертация Markdown в Telegraph Node (без промежуточного HTML):
- Заголовки h1-h6 → header теги
- Списки ul/ol → списки Telegraph
- Таблицы → вложенные списки
- Код с подсветкой синтаксиса
- ToC (table of contents)
- Якорные ссылки
- Цитаты, ссылки, изображения

### 5. Инфраструктурный слой

- **cache/**: AnchorCacheManager + PagesCacheManager (JSON-файлы)
- **links/**: LinkScanner, LinkVerifier, AutoRepairer, LinkResolver
- **dependencies/**: DependencyManager — дерево зависимостей между файлами
- **config/**: HierarchicalConfigCache + IntelligentConfigMerger
- **ratelimiter/**: RateLimiter + CountdownTimer
- **metadata/**: MetadataManager — чтение/запись YAML front-matter

## Поток данных

```
Markdown file
    ↓
ContentProcessor (препроцессинг)
    ↓
MetadataManager (извлечение/добавление front-matter)
    ↓
DependencyManager (построение дерева зависимостей)
    ↓
LinkScanner (поиск ссылок) → LinkVerifier (верификация) → AutoRepairer
    ↓
convertMarkdownToTelegraphNodes (MD → Telegraph Node)
    ↓
EnhancedTelegraphPublisher (публикация через Telegraph API)
    ↓
LinkResolver (замена локальных ссылок на Telegraph URL)
    ↓
MetadataManager (обновление front-matter с URL)
    ↓
PagesCacheManager (кэширование результата)
```

## Ключевые паттерны

- **OptionsPropagationChain**: цепочка распространения опций через слои
- **LayerIntegrationPattern**: интеграция между слоями через абстракции
- **Intelligent Rate Limit Queue**: адаптивная очередь с учётом лимитов
- **Hash-based optimization**: MD5 хэш контента для пропуска неизменённых файлов
