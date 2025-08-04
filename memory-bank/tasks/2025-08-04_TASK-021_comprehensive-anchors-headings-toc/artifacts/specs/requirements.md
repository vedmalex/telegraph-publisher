# Technical Requirements: Comprehensive Anchors, Headings & ToC System

## User Specifications Summary

Пользователь предоставил детальный анализ трех взаимосвязанных проблем в системе Telegraph-Publisher и подготовил три технические спецификации для их решения.

### Problem Context

1. **Неправильная генерация якорей**: Функция `generateSlug` в `LinkVerifier.ts` не соответствует спецификации `anchors.md`
2. **Потеря якорей для H5/H6**: Заголовки 5-6 уровней конвертируются в `<p>`, теряя возможность создания якорей
3. **Отсутствие автоматического оглавления**: Нет генерации `<aside>` блоков для навигации

## Technical Specification 1: FEAT-ANCHOR-REFACTOR-001

### Objective
Исправить функцию генерации якорей для соответствия спецификации `anchors.md`.

### Current Implementation Issue
```typescript
private generateSlug(text: string): string {
  return text
    .toLowerCase()                              // ❌ Не должно приводить к нижнему регистру
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\s-]/g, '') // ❌ Удаляет спецсимволы
    .replace(/\s+/g, '-');
}
```

### Required Implementation
```typescript
/**
 * Generates a URL-friendly anchor from a heading text according to Telegra.ph rules.
 * @param text The heading text.
 * @returns An anchor string with spaces replaced by hyphens.
 */
private generateSlug(text: string): string {
  // Per anchors.md spec: only replace spaces with hyphens. Keep case and all other characters.
  return text.trim().replace(/ /g, '-');
}
```

### Acceptance Criteria
- `"Мой якорь"` → `"Мой-якорь"`
- `"Пример заголовка №1"` → `"Пример-заголовка-№1"`
- `"Section Title"` → `"Section-Title"` (регистр сохраняется)

## Technical Specification 2: FEAT-HEADING-STRATEGY-001

### Objective
Изменить стратегию конвертации заголовков для сохранения возможности создания якорей для всех уровней.

### Current Implementation Issue
```typescript
switch (level) {
  case 5:
    nodes.push({ tag: 'p', children: [{ tag: 'strong', children: processedChildren }] }); // ❌ Нет якоря
    break;
  case 6:
    nodes.push({ tag: 'p', children: [{ tag: 'strong', children: [{ tag: 'em', children: processedChildren }] }] }); // ❌ Нет якоря
    break;
}
```

### Required Implementation
```typescript
const headingMatch = line.match(/^(#+)\s*(.*)/);
if (headingMatch?.[1] && headingMatch[2] !== undefined) {
    const level = headingMatch[1].length;
    const originalText = headingMatch[2] || "";
    let displayText = originalText;
    let tag: 'h3' | 'h4' = 'h3';

    switch (level) {
        case 1:
        case 2:
        case 3:
            tag = 'h3';
            break;
        case 4:
            tag = 'h4';
            break;
        case 5:
            tag = 'h4'; // ✅ Используем h4 для создания якоря
            displayText = `» ${originalText}`; // ✅ Визуальный префикс
            break;
        case 6:
            tag = 'h4'; // ✅ Используем h4 для создания якоря  
            displayText = `»» ${originalText}`; // ✅ Визуальный префикс
            break;
        default:
            tag = 'h4';
            break;
    }
    
    const processedChildren = processInlineMarkdown(displayText);
    nodes.push({ tag, children: processedChildren });
    continue;
}
```

### Acceptance Criteria
- `##### Заголовок 5` → `{ tag: 'h4', children: ['» Заголовок 5'] }`
- `###### Заголовок 6` → `{ tag: 'h4', children: ['»» Заголовок 6'] }`
- Все заголовки теперь генерируют якоря

## Technical Specification 3: FEAT-ASIDE-TOC-GENERATION-001

### Objective
Реализовать автоматическую генерацию оглавления в виде блока `<aside>`.

### Required Implementation

#### A. Helper Function `generateTocAside`
```typescript
function generateTocAside(markdown: string): TelegraphNode | null {
    const headings: { level: number; text: string; displayText: string }[] = [];
    const lines = markdown.split(/\r?\n/);
    
    // 1. Scan for all headings
    for (const line of lines) {
        const headingMatch = line.match(/^(#+)\s+(.*)/);
        if (headingMatch?.[1] && headingMatch[2]) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            let displayText = text;

            if (level === 5) displayText = `» ${text}`;
            if (level === 6) displayText = `»» ${text}`;

            headings.push({ level, text, displayText });
        }
    }

    if (headings.length < 2) {
        return null; // No ToC needed for <2 headings
    }

    // 2. Build TelegraphNode structure
    const listItems: TelegraphNode[] = [];
    for (const heading of headings) {
        // Use same slug generation as LinkVerifier
        const anchor = heading.displayText.trim().replace(/ /g, '-');
        
        const linkNode: TelegraphNode = {
            tag: 'a',
            attrs: { href: `#${anchor}` },
            children: [heading.displayText]
        };
        
        listItems.push({
            tag: 'li',
            children: [linkNode],
        });
    }

    return {
        tag: 'aside',
        children: [{
            tag: 'ul',
            children: listItems
        }]
    };
}
```

#### B. Integration in `convertMarkdownToTelegraphNodes`
```typescript
export function convertMarkdownToTelegraphNodes(markdown: string): TelegraphNode[] {
    const nodes: TelegraphNode[] = [];
    
    // ✅ Generate and add ToC aside block
    const tocAside = generateTocAside(markdown);
    if (tocAside) {
        nodes.push(tocAside);
    }

    const lines = markdown.split(/\r?\n/);
    // ... (rest of existing logic) ...
    return nodes;
}
```

### Acceptance Criteria
- При 2+ заголовках создается блок `<aside>` в начале страницы
- Блок содержит `<ul>` со ссылками на заголовки  
- Ссылки используют правильные якоря из Spec 1
- Текст ссылок включает префиксы из Spec 2
- При <2 заголовков блок не создается

## Implementation Dependencies

### Sequential Implementation Required
1. **First**: FEAT-ANCHOR-REFACTOR-001 (базовая функция генерации якорей)
2. **Second**: FEAT-HEADING-STRATEGY-001 (стратегия заголовков использует якоря)
3. **Third**: FEAT-ASIDE-TOC-GENERATION-001 (оглавление использует оба предыдущих)

### File Modification Scope
- `src/links/LinkVerifier.ts` - Метод `generateSlug`
- `src/markdownConverter.ts` - Логика заголовков + функция `generateTocAside`

### Testing Requirements
- Unit tests для каждой спецификации
- Integration tests для полного workflow
- Edge cases: пустые заголовки, спецсимволы, одиночные заголовки
- Backward compatibility tests

## Quality Standards

- **Code Coverage**: 85% minimum
- **Test Success Rate**: 100%
- **Performance**: Не должно значительно замедлить конвертацию
- **Compatibility**: Сохранить совместимость с существующими публикациями

## Technical Constraints

- Использовать только теги, поддерживаемые Telegra.ph API
- Сохранить структуру `TelegraphNode`
- Минимизировать breaking changes
- Обеспечить deterministic behavior для одинакового входа