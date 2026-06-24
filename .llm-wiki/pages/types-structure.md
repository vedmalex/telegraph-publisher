# Система типов

## Основные типы

### Telegraph API

```typescript
// src/types/publisher.ts
interface PublishDependenciesResult {
  success: boolean;
  error?: string;
  publishedFiles?: string[];
  linkMappings?: Record<string, string>;
}

interface PublishDependenciesOptions {
  dryRun?: boolean;
  debug?: boolean;
  force?: boolean;
  generateAside?: boolean;
  inlineToC?: boolean;
  tocTitle?: string;
  tocSeparators?: boolean;
}
```

### Метаданные

```typescript
// src/types/metadata.ts
enum PublicationStatus {
  Published = "published",
  Pending = "pending",
  Failed = "failed",
  Unchanged = "unchanged",
}

interface FileMetadata {
  title?: string;
  url?: string;
  path?: string;
  author_name?: string;
  author_url?: string;
  published?: string;
  updated?: string;
  hash?: string;
  dependencies?: string[];
  status?: PublicationStatus;
  version?: number;
}

interface MetadataConfig {
  debug?: boolean;
  dryRun?: boolean;
  force?: boolean;
  rateLimiting?: RateLimitConfig;
  // ... другие опции
}
```

### TelegraphPublisher (базовый API клиент)

```typescript
// src/telegraphPublisher.ts
interface TelegraphNode {
  tag?: string;
  attrs?: Record<string, string>;
  children?: (string | TelegraphNode)[];
}

interface TelegraphPage {
  path: string;
  url: string;
  title: string;
  description?: string;
  author_name?: string;
  author_url?: string;
  image_url?: string;
  views?: number;
  can_edit?: boolean;
}
```

### Ссылки

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

## Паттерн OptionsPropagation

```typescript
class OptionsPropagationChain {
  // Цепочка распространения опций через слои publisher
  // LayerIntegrationPattern — интеграция между слоями
}
```

## PublishOptionsBuilder

Builder-паттерн для сложных сценариев:

```typescript
PublishOptionsBuilder.create()
  .dryRun(true)
  .inlineToC(true)
  .tableOfContents({ title: "Содержание", separators: true })
  .buildValidated()
```
