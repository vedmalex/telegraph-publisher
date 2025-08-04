import { expect, test } from "bun:test";
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";

// Fix for issue: numbered headings should be parsed as headings, not list items
test("should correctly parse numbered headings as h3 tags instead of list items", () => {
  const markdown = "## 1. My Numbered Heading";
  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["1. My Numbered Heading"] }
  ]);

  // Ensure it's NOT parsed as a list
  expect(result).not.toEqual([
    {
      tag: "ol",
      children: [
        { tag: "li", children: ["My Numbered Heading"] }
      ]
    }
  ]);
});

test("should correctly parse multiple numbered headings with different levels", () => {
  const markdown = "## 1. First Section\n### 2. Subsection\n#### 3. Sub-subsection";
  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["1. First Section"] },
    { tag: "h3", children: ["2. Subsection"] },
    { tag: "h4", children: ["3. Sub-subsection"] }
  ]);
});

test("should parse numbered headings while preserving normal list functionality", () => {
  const markdown = "## 1. Heading\n\n1. First item\n2. Second item";
  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["1. Heading"] },
    {
      tag: "ol",
      children: [
        { tag: "li", children: ["First item"] },
        { tag: "li", children: ["Second item"] }
      ]
    }
  ]);
});

test("should correctly parse the specific user example: ## 1. Знакомство с участниками", () => {
  const markdown = "## 1. Знакомство с участниками";
  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["1. Знакомство с участниками"] }
  ]);

  // Explicitly ensure it's NOT parsed as ordered list
  expect(result[0]?.tag).not.toBe("ol");
  expect(result).not.toEqual([
    {
      tag: "ol",
      children: [
        { tag: "li", children: ["Знакомство с участниками"] }
      ]
    }
  ]);
});

test("should parse numbered headings with various formats", () => {
  const markdown = "# 10. Heading level 1\n## 2.5 Heading level 2\n### 100. Complex numbered heading";
  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["10. Heading level 1"] },
    { tag: "h3", children: ["2.5 Heading level 2"] },
    { tag: "h3", children: ["100. Complex numbered heading"] }
  ]);
});

test("should parse mixed content with numbered headings and lists", () => {
  const markdown = `## 1. Introduction

This is a paragraph.

### 2. Topics

Here's a list:
- First topic
- Second topic

#### 3. Conclusion

More numbered content:
1. Summary point
2. Final thoughts`;

  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["1. Introduction"] },
    { tag: "p", children: ["This is a paragraph."] },
    { tag: "h3", children: ["2. Topics"] },
    { tag: "p", children: ["Here's a list:"] },
    {
      tag: "ul",
      children: [
        { tag: "li", children: ["First topic"] },
        { tag: "li", children: ["Second topic"] }
      ]
    },
    { tag: "h4", children: ["3. Conclusion"] },
    { tag: "p", children: ["More numbered content:"] },
    {
      tag: "ol",
      children: [
        { tag: "li", children: ["Summary point"] },
        { tag: "li", children: ["Final thoughts"] }
      ]
    }
  ]);
});

test("should parse headings starting with numbers but not numbered format", () => {
  const markdown = "## 123abc Not a numbered heading\n## 1st Position heading";
  const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

  expect(result).toEqual([
    { tag: "h3", children: ["123abc Not a numbered heading"] },
    { tag: "h3", children: ["1st Position heading"] }
  ]);
});

test("should ensure numbered headings take precedence over list parsing", () => {
  // This is the core test to ensure the fix works
  const testCases = [
    "# 1. Level 1 heading",
    "## 2. Level 2 heading",
    "### 3. Level 3 heading",
    "#### 4. Level 4 heading",
    "##### 5. Level 5 heading",
    "###### 6. Level 6 heading"
  ];

  testCases.forEach((markdown, index) => {
    const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

    // All should be parsed as headings, not lists
    expect(result).toHaveLength(1);
    expect(result[0]?.tag).not.toBe("ol");
    expect(result[0]?.tag).not.toBe("ul");

    // Should contain the full text including the number
    const expectedText = `${index + 1}. Level ${index + 1} heading`;
    if (result[0]?.children && typeof result[0].children[0] === 'string') {
      expect(result[0].children[0]).toContain(expectedText);
    } else if (Array.isArray(result[0]?.children)) {
      // Handle cases where children might be processed as inline markdown
      const textContent = extractTextContent(result[0].children);
      expect(textContent).toContain(expectedText);
    }
  });
});

// Helper function to extract text content from potentially nested children
function extractTextContent(children: any[]): string {
  return children.map(child => {
    if (typeof child === 'string') {
      return child;
    } else if (child && child.children) {
      return extractTextContent(child.children);
    }
    return '';
  }).join('');
}