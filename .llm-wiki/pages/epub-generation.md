# Генерация EPUB

## Обзор

Генерация EPUB реализована через `EpubGenerator` и использует тот же механизм конвертации Markdown, что и публикация в Telegra.ph.

## Компоненты

### EpubGenerator (`src/epub/EpubGenerator.ts`)

- **Вход:** один или несколько Markdown файлов
- **Выход:** EPUB файл (OEBPS формат)
- **Опции:** заголовок, автор, выходной путь

### Процесс

1. Парсинг Markdown через `markdownConverter` (переиспользование)
2. Построение структуры EPUB:
   - OPF манифест
   - NCX навигация (TOC)
   - XHTML контент
3. Добавление метаданных (DC метаданные)
4. Публикация EPUB (сборка .epub архива)

### CLI

```bash
telegraph-publisher epub -f article.md -o output.epub --title "Title" --author "Author"
```

## Особенности

- **Переиспользование conversion engine:** EPUB использует ту же логику конвертации, что и Telegraph публикация
- **Поддержка TOC:** автоматическая генерация оглавления на основе заголовков
- **Метаданные:** DC title, creator, language, date
- **Тестирование:** `EpubGenerator.test.ts` — модульные тесты генерации

## Ограничения

- EPUB 2 (не EPUB 3)
- Базовая поддержка CSS
- Изображения встраиваются как base64
