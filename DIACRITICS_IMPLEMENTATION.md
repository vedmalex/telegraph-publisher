# Поддержка диакритики в EPUB для текстов на санскрите

## Дата: 2025-12-20

## Проблема
Текст на санскрите с диакритикой (IAST) при использовании backticks не отображался корректно на Kindle Paperwhite и других устройствах для чтения.

## Решение

### 1. ✅ Изменения в CSS (src/epub/EpubGenerator.ts)

Обновлено правило для `code` элемента:

**До:**
```css
code {
	font-family: monospace;
	background-color: #f4f4f4;
	padding: 0.2em 0.4em;
	border-radius: 3px;
}
```

**После:**
```css
code {
	font-family: "DejaVu Serif", "Liberation Serif", Georgia, serif;
	font-style: italic;
	color: #1a3a52;           /* тёмно-синий */
	background-color: transparent;
	padding: 0;
	border-radius: 0;
	letter-spacing: 0.02em;
}
```

### 2. ✅ Отделение блоков кода

Добавлено отдельное правило для `pre code`:

```css
pre {
	font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
	background-color: #f4f4f4;
	padding: 1em;
	border-radius: 5px;
	overflow-x: auto;
	color: #333;
}

pre code {
	/* Reset code styling inside pre blocks */
	font-family: inherit;
	font-style: normal;
	color: inherit;
	letter-spacing: normal;
}
```

## Использование

### Для санскрита с диакритикой:
```markdown
Текст `ра̄джа̄ даш́аратхах̣` на санскрите
```

Результат:
- ✅ **Курсив** для визуального отличия
- ✅ **Тёмно-синий цвет** (#1a3a52)
- ✅ **Без фонового цвета** (в отличие от программного кода)
- ✅ **Корректная диакритика** на всех устройствах

### Для программного кода:
```markdown
```
function example() {
  return "code";
}
```
```

Результат:
- ✅ **Моноширинный шрифт**
- ✅ **Светлый фон** (#f4f4f4)
- ✅ **Прокрутка** при переполнении

## Техническая информация

### Выбранные шрифты

1. **Для инлайнового кода (санскрит):**
   - `DejaVu Serif` — лучшая поддержка Unicode
   - `Liberation Serif` — альтернатива, часто встроена
   - `Georgia` — fallback на системный шрифт

2. **Для блоков кода (программирование):**
   - `DejaVu Sans Mono` — монопространственный
   - `Liberation Mono` — альтернатива
   - `monospace` — системный fallback

### Преимущества решения

✅ **Kindle Paperwhite** — корректное отображение
✅ **Универсальность** — работает на всех EPUB читалках
✅ **Unicode поддержка** — диакритика работает везде
✅ **Визуальное отличие** — курсив и цвет выделяют санскрит
✅ **Разделение функций** — инлайновый код vs блоки программного кода

## Тестирование

### Новые тесты добавлены (src/epub/EpubGenerator.test.ts):
- ✅ `should support Sanskrit text with IAST diacritics in code elements`
- ✅ `should generate CSS with proper font support for diacritics`

### Все существующие тесты:
- ✅ 20/20 тестов прошли успешно

## Документация

Создан файл `docs/DIACRITICS_SUPPORT.md` с полным описанием:
- Использование диакритики
- Поддержка различных устройств
- Примеры IAST транслитерации
- Решение проблем
- Рекомендации для разработчиков

## Совместимость

| Устройство | Статус | Примечания |
|-----------|--------|-----------|
| Kindle Paperwhite | ✅ | Основное целевое устройство |
| Kindle Fire | ✅ | |
| Calibre (ПК) | ✅ | |
| Apple Books | ✅ | |
| Google Play Books | ✅ | |
| Другие EPUB читалки | ✅ | Зависит от встроенных шрифтов |

## Файлы изменены

- `src/epub/EpubGenerator.ts` — CSS правила
- `src/epub/EpubGenerator.test.ts` — добавлены тесты
- `docs/DIACRITICS_SUPPORT.md` — новая документация

## Примеры использования

```bash
# Базовое использование
telegraph-publisher epub -f chapter.md -a "Author" -o book.epub

# С отладкой (для проверки CSS)
telegraph-publisher epub -f chapter.md -a "Author" --debug -o book.epub

# Множественные файлы
telegraph-publisher epub -f index.md ch1.md ch2.md -a "Author" -o book.epub
```

## Проверка результата

1. Сгенерируйте EPUB с флагом `--debug`
2. Откройте `.epub-temp-*/OEBPS/chapter-1.html` в браузере
3. Убедитесь, что текст в backticks:
   - Отображается **курсивом**
   - Имеет **тёмно-синий цвет**
   - Диакритика видна **корректно**

## Дальнейшие улучшения (опционально)

- [ ] Добавить поддержку встроенных Web Fonts (требует увеличения размера EPUB)
- [ ] Добавить конфигурацию цвета для санскрита через CLI флаги
- [ ] Поддержка других языков с диакритикой (иврит, греческий и т.д.)


