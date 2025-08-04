### **Спецификация правил генерации якорей (anchors) в Telegra.ph (Версия 3.0)**

Этот документ описывает точный алгоритм преобразования текста заголовка в якорную ссылку (`id` атрибут), используемый платформой Telegra.ph для формирования ASIDE (Table of Contents). Правила основаны на эмпирическом анализе страницы, опубликованной с помощью скрипта `scripts/research_anchors.ts`, а также унификации с системой валидации ссылок.

**Этот документ заменяет все предыдущие версии и предположения. Версия 3.0 включает обработку H5/H6 заголовков и ссылок в заголовках.**

---

#### **Полный алгоритм генерации якорей**

Алгоритм состоит из двух основных этапов: **подготовка текста** и **генерация якоря**.

##### **Этап 1: Подготовка текста для якоря**

1. **Определение уровня заголовка:**
   - H1-H4: используется исходный текст без изменений
   - H5: добавляется префикс `> ` (знак больше + пробел)
   - H6: добавляется префикс `>> ` (два знака больше + пробел)
   - H7+: добавляется префикс `>>> ` (три знака больше + пробел)

2. **Обработка ссылок в заголовках:**
   - Если заголовок содержит markdown-ссылку формата `[текст](url)`, извлекается только текст
   - Примеры:
     - `## [GitHub Repo](https://github.com)` → текст для якоря: `GitHub Repo`
     - `##### [Setup Guide](http://setup.com)` → текст для якоря: `> Setup Guide`

3. **Применение префиксов к извлеченному тексту:**
   - H5 с ссылкой: `##### [Setup](url)` → `> Setup`
   - H6 с ссылкой: `###### [API](url)` → `>> API`

##### **Этап 2: Генерация якоря из подготовленного текста**

1. **Очистка пробелов:** Удаляются начальные и конечные пробелы (`trim`).
2. **Удаление символов:** Из текста удаляются **только** символы `<` (но НЕ `>`, чтобы сохранить префиксы H5/H6).
3. **Замена пробелов:** Все символы пробела (` `) заменяются на дефисы (`-`).
4. **Сохранение остального:** Все остальные символы, включая кириллицу, знаки препинания, спецсимволы и символы Markdown, **остаются без изменений**. Регистр символов **сохраняется**.

---

#### **Примеры преобразования**

##### **Базовые заголовки (H1-H4)**

| Исходный markdown | Уровень | Подготовленный текст | Сгенерированный якорь | Примечание |
| :--- | :--- | :--- | :--- | :--- |
| `## Title With Spaces` | H2 | `Title With Spaces` | `Title-With-Spaces` | Пробелы заменены, регистр сохранен. |
| `### Заголовок с пробелами` | H3 | `Заголовок с пробелами` | `Заголовок-с-пробелами` | Кириллица и регистр сохраняются. |
| `#### **Bold Title**` | H4 | `**Bold Title**` | `**Bold-Title**` | Символы Markdown **не** удаляются. |
| `## Title with < > symbols` | H2 | `Title with < > symbols` | `Title-with->-symbols` | Только `<` удален, `>` сохранен. |

##### **Заголовки с ссылками (H1-H4)**

| Исходный markdown | Уровень | Подготовленный текст | Сгенерированный якорь | Примечание |
| :--- | :--- | :--- | :--- | :--- |
| `## [GitHub Repo](https://github.com)` | H2 | `GitHub Repo` | `GitHub-Repo` | Извлечен только текст ссылки. |
| `### [Documentation](https://docs.com)` | H3 | `Documentation` | `Documentation` | Извлечен текст, URL игнорирован. |
| `#### [API Guide](https://api.com "Title")` | H4 | `API Guide` | `API-Guide` | Извлечен текст, title игнорирован. |

##### **H5 заголовки с префиксами**

| Исходный markdown | Уровень | Подготовленный текст | Сгенерированный якорь | Примечание |
| :--- | :--- | :--- | :--- | :--- |
| `##### Advanced Configuration` | H5 | `> Advanced Configuration` | `>-Advanced-Configuration` | Добавлен префикс `> `. |
| `##### **Bold H5 Title**` | H5 | `> **Bold H5 Title**` | `>-**Bold-H5-Title**` | Префикс + сохранение Markdown. |
| `##### [Setup Guide](http://setup.com)` | H5 | `> Setup Guide` | `>-Setup-Guide` | Префикс + извлечение текста ссылки. |

##### **H6 заголовки с двойными префиксами**

| Исходный markdown | Уровень | Подготовленный текст | Сгенерированный якорь | Примечание |
| :--- | :--- | :--- | :--- | :--- |
| `###### API Reference Details` | H6 | `>> API Reference Details` | `>>-API-Reference-Details` | Добавлен префикс `>> `. |
| `###### \`Code Example\`` | H6 | `>> \`Code Example\`` | `>>-\`Code-Example\`` | Префикс + сохранение кода. |
| `###### [API Details](http://api.com)` | H6 | `>> API Details` | `>>-API-Details` | Префикс + извлечение текста ссылки. |

##### **Сложные случаи**

| Исходный markdown | Уровень | Подготовленный текст | Сгенерированный якорь | Примечание |
| :--- | :--- | :--- | :--- | :--- |
| `####### Deep Section` | H7+ | `>>> Deep Section` | `>>>-Deep-Section` | Расширенный префикс для H7+. |
| `##### > Already Prefixed` | H5 | `> > Already Prefixed` | `>->-Already-Prefixed` | Префикс добавлен к уже префиксированному. |
| `#### Аналогия «Дерево» (ШБ 1.1.4)` | H4 | `Аналогия «Дерево» (ШБ 1.1.4)` | `Аналогия-«Дерево»-(ШБ-1.1.4)` | Сложные знаки препинания сохраняются. |

---

#### **Ключевые принципы**

*   **Регистр сохраняется.** (`Case-Sensitive`)
*   **Markdown-форматирование НЕ удаляется.**
*   **Только пробелы заменяются на дефисы.**
*   **H5/H6 получают префиксы** (`>`, `>>`) для визуального отображения в ASIDE.
*   **Ссылки в заголовках обрабатываются** — извлекается только текст `[текст](url)`.
*   **Почти все спецсимволы сохраняются,** за исключением только `<` (но НЕ `>`).
*   **Консистентность между TOC и валидацией** — один алгоритм для всех систем.

---

#### **Псевдокод для реализации**

```typescript
interface HeadingInfo {
  level: number;           // 1-6+ (уровень заголовка)
  originalText: string;    // Исходный текст из markdown
  displayText: string;     // Текст с префиксами для отображения
  textForAnchor: string;   // Подготовленный текст для генерации якоря
  linkInfo?: {             // Информация о ссылке (если есть)
    text: string;
    url: string;
  };
  metadata: {
    hasLink: boolean;
    hasPrefix: boolean;
    prefixType: 'none' | 'h5' | 'h6' | 'extended';
  };
}

function extractHeadingInfo(headingMatch: RegExpMatchArray): HeadingInfo {
  const level = headingMatch[1]?.length || 0;
  const originalText = headingMatch[2]?.trim() || '';
  
  // 1. Обработка ссылок в заголовках
  const linkMatch = originalText.match(/^\[(.*?)\]\((.*?)\)$/);
  const linkInfo = linkMatch ? {
    text: linkMatch[1] || '',
    url: linkMatch[2] || ''
  } : undefined;
  
  // 2. Применение префиксов по уровням
  let displayText = originalText;
  let textForAnchor = linkInfo ? linkInfo.text : originalText;
  let hasPrefix = false;
  let prefixType: 'none' | 'h5' | 'h6' | 'extended' = 'none';
  
  switch (level) {
    case 1: case 2: case 3: case 4:
      // H1-H4: без префиксов
      break;
    case 5:
      displayText = `> ${originalText}`;
      textForAnchor = linkInfo ? `> ${linkInfo.text}` : `> ${originalText}`;
      hasPrefix = true;
      prefixType = 'h5';
      break;
    case 6:
      displayText = `>> ${originalText}`;
      textForAnchor = linkInfo ? `>> ${linkInfo.text}` : `>> ${originalText}`;
      hasPrefix = true;
      prefixType = 'h6';
      break;
    default: // H7+
      displayText = `>>> ${originalText}`;
      textForAnchor = linkInfo ? `>>> ${linkInfo.text}` : `>>> ${originalText}`;
      hasPrefix = true;
      prefixType = 'extended';
      break;
  }
  
  return {
    level,
    originalText,
    displayText,
    textForAnchor,
    linkInfo,
    metadata: {
      hasLink: !!linkInfo,
      hasPrefix,
      prefixType
    }
  };
}

function generateTelegraphAnchor(headingInfo: HeadingInfo): string {
  // 1. Взять подготовленный текст и очистить пробелы по краям
  let anchor = headingInfo.textForAnchor.trim();

  // 2. Удалить только символы < (НЕ удалять >, чтобы сохранить префиксы H5/H6)
  anchor = anchor.replace(/[<]/g, '');

  // 3. Заменить все пробелы на дефисы
  anchor = anchor.replace(/ /g, '-');

  // 4. Вернуть результат. Никаких других преобразований не требуется.
  return anchor;
}

// Полный процесс генерации якоря для заголовка
function processHeadingToAnchor(headingMatch: RegExpMatchArray): string {
  const headingInfo = extractHeadingInfo(headingMatch);
  return generateTelegraphAnchor(headingInfo);
}
```

#### **Реализация в системе**

Этот алгоритм реализован в:

- **`src/utils/AnchorGenerator.ts`** — унифицированная система генерации якорей
- **`src/markdownConverter.ts`** — генерация ASIDE (Table of Contents)  
- **`src/links/LinkVerifier.ts`** — валидация ссылок на якоря
- **`src/cache/AnchorCacheManager.ts`** — кэширование якорей (версия 1.1.0)

#### **Консистентность систем**

Все системы используют единый `AnchorGenerator`, что обеспечивает:

- ✅ **100% консистентность** между TOC и валидацией ссылок
- ✅ **Правильную обработку H5/H6** с префиксами `>`, `>>`
- ✅ **Корректное извлечение текста** из ссылок в заголовках
- ✅ **Автоматическую инвалидацию кэша** при изменении правил (версия 1.1.0)