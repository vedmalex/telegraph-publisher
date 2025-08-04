# Техническая спецификация: Скрипт для исследования правил генерации якорей (Anchors) в Telegra.ph

**ID Задачи:** `RESEARCH-ANCHOR-RULES-001`
**Дата:** `2025-08-04`
**Автор:** `External Agent (Technical Specs)`
**Статус:** `Готово к реализации`

## 1. Цель

Создать автономный скрипт для эмпирического определения точного алгоритма, который Telegra.ph использует для генерации `id` атрибутов (якорей) из текста заголовков (`h3`, `h4`). Результаты этого исследования станут основой для исправления валидации ссылок и генерации оглавления в основном приложении.

## 2. Описание скрипта

Скрипт `scripts/research_anchors.ts` будет программно создавать и публиковать страницу в Telegra.ph. Эта страница будет содержать набор специально подобранных заголовков, включающих спецсимволы, кириллицу, знаки препинания и Markdown-форматирование. После успешной публикации скрипт выведет URL страницы в консоль.

## 3. Детали реализации

### A. Расположение файла:
`scripts/research_anchors.ts`

### B. Зависимости:
* `src/telegraphPublisher.ts` (класс `TelegraphPublisher`)

### C. Логика скрипта:

#### 1. Тестовые заголовки
Определить внутри скрипта массив строк с тестовыми заголовками. Этот массив должен покрывать все потенциально проблемные случаи:

```typescript
const testHeadings = [
  // Basic cases
  "Simple Title",
  "Title With Spaces",
  // Cyrillic
  "Заголовок на кириллице",
  "Заголовок с пробелами",
  // Numbers
  "1. Numbered Heading",
  "Heading with 123",
  // Special Characters (common)
  "Title with dot.",
  "Title with comma,",
  "Title with colon:",
  "Title with question mark?",
  "Title with exclamation!",
  // Special Characters (problematic from logs)
  "Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)",
  "Вопрос 4: Опишите квалификацию для того, чтобы рассказывать и слушать «Шримад-Бхагаватам».",
  // Other symbols
  "Title with @#$%^&*()_+-=[]{}|;'\"<>/",
  // Mixed case
  "MixedCaseTitle",
  "Title With Mixed Case",
  // Markdown formatting
  "**Bold Title**",
  "*Italic Title*",
  "`Code Title`",
  "[Link Title](url)",
  "**Bold *and Italic* Title**"
];
```

#### 2. Аргументы командной строки
Скрипт должен принимать один аргумент — `access_token`. Если токен не предоставлен, выводить ошибку.

#### 3. Основная функция (`async function main()`)
* Создать экземпляр `TelegraphPublisher`
* Установить токен доступа из аргументов командной строки
* Преобразовать массив `testHeadings` в массив `TelegraphNode[]`, где каждый заголовок становится `h3` элементом
* Вызвать `publisher.publishNodes()` с заголовком "Anchor Research Page" и созданным массивом узлов
* Вывести в консоль URL опубликованной страницы
* Обернуть вызов в `try...catch` для обработки ошибок API

### D. Пример кода (`scripts/research_anchors.ts`):

```typescript
import { TelegraphPublisher, type TelegraphNode } from '../src/telegraphPublisher';

const testHeadings: string[] = [
  "Simple Title",
  "Title With Spaces",
  "Заголовок на кириллице",
  "Заголовок с пробелами",
  "1. Numbered Heading",
  "Heading with 123",
  "Title with dot.",
  "Title with comma,",
  "Title with colon:",
  "Title with question mark?",
  "Title with exclamation!",
  "Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)",
  "Вопрос 4: Опишите квалификацию для того, чтобы рассказывать и слушать «Шримад-Бхагаватам».",
  "Title with @#$%^&*()_+-=[]{}|;'\"<>/",
  "MixedCaseTitle",
  "Title With Mixed Case",
  "**Bold Title**",
  "*Italic Title*",
  "`Code Title`",
  "[Link Title](url)",
  "**Bold *and Italic* Title**"
];

async function main() {
  const accessToken = process.argv[2];

  if (!accessToken) {
    console.error("❌ Error: Access token is required.");
    console.log("Usage: bun scripts/research_anchors.ts <YOUR_ACCESS_TOKEN>");
    process.exit(1);
  }

  try {
    console.log("🚀 Starting anchor research publication...");
    const publisher = new TelegraphPublisher();
    publisher.setAccessToken(accessToken);

    const nodes: TelegraphNode[] = testHeadings.map(text => ({
      tag: 'h3',
      children: [text]
    }));

    const page = await publisher.publishNodes("Anchor Research Page", nodes);

    console.log("\n✅ Publication successful!");
    console.log("=======================================");
    console.log("🔗 URL:", page.url);
    console.log("=======================================");
    console.log("\n🕵️‍♂️ Next Steps:");
    console.log("1. Open the URL above in your browser.");
    console.log("2. Right-click on each heading and select 'Inspect'.");
    console.log("3. In the developer tools, find the `id` attribute of the `<h3>` tag.");
    console.log("4. Compare the original heading text with the generated `id` to determine the rules.");

  } catch (error) {
    console.error("❌ Publication failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Execute the script
main();
```

## 4. Инструкции по использованию

1. **Сохраните** приведенный выше код в файл `scripts/research_anchors.ts`
2. **Запустите** скрипт из корневой директории проекта, передав ваш токен доступа:
   ```bash
   bun run scripts/research_anchors.ts <ВАШ_ACCESS_TOKEN>
   ```
3. **Проанализируйте** результат:
   * Откройте URL, который скрипт выведет в консоль
   * На странице, в браузере, кликните правой кнопкой мыши по каждому заголовку и выберите "Inspect" (или "Проверить элемент")
   * В открывшейся панели разработчика найдите `id` атрибут у тега `<h3>`. Например: `<h3 id="Zagalovok-na-kirillice">Заголовок на кириллице</h3>`
   * Сравните исходный текст заголовка с полученным `id`, чтобы точно определить правила преобразования

## 5. Ожидаемый результат

После выполнения этого исследования у нас будет точное понимание алгоритма генерации якорей, которое мы сможем заложить в основу исправления всех связанных проблем.

## 6. Критерии приемки

1. ✅ Скрипт успешно создан в `scripts/research_anchors.ts`
2. ✅ Скрипт принимает токен доступа как обязательный аргумент
3. ✅ Включены все тестовые заголовки из спецификации
4. ✅ Успешная публикация страницы в Telegra.ph
5. ✅ Вывод URL и четких инструкций для анализа
6. ✅ Обработка ошибок API и валидация входных данных

## 7. Связанные компоненты

* `src/telegraphPublisher.ts` - основной API класс
* `src/links/LinkVerifier.ts` - будет исправлен на основе результатов
* `src/markdownConverter.ts` - генерация оглавления будет улучшена
* `src/doc/anchors.md` - документация будет обновлена

## 8. Следующие шаги

После получения данных о правилах генерации якорей:
1. Обновить документацию `src/doc/anchors.md`
2. Исправить `LinkVerifier.getAnchorsForFile()`
3. Улучшить генерацию оглавления в `markdownConverter`
4. Обновить валидационные тесты