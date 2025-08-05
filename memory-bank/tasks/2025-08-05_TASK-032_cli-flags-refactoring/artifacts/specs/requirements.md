# Техническое задание: Рефакторинг CLI-флагов и настроек по умолчанию

**Версия:** 1.1
**Дата:** 2024-08-05
**ID Задачи:** `TASK-001` (переназначен как TASK-032)

## 1. Обзор

Данное техническое задание описывает три ключевых улучшения для утилиты `telegraph-publisher`:

1.  **Унификация флагов принудительного выполнения**: Объединение функциональности флагов `--force` и `--force-republish` в один флаг `--force` для устранения избыточности и улучшения интуитивности интерфейса.
2.  **Распространение флагов на зависимости**: Обеспечение того, что флаги `--force` и `--debug` применяются ко всей цепочке зависимостей при публикации, а не только к корневому файлу.
3.  **Обновление настроек по умолчанию**: Изменение значения по умолчанию для `maxDependencyDepth` с `1` на `20` для более глубокого анализа зависимостей "из коробки".

## 2. Затронутые файлы

*   `src/config/ConfigManager.ts`
*   `src/cli/EnhancedCommands.ts`
*   `src/workflow/PublicationWorkflowManager.ts`
*   `src/publisher/EnhancedTelegraphPublisher.ts`

## 3. Детальная спецификация

### Задача 1: Унификация флагов `--force` и `--force-republish`

**Цель**: Упростить CLI, оставив только флаг `--force`, который будет отвечать как за обход верификации ссылок, так и за принудительную перепубликацию неизмененных файлов.

**Реализация**:

1.  **Файл**: `src/cli/EnhancedCommands.ts`
    *   **Действие**: Удалить опцию `--force-republish`.
    *   **Действие**: Обновить описание опции `--force`.

    ```typescript
    // БЫЛО
    program
      // ...
      .option("--force-republish", "Force republish even if file is already published")
      // ...
      .option("--force", "Bypass link verification and publish anyway (for debugging)")
      // ...

    // СТАНЕТ
    program
      // ...
      // .option("--force-republish", ...) // <--- УДАЛИТЬ ЭТУ СТРОКУ
      // ...
      .option("--force", "Bypass link verification and force republish of unchanged files (for debugging)") // <--- ОБНОВИТЬ ОПИСАНИЕ
      // ...
    ```

2.  **Файл**: `src/workflow/PublicationWorkflowManager.ts`
    *   **Действие**: Упростить логику передачи флагов в `publisher.publishWithMetadata`.

    ```typescript
    // В методе publish класса PublicationWorkflowManager

    // БЫЛО
    const result = await this.publisher.publishWithMetadata(file, this.config.defaultUsername || 'Anonymous', {
      withDependencies: options.withDependencies !== false,
      forceRepublish: options.forceRepublish || options.force || false, // <--- СЛОЖНАЯ ЛОГИКА
      dryRun: options.dryRun || false,
      debug: options.debug || false,
      generateAside: options.aside !== false,
      tocTitle: options.tocTitle || '',
      tocSeparators: options.tocSeparators !== false
    });

    // СТАНЕТ
    const result = await this.publisher.publishWithMetadata(file, this.config.defaultUsername || 'Anonymous', {
      withDependencies: options.withDependencies !== false,
      forceRepublish: options.force || false, // <--- УПРОЩЕННАЯ ЛОГИКА
      dryRun: options.dryRun || false,
      debug: options.debug || false,
      generateAside: options.aside !== false,
      tocTitle: options.tocTitle || '',
      tocSeparators: options.tocSeparators !== false
    });
    ```

### Задача 2: Распространение флагов `--force` и `--debug` на зависимости

**Цель**: Обеспечить сквозную передачу флагов `--force` и `--debug` (а также `--dryRun`, который подразумевается при `--debug`) через всю цепочку вызовов при публикации зависимостей.

**Реализация**:

1.  **Файл**: `src/publisher/EnhancedTelegraphPublisher.ts`
    *   **Действие**: Изменить сигнатуру метода `publishDependencies` для приёма опций.

    ```typescript
    // БЫЛО
    async publishDependencies(
      filePath: string,
      username: string,
      dryRun: boolean = false,
      generateAside: boolean = true,
      tocTitle: string = '',
      tocSeparators: boolean = true
    ): Promise<{ success: boolean; error?: string; publishedFiles?: string[] }>

    // СТАНЕТ
    async publishDependencies(
      filePath: string,
      username: string,
      options: {
        dryRun?: boolean;
        debug?: boolean;
        force?: boolean;
        generateAside?: boolean;
        tocTitle?: string;
        tocSeparators?: boolean;
      } = {}
    ): Promise<{ success: boolean; error?: string; publishedFiles?: string[] }>
    ```

    *   **Действие**: Передавать опции в рекурсивные вызовы `publishWithMetadata` и `editWithMetadata`.

    ```typescript
    // Внутри цикла в publishDependencies, при вызове processFileByStatus
    // Необходимо пробросить опции в handleUnpublishedFile и handlePublishedFile,
    // а оттуда в вызовы publishWithMetadata/editWithMetadata.

    // Пример для handleUnpublishedFile
    private async handleUnpublishedFile(
      filePath: string,
      username: string,
      // ... другие параметры
      options: any // Принимаем опции
    ): Promise<void> {
        // ...
        const result = await this.publishWithMetadata(filePath, username, {
            withDependencies: false,
            dryRun: options.dryRun,
            debug: options.debug,
            forceRepublish: options.force,
            generateAside: options.generateAside,
            // ... другие опции
        });
        // ...
    }

    // Аналогичные изменения для handlePublishedFile
    private async handlePublishedFile(
      filePath: string,
      username: string,
      // ... другие параметры
      options: any // Принимаем опции
    ): Promise<void> {
        // ...
        const result = await this.editWithMetadata(filePath, username, {
            withDependencies: false,
            dryRun: options.dryRun,
            debug: options.debug,
            forceRepublish: true, // Для бэкфиллинга хеша
            generateAside: options.generateAside,
            // ... другие опции
        });
        // ...
    }
    ```

2.  **Файл**: `src/workflow/PublicationWorkflowManager.ts`
    *   **Действие**: Обновить вызов `publisher.publishDependencies` в методе `publish`, чтобы передавать полный объект опций.

### Задача 3: Изменение `maxDependencyDepth` по умолчанию

**Цель**: Увеличить глубину анализа зависимостей по умолчанию для более полного охвата проектов.

**Реализация**:

1.  **Файл**: `src/config/ConfigManager.ts`
    *   **Действие**: Изменить значение в константе `DEFAULT_CONFIG`.

    ```typescript
    // БЫЛО
    private static readonly DEFAULT_CONFIG: MetadataConfig = {
      // ...
      maxDependencyDepth: 1,
      // ...
    };

    // СТАНЕТ
    private static readonly DEFAULT_CONFIG: MetadataConfig = {
      // ...
      maxDependencyDepth: 20, // <--- ИЗМЕНИТЬ ЗНАЧЕНИЕ
      // ...
    };
    ```

## 4. Критерии приемки

1.  **Унификация флагов**:
    *   Команда `telegraph-publisher pub --force-republish` больше не существует и вызывает ошибку.
    *   Выполнение `telegraph-publisher pub -f <file> --force` для опубликованного файла с неизмененным контентом приводит к его принудительной перепубликации (обход проверки по хешу).
2.  **Распространение флагов**:
    *   Выполнение `telegraph-publisher pub -f <file> --debug` для файла с неопубликованными зависимостями создает `.json` файлы как для основного файла, так и для всех его зависимостей.
    *   Выполнение `telegraph-publisher pub -f <file> --force` для файла с зависимостями, которые также уже опубликованы, принудительно перепубликовывает всю цепочку.
3.  **Настройки по умолчанию**:
    *   При запуске утилиты в проекте без файла конфигурации, анализ зависимостей должен производиться на глубину до 20 уровней.

## 5. План тестирования

*   **Модульное/интеграционное тестирование**:
    1.  Дополнить тесты в `PublicationWorkflowManager.force-flag.test.ts` для проверки, что `--force` активирует `forceRepublish`.
    2.  Добавить тест, проверяющий, что `--force-republish` вызывает ошибку неизвестной команды.
    3.  Дополнить тесты в `EnhancedTelegraphPublisher.debug.test.ts` и `user-scenario.test.ts`. Создать тестовую структуру файлов с зависимостями и запустить публикацию с флагом `--debug`. Проверить, что для всех файлов в цепочке созданы `.json` артефакты.
    4.  Создать аналогичный интеграционный тест для флага `--force`.
    5.  Добавить тест для `ConfigManager.ts`, который проверяет, что `getMetadataConfig` без существующего файла конфигурации возвращает объект со значением `maxDependencyDepth: 20`.
*   **Ручное тестирование**:
    1.  Выполнить все сценарии, описанные в "Критериях приемки", в реальном тестовом окружении для подтверждения корректной работы.

## 6. Критическое требование к поведению (Non-Functional Requirement)

### Сохранение пути редактирования при использовании `--force`

Флаг `--force` **НЕ ДОЛЖЕН** приводить к созданию новой страницы для уже опубликованного контента. Если у файла есть метаданные (`telegraphUrl` и `editPath`), система **ОБЯЗАНА** использовать путь для редактирования (`editPath`). Флаг `--force` должен лишь обходить проверку хеша контента для принудительного обновления существующей страницы.

**Обоснование реализации**: Это поведение обеспечивается тем, что решение о выборе между созданием новой страницы (`publishWithMetadata`) и редактированием существующей (`editWithMetadata`) принимается на основе наличия метаданных **до** того, как флаг `--force` применяется для обхода проверки контента.

### Дополнительные тест-кейсы

**Новый тест-кейс: `--force` для существующей страницы**:
1.  Создать файл с валидными метаданными (`published-file.md`).
2.  Запустить `telegraph-publisher pub -f published-file.md --force`.
3.  Проверить (через мокирование или анализ логов), что был вызван метод `editWithMetadata`, а **НЕ** `publishWithMetadata`.
4.  Убедиться, что в результате операции URL страницы в метаданных не изменился. Этот тест уже частично реализован в `PublicationWorkflowManager.publish-vs-edit-paths.test.ts` и должен быть сохранен и, возможно, усилен. 