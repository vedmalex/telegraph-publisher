# Валидация и обработка ссылок

## Компоненты

### LinkScanner (`src/links/LinkScanner.ts`)
Сканирует файл и находит все ссылки:

- Локальные (`./other.md`, `../file.md`)
- Внешние (https://...)
- Якорные (`#section`)
- Изображения (`![alt](path.png)`)
- Bidirectional ссылки

### LinkVerifier (`src/links/LinkVerifier.ts`)
Верифицирует найденные ссылки:

- HEAD/GET запросы для внешних URL
- Проверка существования локальных файлов
- Валидация якорей через AnchorCacheManager
- Timeout и retry логика

### AutoRepairer (`src/links/AutoRepairer.ts`)
Автоматический ремонт битых ссылок:

- Поиск ближайшего совпадения по имени файла
- Исправление путей относительно project root
- Интерактивный режим для ручного подтверждения

### LinkResolver (`src/links/LinkResolver.ts`)
Замена локальных ссылок после публикации:

- `./file.md` → `https://telegra.ph/path-to-file`
- Маппинг originalPath → Telegraph URL
- Рекурсивная обработка зависимостей

### BidirectionalLinkResolver
Разрешает bidirectional ссылки в Markdown.

### ReportGenerator
Генерирует отчёты о состоянии ссылок.

## Типы ссылок

```typescript
// src/links/types.ts
interface BrokenLink {
  file: string;
  link: string;
  line: number;
  column: number;
  type: 'local' | 'external' | 'anchor';
  status: 'broken' | 'suspicious';
}

interface FileScanResult {
  filePath: string;
  links: Array<{
    url: string;
    type: 'local' | 'external' | 'anchor' | 'image';
    line: number;
    column: number;
  }>;
}
```

## CLI

```bash
# Проверка ссылок
telegraph-publisher check-links -f article.md

# С автоисправлением
telegraph-publisher check-links -f article.md --fix

# Интерактивный режим
telegraph-publisher check-links -f article.md --interactive

# Подробный вывод
telegraph-publisher check-links -f article.md --verbose
```
