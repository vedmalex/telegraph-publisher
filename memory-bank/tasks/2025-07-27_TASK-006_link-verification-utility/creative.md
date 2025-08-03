---
title: "Creative Design - Link Verification Utility UX/UI"
phase: "CREATIVE"
created: 2025-07-27_10-39
---

# Creative Design: Link Verification Utility UX/UI

## 1. Console Output Design

### 1.1 Initial Scan Progress
```
🔎 Сканирование ссылок в директории: /Users/user/project...
📁 Обнаружено 15 markdown файлов
🔍 Анализ ссылок... ████████████████████████████████ 100% (15/15)
```

### 1.2 Summary Report Header
```
📊 РЕЗУЛЬТАТЫ АНАЛИЗА ССЫЛОК
═══════════════════════════════════════════════════════════════

📈 Статистика:
   • Всего файлов: 15
   • Всего ссылок: 47
   • Локальных ссылок: 23
   • Сломанных ссылок: 3
   • Время сканирования: 1.2s

```

### 1.3 Broken Links Report
```
❌ НАЙДЕНЫ ПРОБЛЕМЫ

📄 /Users/user/project/docs/setup.md
──────────────────────────────────────────────────────────────
  🔗 Сломанная ссылка: [Конфигурация](./config/settings.md)
     💡 Предлагаемое исправление: ../shared/config/settings.md
     📍 Строка: 15

  🔗 Сломанная ссылка: [API документация](../api-docs.md)
     ❌ Файл 'api-docs.md' не найден в проекте
     📍 Строка: 28

📄 /Users/user/project/docs/advanced/usage.md
──────────────────────────────────────────────────────────────
  🔗 Сломанная ссылка: [Примеры](./examples.md)
     💡 Предлагаемое исправление: ../../examples/basic.md
     💡 Альтернатива: ../../examples/advanced.md
     📍 Строка: 42

```

### 1.4 Final Summary
```
📊 ИТОГОВЫЙ ОТЧЕТ
═══════════════════════════════════════════════════════════════

✅ Результат: Найдено 3 сломанных ссылки в 2 файлах
💡 Доступно исправлений: 2 (для 67% проблем)
⚠️  Без предложений: 1 ссылка

🛠️  Для исправления запустите:
    telegraph-publisher check-links --apply-fixes

```

## 2. Interactive Repair Mode Design

### 2.1 Interactive Mode Header
```
🔧 ИНТЕРАКТИВНЫЙ РЕЖИМ ИСПРАВЛЕНИЯ
═══════════════════════════════════════════════════════════════

Найдено 3 сломанных ссылки с предложениями для исправления.
Для каждой ссылки выберите действие:
  y - применить исправление
  n - пропустить
  a - применить все оставшиеся исправления
  q - выйти

```

### 2.2 Individual Link Repair Prompts
```
📄 Файл: /Users/user/project/docs/setup.md (строка 15)
──────────────────────────────────────────────────────────────

🔗 Сломанная ссылка: [Конфигурация](./config/settings.md)
💡 Предлагаемое исправление: ../shared/config/settings.md

Применить это исправление? (y/n/a/q): █

```

### 2.3 Multiple Suggestions Prompt
```
📄 Файл: /Users/user/project/docs/advanced/usage.md (строка 42)
──────────────────────────────────────────────────────────────

🔗 Сломанная ссылка: [Примеры](./examples.md)

Найдено несколько возможных исправлений:
  1) ../../examples/basic.md
  2) ../../examples/advanced.md

Выберите вариант (1-2) или действие (n/a/q): █

```

### 2.4 Confirmation Messages
```
✅ Исправление применено: docs/setup.md
   [Конфигурация](./config/settings.md) → [Конфигурация](../shared/config/settings.md)

❌ Исправление пропущено: docs/advanced/usage.md
   [Примеры](./examples.md) - оставлено без изменений

🎯 Применено "применить все" - автоматически исправляются оставшиеся ссылки...

```

### 2.5 Interactive Mode Summary
```
🎉 ИНТЕРАКТИВНОЕ ИСПРАВЛЕНИЕ ЗАВЕРШЕНО
═══════════════════════════════════════════════════════════════

📊 Результаты:
   • Исправлено: 2 ссылки
   • Пропущено: 1 ссылка
   • Обработано файлов: 2

✅ Все исправления успешно применены!

```

## 3. Error Handling Design

### 3.1 File Access Errors
```
⚠️  ПРЕДУПРЕЖДЕНИЕ: Не удается прочитать файл
    📄 /Users/user/project/restricted.md
    💬 Причина: Недостаточно прав доступа
    🔧 Решение: Проверьте права доступа к файлу

```

### 3.2 Permission Errors During Repair
```
❌ ОШИБКА: Не удается записать изменения
    📄 /Users/user/project/docs/readonly.md
    💬 Причина: Файл защищен от записи
    🔧 Решение: Снимите защиту от записи и повторите операцию

```

### 3.3 Invalid Path Errors
```
❌ ОШИБКА: Недопустимый путь
    📄 ./non-existent-directory/file.md
    💬 Указанный путь не существует или недоступен
    🔧 Проверьте правильность пути и повторите попытку

```

## 4. Verbose Mode Design

### 4.1 Detailed Scanning Progress
```
🔍 ДЕТАЛЬНЫЙ РЕЖИМ СКАНИРОВАНИЯ
═══════════════════════════════════════════════════════════════

📂 Сканирование директории: /Users/user/project
   📁 Обрабатывается: docs/
   📁 Обрабатывается: examples/
   📁 Пропускается: node_modules/ (игнорируется)
   📁 Пропускается: .git/ (игнорируется)

📄 Анализ файлов:
   ✅ docs/setup.md - найдено 5 ссылок (2 локальных)
   ✅ docs/advanced/usage.md - найдено 8 ссылок (4 локальных)
   ✅ examples/basic.md - найдено 3 ссылки (1 локальная)
   ...

🔍 Проверка ссылок:
   ✅ docs/setup.md → ../README.md (существует)
   ❌ docs/setup.md → ./config/settings.md (не найден)
   ✅ docs/advanced/usage.md → ../../package.json (существует)
   ❌ docs/advanced/usage.md → ./examples.md (не найден)

```

### 4.2 Detailed Resolution Process
```
🔧 ПОИСК ИСПРАВЛЕНИЙ
═══════════════════════════════════════════════════════════════

🔍 Анализ: ./config/settings.md
   📂 Поиск файла 'settings.md' в проекте...
   ✅ Найден: shared/config/settings.md
   📐 Расчет относительного пути: ../shared/config/settings.md

🔍 Анализ: ./examples.md
   📂 Поиск файла 'examples.md' в проекте...
   ✅ Найден: examples/basic.md
   ✅ Найден: examples/advanced.md
   📐 Расчет относительных путей...

```

## 5. Help Text Design

### 5.1 Command Help
```
telegraph-publisher check-links - Проверка и исправление ссылок в Markdown файлах

ИСПОЛЬЗОВАНИЕ:
  telegraph-publisher check-links [путь] [опции]

АРГУМЕНТЫ:
  [путь]              Путь к файлу или директории (по умолчанию: текущая директория)

ОПЦИИ:
  --apply-fixes       Включить интерактивный режим исправления
  --dry-run          Только отчет, без изменений (по умолчанию)
  --verbose, -v      Подробный вывод процесса
  --help, -h         Показать эту справку

ПРИМЕРЫ:
  telegraph-publisher check-links                    # Проверить текущую директорию
  telegraph-publisher check-links ./docs            # Проверить директорию docs
  telegraph-publisher check-links ./readme.md       # Проверить один файл
  telegraph-publisher check-links --apply-fixes     # Интерактивное исправление
  telegraph-publisher check-links --verbose         # Подробный вывод

ОПИСАНИЕ:
  Утилита рекурсивно сканирует Markdown файлы в поисках сломанных локальных ссылок.
  Для каждой найденной проблемы предлагает интеллектуальные исправления на основе
  поиска файлов с аналогичными именами в проекте.

```

## 6. Color and Emoji Scheme

### 6.1 Status Indicators
- 🔎 - Сканирование/поиск
- 📊 - Статистика/отчеты
- ✅ - Успех/выполнено
- ❌ - Ошибка/проблема
- ⚠️ - Предупреждение
- 💡 - Предложение/идея
- 🔗 - Ссылка
- 📄 - Файл
- 📁 - Директория
- 🔧 - Исправление/инструменты
- 🎯 - Выбор/действие
- 🎉 - Завершение/праздник

### 6.2 Progress Indicators
- Спиннер: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (стандартный)
- Прогресс-бар: `████████████████████████████████` (ASCII)
- Процентаж: `100% (15/15)` (числовой)

### 6.3 Visual Hierarchy
- **Заголовки разделов**: Двойная линия `═══════════════════`
- **Подразделы файлов**: Одинарная линия `──────────────────`
- **Отступы**: 2 пробела для вложенности
- **Выделение путей**: Курсив или backticks в реальной реализации

## 7. Responsive Design Considerations

### 7.1 Terminal Width Adaptation
- **Узкие терминалы (< 80 символов)**: Сокращенные пути, компактный вывод
- **Широкие терминалы (> 120 символов)**: Полные пути, расширенная информация
- **Адаптивные разделители**: Длина линий подстраивается под ширину терминала

### 7.2 Content Truncation
- **Длинные пути**: `...very/long/path/to/file.md`
- **Длинный текст ссылок**: `[Very long link text that...]`
- **Показать полное**: Опция `--verbose` для полной информации

## 8. Accessibility Features

### 8.1 Screen Reader Support
- Четкая структура с заголовками
- Логический порядок информации
- Альтернативные описания для эмодзи

### 8.2 Non-Interactive Mode
- Режим `--dry-run` для автоматизации
- Машиночитаемый вывод (при необходимости)
- Скриптовая совместимость

## 9. Design Validation Criteria

### 9.1 Usability Tests
- ✅ Пользователь может быстро понять результаты сканирования
- ✅ Интерактивный режим интуитивно понятен
- ✅ Ошибки содержат actionable информацию
- ✅ Progress indication показывает реальный прогресс

### 9.2 Consistency Tests
- ✅ Эмодзи и форматирование соответствуют другим командам
- ✅ Цветовая схема согласована с ProgressIndicator
- ✅ Терминология соответствует проекту
- ✅ Help text следует установленному формату

### 9.3 Performance Tests
- ✅ Вывод не блокирует выполнение операций
- ✅ Progress indicators обновляются своевременно
- ✅ Интерактивные промпты отзывчивы
- ✅ Большие отчеты не перегружают консоль

## Design Completion Status

**Phase Status**: ✅ **COMPLETED**

**Design Coverage**:
- ✅ Console Output Design: Comprehensive layouts for all scenarios
- ✅ Interactive Flow Design: Complete user interaction patterns
- ✅ Error Handling Design: User-friendly error messaging
- ✅ Help System Design: Clear documentation and examples
- ✅ Visual Design: Consistent emoji and formatting scheme

**Готовность к переходу в IMPLEMENT фазу**: ✅ **READY**

## Next Phase: IMPLEMENT
- Реализация компонентов согласно дизайну
- Интеграция с ProgressIndicator системой
- Создание интерактивных промптов
- Реализация форматирования вывода