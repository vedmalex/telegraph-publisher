# Техническая спецификация: Добавление опции `--debug` для вывода JSON

*   **ID Задачи:** `TASK-014`
*   **Статус:** `To Do`
*   **Дата:** `2025-08-03`

## 1. Введение

**Проблема:**
В настоящее время опция `--dry-run` позволяет симулировать публикацию, но не дает возможности просмотреть и сохранить итоговый JSON-объект (массив `TelegraphNode`), который будет отправлен в API Telegra.ph. Это усложняет отладку процесса конвертации Markdown в Telegraph Nodes.

**Цель:**
Ввести новую CLI-опцию `--debug`, которая будет работать в паре с `--dry-run`. При использовании этой опции сгенерированный JSON-массив будет сохраняться в файл, что позволит легко инспектировать и отлаживать результат конвертации.

## 2. Требования

1.  **Новая CLI-опция:**
    *   Добавить опцию `--debug` в команду `publish` (алиас `pub`).
    *   Описание опции: "Save the generated Telegraph JSON to a file (implies --dry-run)".

2.  **Автоматическое включение `--dry-run`:**
    *   Если пользователь указывает флаг `--debug`, флаг `--dry-run` должен автоматически считаться активным, даже если он не был указан явно. Это гарантирует, что при отладке не произойдет реальная публикация.

3.  **Сохранение JSON-файла:**
    *   При активной опции `--debug` итоговый массив `TelegraphNode[]` должен быть сохранен в файл.
    *   Файл должен быть в формате JSON с красивым форматированием (отступы в 2 пробела).
    *   Имя файла должно соответствовать имени исходного Markdown-файла, но с расширением `.json` (например, для `article.md` файл будет называться `article.json`).
    *   Файл должен сохраняться в той же директории, что и исходный Markdown-файл.

4.  **Пользовательский фидбек:**
    *   После успешного сохранения файла в консоль должно выводиться информационное сообщение, например: `💾 Debug JSON saved to: /path/to/article.json`.

## 3. Детали реализации

### Шаг 1: Обновление CLI-команды

**Затрагиваемый файл:** `src/cli/EnhancedCommands.ts`

В методе `addPublishCommand` необходимо добавить новую опцию:

```typescript
// ... в .command("publish")
.option("--debug", "Save the generated Telegraph JSON to a file (implies --dry-run)")
// ...
```

### Шаг 2: Обновление логики обработчика команды

**Затрагиваемый файл:** `src/workflow/PublicationWorkflowManager.ts`

В методе `publish` необходимо обновить логику для автоматического включения `dryRun` и передачи опции `debug` дальше по цепочке.

```typescript
// Внутри метода publish(targetPath: string, options: any)
public async publish(targetPath: string, options: any): Promise<void> {
    // Автоматически включаем dry-run, если указан debug
    if (options.debug) {
        options.dryRun = true;
    }

    // ... остальная логика метода ...

    // При вызове publisher.publishWithMetadata передаем все опции, включая debug
    for (const file of filesToProcess) {
      ProgressIndicator.showStatus(`⚙️ Publishing: ${file}`, "info");
      const result = await this.publisher.publishWithMetadata(file, this.config.defaultUsername, {
        withDependencies: options.withDependencies !== false,
        forceRepublish: options.forceRepublish || false,
        dryRun: options.dryRun || false,
        debug: options.debug || false // <--- Передаем опцию debug
      });
      // ...
    }
}
```

### Шаг 3: Реализация сохранения JSON

**Затрагиваемый файл:** `src/publisher/EnhancedTelegraphPublisher.ts`

В методе `publishWithMetadata` и `editWithMetadata` необходимо добавить логику для сохранения JSON-файла, когда активны опции `debug` и `dryRun`.

**Новый `import` вверху файла:**
```typescript
import { resolve } from "node:path";
```

**Обновленный метод `publishWithMetadata`:**
```typescript
// Внутри метода publishWithMetadata
async publishWithMetadata(
    filePath: string,
    username: string,
    options: {
      withDependencies?: boolean;
      forceRepublish?: boolean;
      dryRun?: boolean;
      debug?: boolean; // <--- Добавляем параметр
    } = {}
  ): Promise<PublicationResult> {
    try {
      const { withDependencies = true, forceRepublish = false, dryRun = false, debug = false } = options;
      // ... (существующая логика до генерации telegraphNodes)

      // ... после генерации telegraphNodes ...
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentForPublication);

      // Новая логика для --debug
      if (debug && dryRun) {
        const jsonOutputPath = resolve(filePath.replace(/\.md$/, ".json"));
        try {
          writeFileSync(jsonOutputPath, JSON.stringify(telegraphNodes, null, 2), 'utf-8');
          ProgressIndicator.showStatus(`💾 Debug JSON saved to: ${jsonOutputPath}`, 'info');
        } catch (error) {
          ProgressIndicator.showStatus(`❌ Failed to save debug JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      }

      if (dryRun) {
        // ... (остальная логика dryRun)
      }

      // ... (остальная логика публикации)
    } catch (error) {
      // ...
    }
}
```
**Аналогичные изменения нужно внести в метод `editWithMetadata`.**

## 4. Критерии приемки

1.  При запуске команды `pub` с флагом `--debug` публикация на Telegra.ph **не** происходит.
2.  При запуске с флагом `--debug` рядом с исходным файлом (например, `article.md`) создается файл с тем же именем и расширением `.json` (например, `article.json`).
3.  Содержимое `.json` файла является валидным JSON и представляет собой массив `TelegraphNode[]`.
4.  JSON в файле отформатирован с отступом в 2 пробела.
5.  В консоль выводится сообщение об успешном сохранении debug-файла.
6.  Запуск команды с флагом `--dry-run`, но **без** `--debug`, **не** создает `.json` файл.
7.  Функциональность работает как для одиночных файлов, так и при публикации директории (для каждого файла в директории создается свой `.json` файл).

## 5. План тестирования

Необходимо обновить тесты, чтобы проверить новую функциональность.

**Затрагиваемый файл:** `src/workflow/PublicationWorkflowManager.test.ts`

**Новые тестовые сценарии:**

1.  **Тест для `--debug`:**
    *   Создать тестовый markdown-файл.
    *   Вызвать `workflowManager.publish` с опцией `debug: true`.
    *   Проверить, что метод `publisher.publishWithMetadata` был вызван с опциями `dryRun: true` и `debug: true`.
    *   Проверить, что рядом с тестовым файлом был создан `.json`-файл.
    *   Прочитать содержимое `.json`-файла и убедиться, что это валидный JSON.
    *   Удалить созданный `.json`-файл после теста.

2.  **Тест для `--dry-run` без `--debug`:**
    *   Создать тестовый markdown-файл.
    *   Вызвать `workflowManager.publish` с опцией `dryRun: true`, но `debug: false`.
    *   Проверить, что `.json`-файл **не** был создан.

---

Эта спецификация готова для передачи разработчику. Она содержит четкое описание задачи, требования и конкретные шаги для реализации и тестирования новой функциональности.