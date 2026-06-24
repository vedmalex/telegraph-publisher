# Конвертация Markdown → Telegraph Node

## Ядро: markdownConverter.ts

`markdownConverter.ts` — сердце проекта (1056 строк). Преобразует Markdown напрямую в Telegraph Node, **без промежуточного HTML**.

## Поддерживаемый синтаксис

| Markdown | Telegraph Node |
|----------|---------------|
| `# h1` – `###### h6` | `<h1>` – `<h6>` |
| `**bold**`, `__bold__` | `<b>` |
| `*italic*`, `_italic_` | `<i>` |
| `[text](url)` | `<a href="url">` |
| `![alt](src)` | `<img src="src">` |
| `- item` / `1. item` | `<ul>` / `<ol>` |
| `` `code` `` | `<code>` |
| `> quote` | `<blockquote>` |
| `` ``` `` блок | `<pre>` |
| `---` | `<hr>` |
| Таблицы | Вложенные списки ( `<ul>` ) |
| Сноски (footnotes) | Поддерживаются |

## Table of Contents (ToC)

- **Aside ToC:** плавающий блок сбоку
- **Inline ToC:** встраивается в текст
- **Якорные ссылки:** `[text](#section-id)`
- **Настройка:** `--toc-title`, `--toc-separators`

## Якоря (AnchorGenerator)

`AnchorGenerator` (`src/utils/AnchorGenerator.ts`) отвечает за:

- Генерацию slug из заголовков (транслитерация кириллицы)
- Дедупликацию якорей
- Кэширование якорей (AnchorCacheManager)
- Обработку вложенных заголовков

## Конвертация таблиц

Так как Telegraph не поддерживает `<table>`, таблицы конвертируются во вложенные списки:

```
Header1 | Header2
--------|--------
Cell1   | Cell2
```

превращается в:

```
<ul>
  <li>Header1
    <ul><li>Header2</li></ul>
  </li>
  <li>Cell1
    <ul><li>Cell2</li></ul>
  </li>
</ul>
```

## Валидация

- **Размер:** проверка лимита 64KB (Telegraph API)
- **HTML теги:** `validateCleanedContent` запрещает HTML
- **Структура:** проверка корректности дерева Node
