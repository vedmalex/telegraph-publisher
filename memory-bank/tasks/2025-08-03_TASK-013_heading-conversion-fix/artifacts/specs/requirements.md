# Техническая спецификация: Корректная обработка заголовков Markdown H1-H6

## Введение и постановка проблемы

**Проблема:**
Текущая реализация в `src/markdownConverter.ts` преобразует заголовки Markdown (`#` ... `######`) в HTML-эквиваленты `<h1>`...`<h6>`. Однако, согласно официальной документации API Telegra.ph, для заголовков поддерживаются только теги `<h3>` и `<h4>`. Использование неподдерживаемых тегов (`h1`, `h2`, `h5`, `h6`) может привести к ошибкам при отправке данных в API или к тому, что контент будет отображаться некорректно (например, как обычный текст).

**Цель:**
Модифицировать логику конвертации Markdown для корректного отображения всех уровней заголовков (H1-H6) с использованием только разрешенных API Telegra.ph тегов, сохраняя при этом визуальную иерархию контента.

## Анализ текущего состояния

**Файл:** `src/markdownConverter.ts`
**Функция:** `convertMarkdownToTelegraphNodes`

**Текущая логика:**
```typescript
const headingMatch = line.match(/^(#+)\s*(.*)/);
if (headingMatch?.[1] && headingMatch[2] !== undefined) {
  // ...
  const level = Math.min(6, headingMatch[1].length); // Определяет уровень заголовка H1-H6
  const text = headingMatch[2] || "";
  nodes.push({ tag: `h${level}`, children: processInlineMarkdown(text) }); // Генерирует h1, h2, h5, h6
  continue;
}
```

**Недостаток:** Эта логика напрямую создает неподдерживаемые теги, что приводит к несовместимости с API.

## Предлагаемое решение

Предлагается следующая стратегия сопоставления (маппинга) уровней заголовков Markdown в поддерживаемые Telegra.ph элементы:

| Уровень Markdown | Тег    | Telegra.ph Элемент                                    | Обоснование                                                                                              |
| :--------------- | :----- | :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `# (H1)`         | `<h1>` | `<h3>`                                                | Используем самый высокий доступный уровень заголовка в Telegra.ph.                                       |
| `## (H2)`        | `<h2>` | `<h3>`                                                | Аналогично H1, сопоставляем с самым высоким доступным уровнем.                                           |
| `### (H3)`       | `<h3>` | `<h3>`                                                | Прямое соответствие поддерживаемому тегу.                                                                |
| `#### (H4)`      | `<h4>` | `<h4>`                                                | Прямое соответствие поддерживаемому тегу.                                                                |
| `##### (H5)`     | `<h5>` | `<p>` с вложенным `<strong>`                          | Эмуляция заголовка нижнего уровня с помощью жирного текста, что является поддерживаемым форматированием. |
| `###### (H6)`    | `<h6>` | `<p>` с вложенным `<strong>` и `<em>` (жирный курсив) | Эмуляция самого низкого уровня заголовка с помощью жирного курсива для визуального отличия.              |

## Детали реализации

**Затронутый файл:** `src/markdownConverter.ts`

**Новый код:**
```typescript
const headingMatch = line.match(/^(#+)\s*(.*)/);
if (headingMatch?.[1] && headingMatch[2] !== undefined) {
    // ... (код закрытия открытых блоков)
    const level = headingMatch[1].length;
    const text = headingMatch[2] || "";
    const processedChildren = processInlineMarkdown(text);

    switch (level) {
        case 1:
        case 2:
        case 3:
            nodes.push({ tag: 'h3', children: processedChildren });
            break;
        case 4:
            nodes.push({ tag: 'h4', children: processedChildren });
            break;
        case 5:
            nodes.push({
                tag: 'p',
                children: [{ tag: 'strong', children: processedChildren }]
            });
            break;
        case 6:
            nodes.push({
                tag: 'p',
                children: [{ tag: 'strong', children: [{ tag: 'em', children: processedChildren }] }]
            });
            break;
        default:
            // Обработка уровней > 6 как H4 (на всякий случай)
            nodes.push({ tag: 'h4', children: processedChildren });
            break;
    }
    continue;
}
```

## Критерии приемки

1. Markdown-заголовки `# H1`, `## H2`, `### H3` корректно преобразуются в узел Telegra.ph `{ tag: 'h3', ... }`.
2. Markdown-заголовок `#### H4` корректно преобразуется в узел `{ tag: 'h4', ... }`.
3. Markdown-заголовок `##### H5` преобразуется в узел `{ tag: 'p', children: [{ tag: 'strong', ... }] }`.
4. Markdown-заголовок `###### H6` преобразуется в узел `{ tag: 'p', children: [{ tag: 'strong', children: [{ tag: 'em', ... }] }] }`.
5. Функция `convertMarkdownToTelegraphNodes` больше не генерирует узлы с тегами `h1`, `h2`, `h5`, `h6`.
6. Все существующие тесты, не связанные с заголовками, по-прежнему проходят успешно.

## План тестирования

**Затронутый файл:** `src/markdownConverter.test.ts`

Необходимо добавить новый набор тестов для проверки корректности маппинга всех уровней заголовков.

**Пример новых тестов:**

```typescript
describe("Heading Level to Telegraph Tag Mapping", () => {
    test("should convert H1, H2, and H3 to h3 nodes", () => {
        const markdown = "# Heading 1\n## Heading 2\n### Heading 3";
        const result = convertMarkdownToTelegraphNodes(markdown);
        expect(result).toEqual([
            { tag: "h3", children: ["Heading 1"] },
            { tag: "h3", children: ["Heading 2"] },
            { tag: "h3", children: ["Heading 3"] },
        ]);
    });

    test("should convert H4 to h4 node", () => {
        const markdown = "#### Heading 4";
        const result = convertMarkdownToTelegraphNodes(markdown);
        expect(result).toEqual([{ tag: "h4", children: ["Heading 4"] }]);
    });

    test("should convert H5 to a paragraph with a strong tag", () => {
        const markdown = "##### Heading 5";
        const result = convertMarkdownToTelegraphNodes(markdown);
        expect(result).toEqual([
            {
                tag: "p",
                children: [{ tag: "strong", children: ["Heading 5"] }]
            }
        ]);
    });

    test("should convert H6 to a paragraph with strong and em tags", () => {
        const markdown = "###### Heading 6";
        const result = convertMarkdownToTelegraphNodes(markdown);
        expect(result).toEqual([
            {
                tag: "p",
                children: [
                    {
                        tag: "strong",
                        children: [{ tag: "em", children: ["Heading 6"] }]
                    }
                ]
            }
        ]);
    });
});
```

## Функциональные требования

- Обеспечить полную совместимость с API Telegra.ph
- Сохранить визуальную иерархию заголовков
- Исключить использование неподдерживаемых тегов
- Обеспечить корректную обработку всех уровней заголовков
- Сохранить обратную совместимость с существующими тестами

## Технические ограничения

- Использовать только теги `h3` и `h4` для заголовков
- Эмулировать H5 и H6 через комбинацию `p`, `strong` и `em` тегов
- Обеспечить корректную обработку inline markdown внутри заголовков
- Сохранить производительность функции конвертации