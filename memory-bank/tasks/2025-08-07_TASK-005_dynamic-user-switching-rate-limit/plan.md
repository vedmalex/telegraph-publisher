# Implementation Plan: Dynamic User Switching on Rate-Limit

**Phase:** PLAN
**Date:** 2025-08-07_00-49
**Based on:** VAN Analysis findings and connectivity mapping

## Progress Overview
- Total Items: 15
- Completed: 0
- In Progress: 0
- Blocked: 0
- Not Started: 15

## 1. Data Model Foundation [🔴 Not Started]
   ### 1.1 FileMetadata Interface Extension [🔴 Not Started]
      #### 1.1.1 Add accessToken field to FileMetadata interface [🔴 Not Started]
      #### 1.1.2 Update TypeScript type definitions and exports [🔴 Not Started]
      #### 1.1.3 Verify ExtendedConfig already supports accessToken [🔴 Not Started]
   ### 1.2 MetadataManager YAML Processing [🔴 Not Started]
      #### 1.2.1 Extend parseYamlMetadata to handle accessToken field [🔴 Not Started]
      #### 1.2.2 Extend serializeMetadata to write accessToken field [🔴 Not Started]
      #### 1.2.3 Add backward compatibility for files without accessToken [🔴 Not Started]

## 2. Update Logic Implementation [🔴 Not Started]
   ### 2.1 editWithMetadata Token Management [🔴 Not Started]
      #### 2.1.1 Implement token extraction from existingMetadata [🔴 Not Started]
      #### 2.1.2 Add temporary token switching logic with try/finally [🔴 Not Started]
      #### 2.1.3 Ensure accessToken preservation in metadata updates [🔴 Not Started]
   ### 2.2 Constraint Enforcement [🔴 Not Started]
      #### 2.2.1 Verify no user switching triggered in editWithMetadata [🔴 Not Started]
      #### 2.2.2 Maintain existing FLOOD_WAIT retry logic for updates [🔴 Not Started]

## 3. New Publication Logic Implementation [🔴 Not Started]
   ### 3.1 User Switching Infrastructure [🔴 Not Started]
      #### 3.1.1 Add accountSwitchCounter private property [🔴 Not Started]
      #### 3.1.2 Implement createNewUserAndSwitch() private method [🔴 Not Started]
         - 3.1.2.1 Get current account info via getAccountInfo()
         - 3.1.2.2 Generate unique short_name with counter increment
         - 3.1.2.3 Call createAccount() with new name and original author details
         - 3.1.2.4 Add informational logging for user switches
   ### 3.2 publishWithMetadata Rate-Limit Handling [🔴 Not Started]
      #### 3.2.1 Add try/catch wrapper around publishNodes call [🔴 Not Started]
      #### 3.2.2 Implement FLOOD_WAIT error detection and handling [🔴 Not Started]
      #### 3.2.3 Add retry logic with new token after user switch [🔴 Not Started]
      #### 3.2.4 Ensure correct accessToken saved to file metadata [🔴 Not Started]

## 4. Token Source Management [🔴 Not Started]
   ### 4.1 Initial Token Resolution [🔴 Not Started]
      #### 4.1.1 Use config accessToken for new files without metadata [🔴 Not Started]
      #### 4.1.2 Ensure createMetadata receives correct accessToken [🔴 Not Started]
   ### 4.2 State Management [🔴 Not Started]
      #### 4.2.1 New accessToken becomes active for subsequent publications [🔴 Not Started]
      #### 4.2.2 Maintain session-level token state consistency [🔴 Not Started]

## 5. Testing and Validation [🔴 Not Started]
   ### 5.1 Unit Tests [🔴 Not Started]
      #### 5.1.1 MetadataManager accessToken parsing/serialization tests [🔴 Not Started]
      #### 5.1.2 createNewUserAndSwitch() method tests [🔴 Not Started]
      #### 5.1.3 Token switching logic tests for both methods [🔴 Not Started]
   ### 5.2 Integration Tests [🔴 Not Started]
      #### 5.2.1 End-to-end user switching workflow test [🔴 Not Started]
      #### 5.2.2 Backward compatibility tests for files without accessToken [🔴 Not Started]
      #### 5.2.3 Rate limit simulation and recovery tests [🔴 Not Started]
   ### 5.3 Edge Case Testing [🔴 Not Started]
      #### 5.3.1 Multiple consecutive FLOOD_WAIT errors handling [🔴 Not Started]
      #### 5.3.2 Network failures during createAccount scenarios [🔴 Not Started]
      #### 5.3.3 Corrupted metadata with accessToken field [🔴 Not Started]

## Implementation Sequence Strategy

### Phase 1: Foundation (Items 1.1-1.2)
**Justification:** Data model must be established before any logic can use accessToken field
**Dependencies:** None
**Risk Level:** Low

### Phase 2: Update Logic (Items 2.1-2.2)  
**Justification:** Self-contained change, can be tested independently
**Dependencies:** Phase 1 completion
**Risk Level:** Low-Medium

### Phase 3: New Publication Logic (Items 3.1-3.2, 4.1-4.2)
**Justification:** Most complex part, depends on data model being ready
**Dependencies:** Phase 1 completion
**Risk Level:** Medium-High

### Phase 4: Testing (Items 5.1-5.3)
**Justification:** Comprehensive testing after all functionality implemented
**Dependencies:** Phases 1-3 completion
**Risk Level:** Low

## Technical Constraints and Agreements

### Backward Compatibility
- [✓] Файлы без accessToken должны продолжать работать с токеном из конфигурации
- [✓] Существующие API methods должны сохранить свои signatures
- [✓] Existing tests должны остаться валидными

### Error Handling Strategy
- [✓] FLOOD_WAIT detection через error message содержащий 'FLOOD_WAIT_'
- [✓] Single retry attempt после user switch для простоты
- [✓] Abort при неудаче createAccount для безопасности
- [✓] Подробный logging для отслеживания переключений

### Integration Points
- [✓] Интеграция с существующим MetadataManager YAML processing
- [✓] Расширение existing error handling в EnhancedTelegraphPublisher
- [✓] Координация с existing RateLimiter FLOOD_WAIT handling
- [✓] Использование ConfigManager для initial accessToken

## Success Criteria

### Functional Acceptance Criteria
- [ ] Новые файлы содержат accessToken в front-matter после публикации
- [ ] Существующие файлы используют сохраненный accessToken при обновлении  
- [ ] FLOOD_WAIT на новых файлах вызывает создание нового аккаунта Telegraph
- [ ] Публикация продолжается с новым токеном после переключения
- [ ] Обновления существующих файлов НЕ вызывают переключение пользователя
- [ ] Новые файлы без метаданных используют токен из конфигурации

### Technical Quality Criteria
- [ ] Минимальное изменение существующего кода
- [ ] 100% backward compatibility сохранена
- [ ] Graceful error handling реализован
- [ ] Comprehensive logging добавлен
- [ ] Unit test coverage ≥85%
- [ ] Integration tests проходят

## Risk Assessment

### High Priority Risks
1. **API Rate Limiting Changes:** Telegraph API может изменить FLOOD_WAIT behavior
   - **Mitigation:** Flexible error detection через message parsing
2. **Concurrent Publications:** Multiple simultaneous publications могут конфликтовать
   - **Mitigation:** Session-level state management в publisher instance

### Medium Priority Risks  
1. **Metadata Corruption:** Неправильное сохранение accessToken может нарушить files
   - **Mitigation:** Comprehensive validation и error handling в MetadataManager
2. **Token Expiration:** New tokens могут expire неожиданно
   - **Mitigation:** Standard Telegraph error handling уже справляется с этим

### Low Priority Risks
1. **Name Collisions:** Generated account names могут конфликтовать
   - **Mitigation:** Unique timestamp-based generation при коллизиях 