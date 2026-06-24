# Publishing Pipeline

## Общий поток публикации

### 1. Инициализация

`EnhancedCommands.handleUnifiedPublishCommand`:

1. Разрешение путей файлов (один файл, директория или рекурсивный обход)
2. Создание `PublicationWorkflowManager` с конфигурацией и access token
3. Инициализация подсистем (кэш, метаданные, линковщик)

### 2. Pre-processing

`PublicationWorkflowManager.publish`:

1. **Cache pre-warming**: инициализация PagesCacheManager, валидация anchor cache
2. **Сбор файлов**: определение набора файлов для публикации
3. **Проверка хэшей**: вычисление MD5 хэша контента, пропуск неизменённых

### 3. Обработка ссылок

- `LinkScanner.scanFile` — поиск всех ссылок в файле
- `LinkVerifier.verifyLinks` — проверка доступности (HEAD запросы для внешних)
- `AutoRepairer.repairLinks` — авторемонт битых ссылок

### 4. Конвертация

`convertMarkdownToTelegraphNodes`:
- Парсинг Markdown через `marked`
- Построение дерева TelegraphNode
- Генерация ToC, якорных ссылок
- Валидация размера (лимит 64KB)

### 5. Публикация

`EnhancedTelegraphPublisher.publishWithMetadata`:

1. Проверка хэша → пропуск если контент не изменился
2. Создание/обновление страницы через Telegraph API
3. Rate limiting через `IntelligentRateLimitQueueManager`
4. При превышении лимита — переключение аккаунта (account switching)

### 6. Post-processing

- `LinkResolver.replaceLinks` — замена локальных ссылок на Telegraph URL
- `MetadataManager.addMetadata` — обновление YAML front-matter с URL
- `PagesCacheManager.cachePage` — сохранение результата в кэш
- `AnchorCacheManager.updateCache` — обновление кэша якорей

## Работа с зависимостями

`DependencyManager.buildDependencyTree`:

- Построение графа зависимостей между .md файлами
- Определение порядка публикации (сначала зависимости)
- Фильтрация по глубине (max_depth)
- Публикация зависимостей перед основным файлом

## Форматы вывода

### Telegra.ph
- Прямая публикация через Telegraph API
- Поддержка create/edit страниц
- Автоматическая замена ссылок

### EPUB
- Генерация через `EpubGenerator`
- Использует тот же механизм конвертации Markdown
- Поддержка TOC, метаданных, обложки

### GitHub Gist
- Публикация через GitHub API
- Создание приватных/публичных gist
- Один файл за раз

### SVG/PDF
- Рендеринг через Puppeteer (headless Chromium)
- SVG — векторная графика
- PDF — через печать SVG в Puppeteer
