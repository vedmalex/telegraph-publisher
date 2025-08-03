---
task: TASK-004
phase: VAN
created: 2025-07-26_20-59
---

# VAN Analysis - Rate Limit Countdown Implementation

## V - VISION (Что мы хотим достичь)

### Основная цель
Добавить визуальный обратный отсчет времени ожидания при rate limiting, чтобы пользователь понимал:
- Сколько времени осталось ждать
- Прогресс выполнения ожидания
- Причину задержки

### Пользовательский опыт
**Текущее состояние:**
```
🚦 Rate limited: waiting 30s before retry...
[30 секунд тишины]
```

**Желаемое состояние:**
```
🚦 Rate limited: waiting 30s before retry...
⏳ Remaining: 00:28 [████████████████▓▓▓▓] 93%
⏳ Remaining: 00:27 [███████████████▓▓▓▓▓] 90%
...
⏳ Remaining: 00:01 [████████████████████] 97%
✅ Rate limit cleared, retrying...
```

### Ценность для пользователя
- **Прозрачность**: Понимание времени ожидания
- **Контроль**: Возможность планировать действия
- **Уверенность**: Система работает, а не зависла
- **Профессиональность**: Полированный UX

## A - ANALYSIS (Анализ текущего состояния)

### Архитектурный анализ

#### Существующие компоненты
1. **RateLimiter** (`src/ratelimiter/RateLimiter.ts`)
   - ✅ `handleFloodWait(floodWaitSeconds)` - основная точка интеграции
   - ✅ `sleep(ms)` - механизм ожидания
   - ✅ Метрики и логирование

2. **ProgressIndicator** (`src/cli/ProgressIndicator.ts`)
   - ✅ Готовая система прогресс-баров
   - ✅ Форматирование и анимация
   - ❓ Нужно проверить совместимость с countdown

3. **EnhancedTelegraphPublisher** (`src/publisher/EnhancedTelegraphPublisher.ts`)
   - ✅ Использует RateLimiter
   - ✅ Обрабатывает FLOOD_WAIT ошибки
   - ✅ Логирует предупреждения

#### Текущий поток FLOOD_WAIT
```
FLOOD_WAIT Error → Parse seconds → Log warning → handleFloodWait() → sleep() → Retry
```

#### Точки интеграции
1. **Основная**: `RateLimiter.handleFloodWait()`
2. **Альтернативная**: `RateLimiter.sleep()` с callback
3. **Дополнительная**: Обертка для публичного API

### Технический анализ

#### Требования к реализации
1. **Неблокирующий countdown**: Обновление каждую секунду
2. **Точность**: Синхронизация с реальным временем
3. **Форматирование**: mm:ss для < 60 мин, hh:mm:ss для больших
4. **Progress bar**: Визуальная индикация 0-100%
5. **Отзывчивость**: Возможность прерывания (если нужно)

#### Технические ограничения
- **Console output**: Только текстовый интерфейс
- **Single threaded**: Node.js event loop
- **Точность**: setTimeout не гарантирует точность
- **Совместимость**: Должно работать в разных терминалах

### Риски и вызовы

#### Технические риски
1. **Точность timing**: setTimeout может дрифтовать
2. **Console flooding**: Слишком частые обновления
3. **Терминальная совместимость**: Разные эмуляторы
4. **Прерывание**: Graceful shutdown при Ctrl+C

#### Архитектурные риски
1. **Coupling**: Слишком тесная связь с ProgressIndicator
2. **Testability**: Сложность тестирования асинхронных countdown
3. **Configuration**: Нужны ли настройки для countdown

## N - NEXT STEPS (Следующие шаги)

### Фаза PLAN - Детальное планирование
1. **Архитектурное решение**
   - Выбрать подход к интеграции
   - Определить API для countdown
   - Спроектировать интерфейсы

2. **Компонентная структура**
   - Решить: расширять RateLimiter или создать отдельный CountdownTimer
   - Определить зависимости от ProgressIndicator
   - Спланировать конфигурацию

3. **Пользовательский интерфейс**
   - Финальный дизайн countdown display
   - Форматы времени и прогресс-бара
   - Сообщения и цвета

### Фаза IMPLEMENT - Реализация
1. **Core countdown logic**
   - Точный timer с коррекцией дрифта
   - Форматирование времени
   - Progress calculation

2. **Интеграция с RateLimiter**
   - Модификация handleFloodWait
   - Backwards compatibility
   - Error handling

3. **UI компоненты**
   - Countdown display
   - Progress bar integration
   - Terminal output management

### Фаза QA - Тестирование
1. **Unit tests**
   - Timer accuracy
   - Formatting functions
   - Progress calculation

2. **Integration tests**
   - RateLimiter integration
   - Real FLOOD_WAIT scenarios
   - Terminal output validation

3. **Manual testing**
   - Different wait durations
   - Terminal compatibility
   - User experience validation

## Выводы VAN анализа

### Готовность к реализации: ✅ ГОТОВО
- Четкое понимание требований
- Существующая архитектура поддерживает расширение
- Минимальные архитектурные изменения
- Ясные точки интеграции

### Ключевые решения для PLAN фазы
1. **Архитектура**: Расширить RateLimiter с опциональным countdown
2. **UI**: Использовать существующий ProgressIndicator
3. **Timing**: Реализовать drift-корректированный timer
4. **API**: Обратно совместимые изменения

### Риски требующие внимания
- Точность timing в разных средах
- Тестирование асинхронного поведения
- Terminal compatibility

**Статус**: ✅ VAN анализ завершен, готов к переходу в фазу PLAN