# Technical Specification: Complete Fix for Markdown Links with Parentheses in URL

**Task ID:** `FIX-LINK-PARSER-REGEX-001` (Extended Scope)
**Date:** `2025-08-04` (Updated: `2025-08-04_16-43`)
**Status:** `Extended - Telegraph JSON Generation Investigation Required`

## 1. Problem Description - EXTENDED SCOPE

**Original Issue (✅ RESOLVED):** The system incorrectly parsed Markdown links that contain balanced parentheses in the URL part due to faulty regex in `LinkScanner.ts`.

**NEW DISCOVERY:** While link extraction now works correctly, the **Markdown-to-Telegraph JSON conversion process** still incorrectly generates Telegraph JSON. The closing parenthesis `)` is being stripped from href attributes and appears as separate text nodes.

**Evidence of Remaining Issue:**
```markdown
## [Аналогии](./аналогии.md)
- [1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)](./аналогии.md#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4))
```

**Generates Incorrect Telegraph JSON:**
```json
{
  "tag": "a",
  "attrs": {
    "href": "https://telegra.ph/...#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4"
  },
  "children": ["1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)"]
},
")"
```

**Should Generate:**
```json
{
  "tag": "a",
  "attrs": {
    "href": "https://telegra.ph/...#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)"
  },
  "children": ["1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)"]
}
```

## 2. Root Cause Analysis - UPDATED

**Phase 1 - Link Extraction (✅ RESOLVED):** The original error was in `LinkScanner.extractLinks` method using faulty regex `[^)]*` that stopped at first `)`. This has been fixed.

**Phase 2 - Telegraph JSON Generation (🔍 INVESTIGATION REQUIRED):** The remaining issue is in the Markdown-to-Telegraph JSON conversion pipeline. Potential locations:

1. **`src/markdownConverter.ts`** - Main conversion logic from Markdown to Telegraph JSON
2. **Telegraph link processing** - Additional regex patterns during JSON generation
3. **URL transformation** - Converting relative links to Telegraph URLs may have faulty regex

**Investigation Required:**
- Identify where Telegraph JSON `href` attributes are generated
- Find any additional regex patterns processing Markdown links
- Locate code responsible for URL transformation to Telegraph format
- Check if parentheses are being stripped during URL encoding/processing

## 3. Proposed Solution

Replace the existing regular expression with a more powerful one that can handle balanced parentheses inside the URL.

## 4. Implementation Details

**File to modify:** `src/links/LinkScanner.ts`
**Method to modify:** `extractLinks`

Replace the `linkRegex` constant inside the method.

**Code - Before changes:**
```typescript
// in src/links/LinkScanner.ts -> extractLinks
const linkRegex = /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^)]*)\)/g;
```

**Code - After changes:**
```typescript
// in src/links/LinkScanner.ts -> extractLinks
const linkRegex = /\[([^[\]]*(?:\[[^\]]*\][^[\]]*)*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
```

**Explanation of new Regex:** `\(([^()]*(?:\([^()]*\)[^()]*)*)\)`
- `[^()]*` - finds any characters except parentheses.
- `(?:\([^()]*\)[^()]*)*` - finds balanced pairs of parentheses `(...)` inside the URL and can repeat.

## 5. Acceptance Criteria

1. Markdown string `[Text](./analogies.md#1.-Analogy-«Tree-of-civilization»-(from-comment-to-SB-1.1.4))` should be parsed into one `MarkdownLink` object.
2. `href` of this object should equal `./analogies.md#1.-Analogy-«Tree-of-civilization»-(from-comment-to-SB-1.1.4)`.
3. The resulting `TelegraphNode` JSON **must not** contain a separate text node `")"`.
4. Regular links without parentheses in URL (e.g., `[Text](./file.md)`) should still be parsed correctly (regression check).

## 6. Testing Plan

1. **Update test file** `src/links/LinkScanner.regex-fix.test.ts`.
2. Add test scenarios based on the problematic links:
   ```typescript
   it('should correctly parse links with balanced parentheses in the anchor', () => {
     const markdown = "[Analogy «Tree of civilization» (from comment to SB 1.1.4)](./analogies.md#Analogy-«Tree-of-civilization»-(from-comment-to-SB-1.1.4))";
     const links = LinkScanner.extractLinks(markdown);
     expect(links).toHaveLength(1);
     expect(links[0]?.href).toBe("./analogies.md#Analogy-«Tree-of-civilization»-(from-comment-to-SB-1.1.4)");
   });
   ```
3. Ensure all tests in this file pass after making changes. This will confirm that both old functionality is not broken and the new bug is fixed.