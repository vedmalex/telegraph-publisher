# Technical Specification: Fix Missing Debug Logic in Edit Workflow

**ID Задачи:** FIX-DEBUG-EDIT-FLOW-001  
**Дата:** 2025-08-04  
**Автор:** External Agent (Technical Specs)  
**Статус:** Готово к реализации

## 1. Описание проблемы

При выполнении команды `publish` с опцией `--debug` для файла, который уже был опубликован, отладочный JSON-файл не создается. Это происходит потому, что логика сохранения отладочного файла присутствует только в методе для создания новых публикаций (`publishWithMetadata`) и отсутствует в методе для редактирования существующих (`editWithMetadata`).

## 2. Анализ первопричины

Когда `publishWithMetadata` вызывается для уже опубликованного файла, он делегирует выполнение методу `editWithMetadata`. Однако в `editWithMetadata` отсутствует блок кода, который проверяет флаги `debug` и `dryRun` и сохраняет `telegraphNodes` в JSON-файл.

## 3. Предлагаемое решение

Скопировать блок кода, ответственный за сохранение отладочного JSON-файла, из `publishWithMetadata` в `editWithMetadata`.

## 4. Детали реализации

**Файл для модификации:** `src/publisher/EnhancedTelegraphPublisher.ts`
**Метод для модификации:** `editWithMetadata`

### A. Код для копирования (из `publishWithMetadata`)

```typescript
// Save debug JSON if requested
if (debug && dryRun) {
  const jsonOutputPath = resolve(filePath.replace(/\.md$/, ".json"));
  try {
    writeFileSync(jsonOutputPath, JSON.stringify(telegraphNodes, null, 2), 'utf-8');
    ProgressIndicator.showStatus(`💾 Debug JSON saved to: ${jsonOutputPath}`, 'info');
  } catch (error) {
    ProgressIndicator.showStatus(`❌ Failed to save debug JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
```

### B. Целевое местоположение (в `editWithMetadata`)

Этот блок должен быть вставлен в метод `editWithMetadata` **после** создания `telegraphNodes` и **перед** блоком `if (dryRun)`.

## 5. Критерии приемки

1. Выполнение команды `telegraph-publisher publish --file <existing_file.md> --debug --force` **ДОЛЖНО** создавать файл `<existing_file.json>`
2. Выполнение команды `telegraph-publisher publish --file <new_file.md> --debug` **ДОЛЖНО** по-прежнему создавать файл `<new_file.json>`
3. В обоих случаях команда должна выполнять "сухой запуск" (dry run) и не отправлять реальные запросы на API Telegra.ph

## 6. Дополнительные требования

- Все импорты должны быть проверены (`resolve`, `writeFileSync`)
- Код должен использовать существующий паттерн обработки ошибок
- Сообщения об успехе/ошибке должны соответствовать существующему стилю