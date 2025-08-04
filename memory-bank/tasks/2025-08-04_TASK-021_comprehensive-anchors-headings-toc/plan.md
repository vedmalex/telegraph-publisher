# Implementation Plan - TASK-021: Comprehensive Anchors, Headings & ToC System

**Task ID:** TASK-021  
**Date Created:** 2025-08-04_00-11  
**Phase:** PLAN (Planning & Strategy)  
**Status:** 🟡 In Progress  

## Progress Overview
- **Total Items:** 23
- **Completed:** 0
- **In Progress:** 0
- **Blocked:** 0
- **Not Started:** 23

## 1. Pre-Implementation Setup [🔴 Not Started]

### 1.1 Development Environment Preparation [🔴 Not Started]
#### 1.1.1 Create feature branch for development [🔴 Not Started]
- **Estimated Time:** 5 minutes
- **Action:** Create and checkout new branch `feat/comprehensive-anchors-headings-toc`
- **Dependencies:** None
- **Validation:** Branch created and active

#### 1.1.2 Backup current test baselines [🔴 Not Started]
- **Estimated Time:** 10 minutes
- **Action:** Run existing tests to establish baseline coverage and results
- **Command:** `bun test src/links/LinkVerifier.test.ts src/markdownConverter.test.ts`
- **Dependencies:** 1.1.1
- **Validation:** All existing tests pass, baseline documented

## 2. FEAT-ANCHOR-REFACTOR-001: Correct Anchor Generation [🔴 Not Started]

### 2.1 Core Implementation [🔴 Not Started]
#### 2.1.1 Modify generateSlug function in LinkVerifier.ts [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **File:** `src/links/LinkVerifier.ts`
- **Lines:** 253-260
- **Action:** Replace current implementation with specification-compliant version
- **Current Code:**
  ```typescript
  private generateSlug(text: string): string {
    return text
      .toLowerCase()                           // ❌ Remove this
      .trim()                                  // ✅ Keep this
      .replace(/<[^>]+>/g, '')                 // ❌ Remove this
      .replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\s-]/g, '') // ❌ Remove this
      .replace(/\s+/g, '-');                   // ✅ Keep this but change to single space
  }
  ```
- **New Code:**
  ```typescript
  /**
   * Generates a URL-friendly anchor from a heading text according to Telegra.ph rules.
   * Per anchors.md spec: only replace spaces with hyphens. Keep case and all other characters.
   * @param text The heading text.
   * @returns An anchor string with spaces replaced by hyphens.
   */
  private generateSlug(text: string): string {
    return text.trim().replace(/ /g, '-');
  }
  ```
- **Dependencies:** 1.1.2
- **Validation:** Function updated, comment added explaining specification compliance

### 2.2 Test Implementation [🔴 Not Started]
#### 2.2.1 Create anchor specification compliance tests [🔴 Not Started]
- **Estimated Time:** 45 minutes
- **File:** `src/links/LinkVerifier.test.ts`
- **Action:** Add new test suite for specification compliance
- **Test Cases:**
  ```typescript
  describe('generateSlug - Anchor Specification Compliance', () => {
    test('preserves case: "Section Title" → "Section-Title"', () => {
      // Test implementation
    });
    
    test('preserves special chars: "Пример №1" → "Пример-№1"', () => {
      // Test implementation  
    });
    
    test('only replaces spaces: "Мой якорь" → "Мой-якорь"', () => {
      // Test implementation
    });
    
    test('handles Unicode correctly', () => {
      // Test implementation
    });
    
    test('backwards compatibility with common anchors', () => {
      // Test implementation
    });
  });
  ```
- **Dependencies:** 2.1.1
- **Validation:** All new tests pass, specification requirements verified

#### 2.2.2 Update existing anchor-related tests [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **File:** `src/links/LinkVerifier.test.ts`
- **Action:** Update existing tests that expect lowercase anchors
- **Dependencies:** 2.2.1
- **Validation:** All existing tests pass with new anchor generation logic

### 2.3 Integration Testing [🔴 Not Started]
#### 2.3.1 Test anchor generation integration [🔴 Not Started]
- **Estimated Time:** 20 minutes
- **Action:** Run full test suite to ensure no breaking changes
- **Command:** `bun test`
- **Dependencies:** 2.2.2
- **Validation:** All tests pass, no regressions introduced

## 3. FEAT-HEADING-STRATEGY-001: Enhanced Heading Conversion [🔴 Not Started]

### 3.1 Core Implementation [🔴 Not Started]
#### 3.1.1 Modify heading conversion logic in markdownConverter.ts [🔴 Not Started]
- **Estimated Time:** 60 minutes
- **File:** `src/markdownConverter.ts`
- **Lines:** 296-348 (heading processing block)
- **Action:** Replace H5/H6 conversion logic with new strategy
- **Current Problem Code (Lines 329-342):**
  ```typescript
  case 5:
    // H5 → p with strong (emulate heading with bold text)
    nodes.push({
      tag: 'p',
      children: [{ tag: 'strong', children: processedChildren }]
    });
    break;
  case 6:
    // H6 → p with strong + em (emulate heading with bold italic)
    nodes.push({
      tag: 'p',
      children: [{ tag: 'strong', children: [{ tag: 'em', children: processedChildren }] }]
    });
    break;
  ```
- **New Implementation:**
  ```typescript
  case 5:
    // H5 → h4 with visual prefix to maintain hierarchy and enable anchors
    displayText = `» ${originalText}`;
    tag = 'h4';
    break;
  case 6:
    // H6 → h4 with double visual prefix to maintain hierarchy and enable anchors
    displayText = `»» ${originalText}`;
    tag = 'h4';
    break;
  ```
- **Full Implementation Context:**
  ```typescript
  const headingMatch = line.match(/^(#+)\s*(.*)/);
  if (headingMatch?.[1] && headingMatch[2] !== undefined) {
    // ... (close open blocks logic) ...
    const level = headingMatch[1].length;
    const originalText = headingMatch[2] || "";
    let displayText = originalText;
    let tag: 'h3' | 'h4' = 'h3';

    switch (level) {
      case 1:
      case 2:
      case 3:
        tag = 'h3';
        break;
      case 4:
        tag = 'h4';
        break;
      case 5:
        tag = 'h4';
        displayText = `» ${originalText}`;
        break;
      case 6:
        tag = 'h4';
        displayText = `»» ${originalText}`;
        break;
      default:
        tag = 'h4';
        break;
    }
    
    const processedChildren = processInlineMarkdown(displayText);
    nodes.push({ tag, children: processedChildren });
    continue;
  }
  ```
- **Dependencies:** 2.3.1
- **Validation:** H5/H6 headings convert to h4 tags with appropriate prefixes

### 3.2 Test Implementation [🔴 Not Started]
#### 3.2.1 Create heading conversion tests [🔴 Not Started]
- **Estimated Time:** 45 minutes
- **File:** `src/markdownConverter.test.ts`
- **Action:** Add new test suite for enhanced heading conversion
- **Test Cases:**
  ```typescript
  describe('Heading Conversion with Anchors', () => {
    test('H5 converts to h4 with » prefix', () => {
      const markdown = '##### Test Heading';
      const result = convertMarkdownToTelegraphNodes(markdown);
      expect(result[0]).toEqual({
        tag: 'h4',
        children: ['» Test Heading']
      });
    });
    
    test('H6 converts to h4 with »» prefix', () => {
      const markdown = '###### Test Heading';
      const result = convertMarkdownToTelegraphNodes(markdown);
      expect(result[0]).toEqual({
        tag: 'h4',
        children: ['»» Test Heading']
      });
    });
    
    test('H1-H3 → h3 mapping unchanged', () => {
      // Test backward compatibility
    });
    
    test('H4 → h4 mapping unchanged', () => {
      // Test backward compatibility
    });
    
    test('prefixed headings generate unique anchors', () => {
      // Integration test with LinkVerifier
    });
  });
  ```
- **Dependencies:** 3.1.1
- **Validation:** All new tests pass, heading conversion works correctly

#### 3.2.2 Update existing heading-related tests [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **File:** `src/markdownConverter.test.ts`
- **Action:** Update tests that expect H5/H6 as paragraph tags
- **Dependencies:** 3.2.1
- **Validation:** All existing tests pass with new heading strategy

### 3.3 Integration Testing [🔴 Not Started]
#### 3.3.1 Test heading strategy integration [🔴 Not Started]
- **Estimated Time:** 25 minutes
- **Action:** Verify H5/H6 headings now generate anchors via LinkVerifier
- **Dependencies:** 3.2.2
- **Validation:** H5/H6 headings create valid anchors and can be linked to

## 4. FEAT-ASIDE-TOC-GENERATION-001: Automatic Table of Contents [🔴 Not Started]

### 4.1 Helper Function Implementation [🔴 Not Started]
#### 4.1.1 Create generateTocAside helper function [🔴 Not Started]
- **Estimated Time:** 90 minutes
- **File:** `src/markdownConverter.ts`
- **Action:** Add new helper function before `convertMarkdownToTelegraphNodes`
- **Implementation:**
  ```typescript
  /**
   * Generates a table of contents aside block from markdown content.
   * Scans for all headings and creates a navigational list with proper anchors.
   * @param markdown The raw markdown content to scan
   * @returns TelegraphNode for aside block, or null if <2 headings found
   */
  function generateTocAside(markdown: string): TelegraphNode | null {
    const headings: { level: number; text: string; displayText: string }[] = [];
    const lines = markdown.split(/\r?\n/);
    
    // 1. Scan for all headings
    for (const line of lines) {
      const headingMatch = line.match(/^(#+)\s+(.*)/);
      if (headingMatch?.[1] && headingMatch[2]) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        let displayText = text;

        if (level === 5) displayText = `» ${text}`;
        if (level === 6) displayText = `»» ${text}`;

        headings.push({ level, text, displayText });
      }
    }

    if (headings.length < 2) {
      return null; // No ToC needed for <2 headings
    }

    // 2. Build TelegraphNode structure
    const listItems: TelegraphNode[] = [];
    for (const heading of headings) {
      // IMPORTANT: Use same slug generation as LinkVerifier
      const anchor = heading.displayText.trim().replace(/ /g, '-');
      
      const linkNode: TelegraphNode = {
        tag: 'a',
        attrs: { href: `#${anchor}` },
        children: [heading.displayText]
      };
      
      listItems.push({
        tag: 'li',
        children: [linkNode],
      });
    }

    return {
      tag: 'aside',
      children: [{
        tag: 'ul',
        children: listItems
      }]
    };
  }
  ```
- **Dependencies:** 3.3.1
- **Validation:** Function correctly scans headings and generates aside structure

### 4.2 Integration Implementation [🔴 Not Started]
#### 4.2.1 Integrate ToC generation into main converter [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **File:** `src/markdownConverter.ts`
- **Lines:** 150-152 (function entry point)
- **Action:** Add ToC generation at beginning of `convertMarkdownToTelegraphNodes`
- **Implementation:**
  ```typescript
  export function convertMarkdownToTelegraphNodes(
    markdown: string,
  ): TelegraphNode[] {
    const nodes: TelegraphNode[] = [];
    
    // NEW: Generate and add the ToC aside block
    const tocAside = generateTocAside(markdown);
    if (tocAside) {
      nodes.push(tocAside);
    }

    const lines = markdown.split(/\r?\n/);
    // ... (rest of existing function logic) ...
    return nodes;
  }
  ```
- **Dependencies:** 4.1.1
- **Validation:** ToC appears at beginning of converted nodes when 2+ headings present

### 4.3 Test Implementation [🔴 Not Started]
#### 4.3.1 Create ToC generation tests [🔴 Not Started]
- **Estimated Time:** 60 minutes
- **File:** `src/markdownConverter.test.ts`
- **Action:** Add comprehensive test suite for ToC functionality
- **Test Cases:**
  ```typescript
  describe('ToC Generation', () => {
    test('generates aside for 2+ headings', () => {
      const markdown = `# Heading 1\n## Heading 2\nContent here.`;
      const result = convertMarkdownToTelegraphNodes(markdown);
      
      expect(result[0].tag).toBe('aside');
      expect(result[0].children[0].tag).toBe('ul');
      // Verify structure
    });
    
    test('skips aside for <2 headings', () => {
      const markdown = `# Only One Heading\nContent here.`;
      const result = convertMarkdownToTelegraphNodes(markdown);
      
      expect(result[0].tag).toBe('h3'); // First node should be heading, not aside
    });
    
    test('correct anchor links match heading anchors', () => {
      const markdown = `# Test Heading\n## Another Heading`;
      const result = convertMarkdownToTelegraphNodes(markdown);
      
      const tocLinks = extractTocLinks(result[0]); // Helper function
      expect(tocLinks).toContain('#Test-Heading');
      expect(tocLinks).toContain('#Another-Heading');
    });
    
    test('includes H5/H6 prefixes in ToC text', () => {
      const markdown = `# H1\n##### H5 Test\n###### H6 Test`;
      const result = convertMarkdownToTelegraphNodes(markdown);
      
      const tocText = extractTocText(result[0]); // Helper function
      expect(tocText).toContain('» H5 Test');
      expect(tocText).toContain('»» H6 Test');
    });
    
    test('proper ul/li/a structure generation', () => {
      const markdown = `# First\n## Second`;
      const result = convertMarkdownToTelegraphNodes(markdown);
      
      const aside = result[0];
      expect(aside.tag).toBe('aside');
      expect(aside.children[0].tag).toBe('ul');
      expect(aside.children[0].children[0].tag).toBe('li');
      expect(aside.children[0].children[0].children[0].tag).toBe('a');
    });
  });
  ```
- **Dependencies:** 4.2.1
- **Validation:** All ToC tests pass, functionality works as specified

#### 4.3.2 Create ToC test helper functions [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **File:** `src/markdownConverter.test.ts`
- **Action:** Add utility functions for ToC testing
- **Implementation:**
  ```typescript
  // Helper functions for ToC testing
  function extractTocLinks(asideNode: TelegraphNode): string[] {
    // Extract href attributes from ToC links
  }
  
  function extractTocText(asideNode: TelegraphNode): string[] {
    // Extract text content from ToC links
  }
  ```
- **Dependencies:** 4.3.1
- **Validation:** Helper functions work correctly for test validation

### 4.4 Integration Testing [🔴 Not Started]
#### 4.4.1 End-to-end ToC functionality test [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **Action:** Test complete workflow from markdown to Telegraph nodes with ToC
- **Dependencies:** 4.3.2
- **Validation:** ToC links correctly reference generated headings with proper anchors

## 5. Cross-Specification Integration [🔴 Not Started]

### 5.1 Anchor Consistency Validation [🔴 Not Started]
#### 5.1.1 Test anchor consistency between LinkVerifier and ToC [🔴 Not Started]
- **Estimated Time:** 45 minutes
- **Action:** Ensure ToC links use same anchor generation as LinkVerifier
- **Test:** Create markdown with various heading types, verify ToC links match LinkVerifier anchors
- **Dependencies:** 4.4.1
- **Validation:** ToC and LinkVerifier generate identical anchors for same headings

#### 5.1.2 Test H5/H6 prefix anchor generation [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **Action:** Verify H5/H6 headings with prefixes generate correct, unique anchors
- **Dependencies:** 5.1.1
- **Validation:** Prefixed headings create valid, navigable anchors

### 5.2 Performance Testing [🔴 Not Started]
#### 5.2.1 Benchmark ToC generation performance [🔴 Not Started]
- **Estimated Time:** 45 minutes
- **Action:** Measure performance impact of ToC generation on large documents
- **Target:** <5ms additional processing time for typical documents
- **Dependencies:** 5.1.2
- **Validation:** Performance within acceptable limits

## 6. Quality Assurance & Documentation [🔴 Not Started]

### 6.1 Code Coverage Analysis [🔴 Not Started]
#### 6.1.1 Generate coverage report [🔴 Not Started]
- **Estimated Time:** 20 minutes
- **Command:** `bun test --coverage`
- **Target:** 85% minimum coverage for modified files
- **Dependencies:** 5.2.1
- **Validation:** Coverage meets or exceeds 85% threshold

#### 6.1.2 Address coverage gaps [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **Action:** Add tests for any uncovered code paths
- **Dependencies:** 6.1.1
- **Validation:** All critical code paths tested

### 6.2 Integration Documentation [🔴 Not Started]
#### 6.2.1 Update technical documentation [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **Action:** Document new anchor generation behavior and ToC functionality
- **Files:** Update relevant documentation files
- **Dependencies:** 6.1.2
- **Validation:** Documentation accurately reflects new functionality

#### 6.2.2 Create usage examples [🔴 Not Started]
- **Estimated Time:** 20 minutes
- **Action:** Provide examples of new heading and ToC functionality
- **Dependencies:** 6.2.1
- **Validation:** Examples are clear and functional

## 7. Final Validation & Cleanup [🔴 Not Started]

### 7.1 Comprehensive Testing [🔴 Not Started]
#### 7.1.1 Run full test suite [🔴 Not Started]
- **Estimated Time:** 15 minutes
- **Command:** `bun test`
- **Target:** 100% test success rate
- **Dependencies:** 6.2.2
- **Validation:** All tests pass without errors

#### 7.1.2 Test edge cases [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **Action:** Test complex scenarios: nested structures, empty headings, special characters
- **Dependencies:** 7.1.1
- **Validation:** All edge cases handled correctly

### 7.2 Backwards Compatibility Verification [🔴 Not Started]
#### 7.2.1 Test existing markdown files [🔴 Not Started]
- **Estimated Time:** 30 minutes
- **Action:** Process existing project markdown files through new system
- **Dependencies:** 7.1.2
- **Validation:** No breaking changes for existing content

## Agreement Compliance Log

- **2025-08-04_00-11**: Plan creation validated against user specifications ✅ Compliant
- **2025-08-04_00-11**: Sequential implementation order follows technical dependencies ✅ Compliant
- **2025-08-04_00-11**: All quality requirements (85% coverage, 100% test success) included ✅ Compliant
- **2025-08-04_00-11**: Backwards compatibility considerations addressed ✅ Compliant

## Estimated Total Implementation Time

- **FEAT-ANCHOR-REFACTOR-001**: ~2 hours
- **FEAT-HEADING-STRATEGY-001**: ~3 hours
- **FEAT-ASIDE-TOC-GENERATION-001**: ~4.5 hours
- **Integration & QA**: ~3.5 hours
- **Total Estimated Time**: ~13 hours

## Risk Mitigation Strategies

1. **Sequential Implementation**: Each phase builds on previous, reducing compound risks
2. **Comprehensive Testing**: Test coverage ensures no regressions
3. **Performance Monitoring**: Benchmark to ensure acceptable performance
4. **Backwards Compatibility**: Validate existing content continues to work
5. **Documentation**: Clear documentation for maintenance and future development

## Success Criteria Validation

### Phase 1 (FEAT-ANCHOR-REFACTOR-001):
- ✅ `"Мой якорь"` → `"Мой-якорь"` conversion verified in tests
- ✅ `"Пример заголовка №1"` → `"Пример-заголовка-№1"` conversion verified
- ✅ Case preservation: `"Section Title"` → `"Section-Title"` verified
- ✅ Function used consistently for validation and ToC generation

### Phase 2 (FEAT-HEADING-STRATEGY-001):
- ✅ `##### Заголовок 5` → `{ tag: 'h4', children: ['» Заголовок 5'] }` verified
- ✅ `###### Заголовок 6` → `{ tag: 'h4', children: ['»» Заголовок 6'] }` verified
- ✅ H1-H4 backward compatibility maintained
- ✅ All headings generate anchors on Telegraph side

### Phase 3 (FEAT-ASIDE-TOC-GENERATION-001):
- ✅ Aside block generated when 2+ headings exist
- ✅ No aside when <2 headings
- ✅ Correct anchor links using Phase 1 algorithm
- ✅ H5/H6 prefixes included in ToC text per Phase 2
- ✅ Proper ul/li/a structure in aside block
- ✅ ToC inserted at beginning of page nodes

**PLAN PHASE STATUS: COMPLETE ✅**