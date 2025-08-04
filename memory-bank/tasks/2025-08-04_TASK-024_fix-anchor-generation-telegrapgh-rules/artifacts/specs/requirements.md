# Technical Specification: Correct Anchor Generation According to Telegra.ph Rules

**ID:** `FIX-ANCHOR-GENERATION-002`
**Date:** `2025-08-04`
**Author:** `External Agent (Technical Specs)`
**Status:** `Ready for Implementation`

## 1. Problem Description

Current anchor generation and validation mechanisms (`generateSlug` in `LinkVerifier.ts` and `generateTocAside` in `markdownConverter.ts`) don't match Telegra.ph's real behavior. This leads to false "broken link" errors and creation of non-functional table of contents.

## 2. Root Cause Analysis

Research conducted with `research_anchors.ts` script revealed the exact anchor generation rules:

| Original Heading | Generated ID (anchor) | Observations |
| :--- | :--- | :--- |
| `Simple Title` | `Simple-Title` | **Rule 1:** Spaces replaced with `-`. |
| `Заголовок с пробелами` | `Заголовок-с-пробелами` | **Rule 1** confirmed for Cyrillic. |
| `1. Numbered Heading` | `1.-Numbered-Heading` | **Rule 2:** All symbols preserved including dots. |
| `Title with comma,` | `Title-with-comma,` | **Rule 2** confirmed for commas. |
| `Title with colon:` | `Title-with-colon:` | **Rule 2** confirmed for colons. |
| `Title with question mark?` | `Title-with-question-mark?` | **Rule 2** confirmed for question marks. |
| `Аналогия «Дерево цивилизации»...` | `Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)` | **Rule 2** confirmed for parentheses, guillemets. |
| `Title with @#$%^&*()...` | `Title-with-@#$%^&*()-+-=[]{}|;'"` | **Rule 3:** `<` and `>` symbols removed. `&` becomes `&amp;` in HTML but symbol preserved. Quote `'` becomes `&#39;`. |
| `**Bold Title**` | `**Bold-Title**` | **Rule 4:** Markdown symbols **NOT removed** and become part of anchor. |
| `*Italic Title*` | `*Italic-Title*` | **Rule 4** confirmed. |
| `[Link Title](url)` | `[Link-Title](url)` | **Rule 4** confirmed. |

## 3. Precise Algorithm

1. Take **source text** of heading, including all Markdown symbols
2. Remove `<` and `>` characters
3. Replace all spaces (` `) with hyphens (`-`)
4. Leave other symbols unchanged, including punctuation, Cyrillic, and special characters
5. **Preserve** character case

## 4. Implementation Requirements

### A. Modify `LinkVerifier.ts`

**File:** `src/links/LinkVerifier.ts`

**Updated `generateSlug` method:**
```typescript
/**
 * Generates a URL-friendly anchor from a heading text according to Telegra.ph rules.
 * @param text The heading text (including any Markdown formatting).
 * @returns An anchor string compliant with Telegra.ph.
 */
private generateSlug(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[<>]/g, '') // 1. Remove < and > characters
    .replace(/ /g, '-');  // 2. Replace spaces with hyphens
}
```

**Updated `getAnchorsForFile` method:**
```typescript
private getAnchorsForFile(filePath: string): Set<string> {
  // ... (code before loop)
  while ((match = headingRegex.exec(content)) !== null) {
    const headingText = match[2]?.trim();
    if (headingText) {
      // REMOVED: cleanMarkdownString(headingText)
      // The raw heading text is passed directly to the new slug generator.
      anchors.add(this.generateSlug(headingText));
    }
  }
  // ... (code after loop)
}
```

### B. Modify `markdownConverter.ts`

**File:** `src/markdownConverter.ts`

**Updated `generateTocAside` logic:**
```typescript
// in src/markdownConverter.ts -> generateTocAside

// ... (inside for...of loop)
    // IMPORTANT: Use the exact same anchor generation logic as LinkVerifier
    const anchor = heading.displayText
      .trim()
      .replace(/[<>]/g, '') // 1. Remove < and >
      .replace(/ /g, '-');  // 2. Replace spaces
    
    const linkNode: TelegraphNode = {
        tag: 'a',
        attrs: { href: `#${anchor}` },
        children: [
            // NEW: Use processInlineMarkdown to render formatting in ToC text
            ...processInlineMarkdown(heading.displayText) 
        ]
    };
    
    listItems.push({
        tag: 'li',
        children: [linkNode],
    });
// ...
```

## 5. Acceptance Criteria

1. Heading `## **Bold Title**` in `target.md` should generate anchor `**Bold-Title**`
2. Link `[link](./target.md#**Bold-Title**)` in `source.md` should pass validation as **correct**
3. Table of contents (`<aside>`) generated for page with heading `## **Bold Title**` should contain link `<a href="#**Bold-Title**"><strong>Bold Title</strong></a>`
4. All links from error log provided by user should successfully pass validation
5. All tests in `LinkVerifier.test.ts` and `markdownConverter.test.ts` related to anchors should be updated to reflect new logic and pass successfully

## 6. Testing Requirements

- Update existing test cases to match new anchor generation rules
- Add test cases for all discovered patterns from research
- Verify backward compatibility with existing content
- Test performance impact of new algorithm

## 7. Documentation Updates

- Update `src/doc/anchors.md` with correct algorithm
- Document the research findings and methodology
- Update inline code comments to reflect actual behavior

This specification addresses the most fundamental problem. After implementation, we can proceed to remaining tasks with confidence that the foundation for their work is correct.