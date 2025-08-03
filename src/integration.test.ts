import { describe, expect, test } from "bun:test";
import { cleanMarkdownString } from "./clean_mr";
import {
	convertMarkdownToTelegraphNodes,
	extractTitleAndContent,
	validateCleanedContent,
} from "./markdownConverter";

// Mock content for end-to-end and integration tests
const mockMarkdownContent = `
# My Test Article

This is some **bold text** and *italic text*.

> This is a blockquote.

## Subheading

- List item 1
- List item 2

\`\`\`typescript
const a = 1;
const b = 2;
\`\`\`

Another paragraph.
`;

describe("Integration Tests", () => {
	test("end-to-end: should extract title, convert markdown, and retain formatting", () => {
		// 1. Extract title and content
		const { title: extractedTitle, content: remainingContent } =
			extractTitleAndContent(mockMarkdownContent);
		expect(extractedTitle).toBe("My Test Article");

		// 2. Clean the extracted title
		const cleanedTitle = cleanMarkdownString(extractedTitle || "");
		expect(cleanedTitle).toBe("My Test Article");

		// 3. Validate remaining content for unwanted HTML tags (should pass as it's pure markdown)
		expect(() => validateCleanedContent(remainingContent)).not.toThrow();

		// 4. Convert remaining content to Telegraph Nodes
		const telegraphNodes = convertMarkdownToTelegraphNodes(remainingContent);

		// 5. Assertions on Telegraph Nodes structure and content
		expect(telegraphNodes).toBeInstanceOf(Array);
		expect(telegraphNodes.length).toBeGreaterThan(0);

		// Check for presence of expected elements based on original markdown formatting
		// Paragraph with bold and italic text
		const firstParagraph = telegraphNodes[0];
		expect(firstParagraph).toEqual({
			tag: "p",
			children: [
				"This is some ",
				{ tag: "strong", children: ["bold text"] },
				" and ",
				{ tag: "em", children: ["italic text"] },
				".",
			],
		});

		// Blockquote
		const blockquote = telegraphNodes[1];
		expect(blockquote).toEqual({
			tag: "blockquote",
			children: ["This is a blockquote."],
		});

		// Subheading (H2) converted to h3 for Telegraph API compatibility
		const subheading = telegraphNodes[2];
		expect(subheading).toEqual({
			tag: "h3",
			children: ["Subheading"],
		});

		// List items
		const ulElement = telegraphNodes[3];
		expect(ulElement).toEqual({
			tag: "ul",
			children: [
				{ tag: "li", children: ["List item 1"] },
				{ tag: "li", children: ["List item 2"] },
			],
		});

		// Code block
		const preElement = telegraphNodes[4];
		expect(preElement).toEqual({
			tag: "pre",
			children: [
				{
					tag: "code",
					children: ["const a = 1;\nconst b = 2;"],
				},
			],
		});

		// Last paragraph
		const lastParagraph = telegraphNodes[5];
		expect(lastParagraph).toEqual({
			tag: "p",
			children: ["Another paragraph."],
		});

		// Ensure no unexpected raw HTML tags are present (validateCleanedContent already checks this)
		const hasUnexpectedRawHtml =
			JSON.stringify(telegraphNodes).includes("<") &&
			!JSON.stringify(telegraphNodes).includes("<blockquote>"); // Basic check for raw HTML tags that shouldn't be there
		expect(hasUnexpectedRawHtml).toBe(false);
	});

	test("end-to-end: should convert tables to nested lists", () => {
		const tableMarkdown = `# Таблица товаров

| Название | Цена | В наличии |
|----------|------|-----------|
| Товар 1  | 100  | Да        |
| Товар 2  | 200  | Нет       |

Конец таблицы.`;

		// 1. Extract title and content
		const { title: extractedTitle, content: remainingContent } =
			extractTitleAndContent(tableMarkdown);
		expect(extractedTitle).toBe("Таблица товаров");

		// 2. Clean the extracted title
		const cleanedTitle = cleanMarkdownString(extractedTitle || "");
		expect(cleanedTitle).toBe("Таблица товаров");

		// 3. Validate remaining content
		expect(() => validateCleanedContent(remainingContent)).not.toThrow();

		// 4. Convert remaining content to Telegraph Nodes
		const telegraphNodes = convertMarkdownToTelegraphNodes(remainingContent);

		// 5. Verify table conversion
		expect(telegraphNodes).toEqual([
			{
				tag: "ol",
				children: [
					{
						tag: "li",
						children: [
							"1",
							{
								tag: "ul",
								children: [
									{ tag: "li", children: ["Название: Товар 1"] },
									{ tag: "li", children: ["Цена: 100"] },
									{ tag: "li", children: ["В наличии: Да"] },
								],
							},
						],
					},
					{
						tag: "li",
						children: [
							"2",
							{
								tag: "ul",
								children: [
									{ tag: "li", children: ["Название: Товар 2"] },
									{ tag: "li", children: ["Цена: 200"] },
									{ tag: "li", children: ["В наличии: Нет"] },
								],
							},
						],
					},
				],
			},
			{
				tag: "p",
				children: ["Конец таблицы."],
			},
		]);
	});
});
