# VAN Analysis: Unify Anchor Generation

**Task:** 2025-08-04_TASK-030_unify-anchor-generation  
**Phase:** VAN Analysis  
**Date:** 2025-08-04 21:00

## 🔍 Problem Analysis

### Current State: Two Conflicting Anchor Generation Mechanisms

#### 1️⃣ **TOC/Aside Mechanism** (`src/markdownConverter.ts:generateTocAside`)

**Location**: `src/markdownConverter.ts`, function `generateTocAside` (lines 225-228)

**Algorithm**:
```typescript
const anchor = heading.textForAnchor
    .trim()
    .replace(/[<]/g, '') // Remove only < characters (preserve > for H5/H6 prefixes)
    .replace(/ /g, '-');  // Replace spaces with hyphens
```

**Features**:
- ✅ **Heading Level Support**: Обрабатывает H5/H6 с префиксами `>`, `>>`
- ✅ **Link Handling**: Извлекает текст из ссылок в заголовках `[text](url)`
- ✅ **Preserve > Characters**: Сохраняет `>` символы для H5/H6 префиксов
- ✅ **Real Usage**: Используется в production для генерации aside/TOC
- ✅ **Empirical Validation**: Проверен на реальных публикациях Telegraph

**Input Processing**:
```typescript
// Level-specific processing
case 5:
    displayText = `> ${originalText}`;
    textForAnchor = linkInHeadingMatch ? `> ${linkInHeadingMatch[1]}` : `> ${originalText}`;
    break;
case 6:
    displayText = `>> ${originalText}`;
    textForAnchor = linkInHeadingMatch ? `>> ${linkInHeadingMatch[1]}` : `>> ${originalText}`;
    break;
```

#### 2️⃣ **Link Verification Mechanism** (`src/links/LinkVerifier.ts:generateSlug`)

**Location**: `src/links/LinkVerifier.ts`, method `generateSlug` (lines 286-292)

**Algorithm**:
```typescript
return text
    .trim()
    .replace(/[<>]/g, '') // Remove BOTH < and > characters
    .replace(/ /g, '-');  // Replace spaces with hyphens
```

**Features**:
- ❌ **No Heading Level Support**: Не обрабатывает H5/H6 префиксы
- ❌ **No Link Handling**: Не извлекает текст из ссылок в заголовках
- ❌ **Removes > Characters**: Удаляет `>` символы, нарушая H5/H6 якоря
- ✅ **Simple Logic**: Проще для понимания и тестирования
- ❌ **Inconsistent**: Дает разные результаты для тех же заголовков

### 🚨 **Critical Inconsistency Examples**

#### Example 1: H5 Heading
**Markdown**: `##### Advanced Configuration`

**TOC Result**: `> Advanced Configuration` → anchor: `>-Advanced-Configuration`
**LinkVerifier Result**: `Advanced Configuration` → anchor: `Advanced-Configuration`
**Status**: ❌ **MISMATCH** - Link validation would fail

#### Example 2: H6 Heading  
**Markdown**: `###### API Details`

**TOC Result**: `>> API Details` → anchor: `>>-API-Details`
**LinkVerifier Result**: `API Details` → anchor: `API-Details`
**Status**: ❌ **MISMATCH** - Link validation would fail

#### Example 3: Link in Heading
**Markdown**: `## [GitHub Repository](https://github.com/user/repo)`

**TOC Result**: `GitHub Repository` → anchor: `GitHub-Repository`
**LinkVerifier Result**: `[GitHub Repository](https://github.com/user/repo)` → anchor: `[GitHub-Repository](https://github.com/user/repo)`
**Status**: ❌ **MISMATCH** - Link validation would fail

#### Example 4: Regular Heading (Working Case)
**Markdown**: `## Regular Section`

**TOC Result**: `Regular Section` → anchor: `Regular-Section`
**LinkVerifier Result**: `Regular Section` → anchor: `Regular-Section`
**Status**: ✅ **MATCH** - Works correctly

## 📊 Impact Assessment

### 🔴 **High Impact Issues**

1. **False Positives in Link Validation**: 
   - H5/H6 заголовки помечаются как broken links
   - Ссылки в заголовках не валидируются корректно
   - Пользователи получают ложные ошибки

2. **User Experience Degradation**:
   - Корректные ссылки помечаются как сломанные
   - Снижается доверие к системе валидации
   - Дополнительная работа по "исправлению" рабочих ссылок

3. **Cache Inconsistency**:
   - Кэш anchor-ов содержит неправильные якоря
   - Performance improvement нивелируется false positives
   - Кэш нужно будет пересоздать после исправления

### 🟡 **Medium Impact Issues**

1. **Development Confusion**:
   - Два разных алгоритма для одной задачи
   - Сложность поддержки и дебаггинга
   - Несоответствие между тестами и реальным поведением

2. **Documentation Gap**:
   - Нет единой документации по генерации якорей
   - Разработчики могут не знать о различиях
   - Сложность для новых участников проекта

## 🎯 Technical Requirements Analysis

### ✅ **Must Have Requirements**

1. **Single Source of Truth**: Один механизм генерации якорей для всей системы
2. **H5/H6 Support**: Поддержка префиксов `>`, `>>` для H5/H6 заголовков
3. **Link Extraction**: Обработка ссылок в заголовках `[text](url)`
4. **Backward Compatibility**: Поддержка существующих anchor-ссылок
5. **Performance**: Не ухудшать производительность кэширования

### 🔧 **Implementation Strategy**

#### **Option 1: Extract and Enhance TOC Logic** ⭐ **RECOMMENDED**

**Approach**: Извлечь логику из `generateTocAside` в общую функцию

**Advantages**:
- ✅ Использует проверенный production механизм
- ✅ Поддерживает все edge cases (H5/H6, links)
- ✅ Минимальные изменения в TOC логике
- ✅ Высокое качество (уже тестировано в production)

**Disadvantages**:
- 🔧 Требует рефакторинг `LinkVerifier`
- 🔧 Нужно обновить тесты
- 🔧 Потребуется cache invalidation

#### **Option 2: Enhance LinkVerifier Logic**

**Approach**: Улучшить `generateSlug` до уровня TOC

**Advantages**:
- ✅ Меньше изменений в structure
- ✅ Сохраняет текущий API LinkVerifier

**Disadvantages**:
- ❌ Дублирование сложной логики уровней заголовков
- ❌ Риск несоответствия с TOC
- ❌ Больше места для ошибок

## 🏗️ **Recommended Architecture**

### **New Shared Module**: `src/utils/AnchorGenerator.ts`

```typescript
export interface HeadingInfo {
  level: number;
  originalText: string;
  textForAnchor: string;
}

export class AnchorGenerator {
  static extractHeadingInfo(headingMatch: RegExpMatchArray): HeadingInfo
  static generateAnchor(headingInfo: HeadingInfo): string
  static parseHeadingsFromContent(content: string): HeadingInfo[]
}
```

### **Integration Points**

1. **TOC Generation** (`generateTocAside`): Use `AnchorGenerator.generateAnchor()`
2. **Link Verification** (`LinkVerifier`): Use `AnchorGenerator.parseHeadingsFromContent()`
3. **Content Processing**: Single source for all anchor-related operations

## 📋 **Implementation Checklist**

### Phase 1: Foundation
- [ ] Create `AnchorGenerator` utility class
- [ ] Extract heading parsing logic from `generateTocAside`
- [ ] Extract anchor generation logic from `generateTocAside`
- [ ] Add comprehensive unit tests for `AnchorGenerator`

### Phase 2: Integration  
- [ ] Update `generateTocAside` to use `AnchorGenerator`
- [ ] Update `LinkVerifier.parseAnchorsFromContent` to use `AnchorGenerator`
- [ ] Ensure backward compatibility
- [ ] Update existing tests

### Phase 3: Validation
- [ ] Add integration tests for TOC ↔ LinkVerifier consistency
- [ ] Test H5/H6 heading scenarios
- [ ] Test link-in-heading scenarios
- [ ] Performance regression testing

### Phase 4: Cache Management
- [ ] Add cache version increment
- [ ] Add migration logic for existing caches
- [ ] Document cache invalidation process

## 🧪 **Test Scenarios**

### **Critical Test Cases**

1. **H5/H6 Consistency**: 
   ```markdown
   ##### Advanced Setup
   ###### API Reference
   ```
   TOC anchor must match LinkVerifier anchor

2. **Link in Heading**:
   ```markdown
   ## [Documentation](https://example.com)
   ```
   Both systems should extract "Documentation" for anchor

3. **Complex Unicode**:
   ```markdown
   ### Тест заголовка с символами!@#
   ```
   Consistent behavior for international content

4. **Edge Cases**:
   ```markdown
   ## **Bold Heading**
   ### `Code Heading`
   #### Heading with <tags>
   ```

## 📈 **Success Metrics**

1. **Consistency**: 100% якорей в TOC совпадают с кэшированными якорями
2. **No Regressions**: Все существующие тесты проходят
3. **Performance**: Кэширование работает без performance degradation
4. **User Experience**: Elimination of false positive link validation errors

## 🎯 **Complexity Assessment**

**Estimated Complexity**: 🟡 **Medium** 

**Time Estimate**: 4-6 hours
- Foundation: 2 hours
- Integration: 2 hours  
- Testing: 1-2 hours

**Risk Level**: 🟢 **Low**
- Well-defined problem
- Clear solution path
- Comprehensive test coverage available
- Non-breaking change possible

## 📋 **Next Steps**

1. ✅ **VAN Analysis Complete**
2. ➡️ **PLAN Phase**: Create detailed implementation plan
3. ➡️ **CREATIVE Phase**: Design AnchorGenerator architecture
4. ➡️ **IMPLEMENT Phase**: Execute unified anchor generation
5. ➡️ **QA Phase**: Validate consistency and performance