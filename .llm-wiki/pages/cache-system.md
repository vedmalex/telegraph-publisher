# Кэширование

## Компоненты

### PagesCacheManager

Кэш опубликованных страниц. Хранит маппинг: `filename → { path, url, hash, timestamp }`.

- **Файл:** `.telegraph-pages-cache.json`
- **Структура:** `{ [filename: string]: CachedPageInfo }`
- **Методы:** `cachePage`, `getCachedPage`, `hasChanged`, `removeCachedPage`, `clearCache`

### AnchorCacheManager

Кэш якорей (заголовков) страниц. Используется для валидации внутренних ссылок.

- **Файл:** `.telegraph-anchors-cache.json`
- **Структура:** `{ [path: string]: { anchors: string[], timestamp: string } }`
- **Методы:** `updateCache`, `getAnchors`, `validateAnchors`, `clearCache`

## Стратегии кэширования

### Hash-based optimization

При публикации вычисляется MD5 хэш содержимого файла (без YAML front-matter):

```typescript
const currentHash = ContentProcessor.calculateContentHash(content);
```

Если хэш совпадает с сохранённым — файл пропускается (skip). Это основной механизм оптимизации.

### Pre-warming Cache Strategy

- Cache manager инициализируется до начала публикации
- В dry-run режиме кэш всё равно прогревается для консистентности
- Proactive validation: существующие данные из кэша загружаются заранее

### Non-Blocking Cache Operations

- Валидация кэша не блокирует основной поток публикации
- Используется graceful degradation при ошибках кэша

### Force-republish

Флаг `--force-republish`:
1. Пропускает проверку хэша
2. Принудительно обновляет страницу на Telegra.ph
3. Обновляет кэш с новыми данными

## Управление кэшем

- `reset --all` — полный сброс всех кэшей
- `reset --anchors` — сброс кэша якорей
- `reset --pages` — сброс кэша страниц
- `reset --metadata` — сброс метаданных
- `cache-validate` — проверка целостности кэша
- `status` — отображение статуса файла (изменён/не изменён)
