import { expect, test } from "bun:test";
import { cleanMarkdownString } from "./clean_mr";
import {
	convertMarkdownToTelegraphNodes,
	extractTitleAndContent,
	validateCleanedContent,
} from "./markdownConverter";

test("should convert simple paragraph to Telegraph node", () => {
	const markdown = "Hello, World!";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([{ tag: "p", children: ["Hello, World!"] }]);
});

test("should convert headings to Telegraph API compatible nodes", () => {
	const markdown = "# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{ tag: "h3", children: ["Heading 1"] }, // H1 → h3
		{ tag: "h3", children: ["Heading 2"] }, // H2 → h3
		{ tag: "h3", children: ["Heading 3"] }, // H3 → h3
		{ tag: "h4", children: ["Heading 4"] }, // H4 → h4
	]);
});

test("should convert bold text to strong nodes", () => {
	const markdown = "This is **bold** text and __also bold__.";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "p",
			children: [
				"This is ",
				{ tag: "strong", children: ["bold"] },
				" text and ",
				{ tag: "strong", children: ["also bold"] },
				".",
			],
		},
	]);
});

test("should convert italic text to em nodes", () => {
	const markdown = "This is *italic* text and _also italic_.";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "p",
			children: [
				"This is ",
				{ tag: "em", children: ["italic"] },
				" text and ",
				{ tag: "em", children: ["also italic"] },
				".",
			],
		},
	]);
});

test("should convert blockquotes to blockquote nodes", () => {
	const markdown =
		"> This is a blockquote\n> with multiple lines\n\nAnother paragraph after quote.";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "blockquote",
			children: ["This is a blockquote\nwith multiple lines"],
		},
		{ tag: "p", children: ["Another paragraph after quote."] },
	]);
});

test("should convert unordered lists to ul nodes", () => {
	const markdown = "- List item 1\n* List item 2";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "ul",
			children: [
				{ tag: "li", children: ["List item 1"] },
				{ tag: "li", children: ["List item 2"] },
			],
		},
	]);
});

test("should convert ordered lists to ol nodes", () => {
	const markdown = "1. First item\n2. Second item";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "ol",
			children: [
				{ tag: "li", children: ["First item"] },
				{ tag: "li", children: ["Second item"] },
			],
		},
	]);
});

test("should convert inline code to code nodes", () => {
	const markdown = "This is `inline code` in text.";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "p",
			children: [
				"This is ",
				{ tag: "code", children: ["inline code"] },
				" in text.",
			],
		},
	]);
});

test("should convert links to anchor nodes", () => {
	const markdown = "Visit [Google](https://google.com) for search.";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
		{
			tag: "p",
			children: [
				"Visit ",
				{
					tag: "a",
					attrs: { href: "https://google.com" },
					children: ["Google"],
				},
				" for search.",
			],
		},
	]);
});

test("should handle complex nested markdown", () => {
	const markdown =
		"## **Bold Heading**\n\nThis is a paragraph with **bold** and *italic* text.\n\n- List item with `code`\n- Another item";
	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result.length).toBe(3);
	expect(result[0]?.tag).toBe("h3"); // H2 → h3 for Telegraph API compatibility
	expect(result[1]?.tag).toBe("p");
	expect(result[2]?.tag).toBe("ul");
});

test("extractTitleAndContent: should extract H1 title and remaining content", () => {
	const markdown = "# My Title\n\nContent goes here.";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBe("My Title");
	expect(content).toBe("\nContent goes here.");
});

test("extractTitleAndContent: should extract H2 title and remaining content", () => {
	const markdown = "## My Subtitle\nContent.";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBe("My Subtitle");
	expect(content).toBe("Content.");
});

test("extractTitleAndContent: should return null title if no heading is found as first non-empty line", () => {
	const markdown = "Just plain text.\nAnother line.";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBeNull();
	expect(content).toBe("Just plain text.\nAnother line.");
});

test("extractTitleAndContent: should handle leading empty lines before heading", () => {
	const markdown = "\n\n# Title\nContent";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBe("Title");
	expect(content).toBe("Content");
});

test("extractTitleAndContent: should handle leading empty lines before non-heading content", () => {
	const markdown = "\n\nPlain text.";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBeNull();
	expect(content).toBe("Plain text.");
});

test("extractTitleAndContent: should handle empty markdown string", () => {
	const markdown = "";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBeNull();
	expect(content).toBe("");
});

test("extractTitleAndContent: should remove leading empty lines from content after title extraction", () => {
	const markdown = "# Title\n\n\nContent";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBe("Title");
	expect(content).toBe("\n\nContent");
});

test("extractTitleAndContent: should extract title with inline formatting and remove it from content", () => {
	const markdown = "# My **Bold** *Title*\nContent.";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBe("My **Bold** *Title*");
	expect(content).toBe("Content.");
});

test("extractTitleAndContent: should extract bold/italic line as title if no heading is found", () => {
	const markdown = "**This is a Bold Title**\nContent here.\n";
	const { title, content } = extractTitleAndContent(markdown);
	expect(title).toBe("This is a Bold Title");
	expect(content).toBe("Content here.\n");

	const markdown2 = "*This is an Italic Title*\nContent here.\n";
	const { title: title2, content: content2 } =
		extractTitleAndContent(markdown2);
	expect(title2).toBe("This is an Italic Title");
	expect(content2).toBe("Content here.\n");

	const markdown3 = "__Another Bold Title__\nContent here.";
	const { title: title3, content: content3 } =
		extractTitleAndContent(markdown3);
	expect(title3).toBe("Another Bold Title");
	expect(content3).toBe("Content here.");

	const markdown4 = "_Another Italic Title_\nContent here.";
	const { title: title4, content: content4 } =
		extractTitleAndContent(markdown4);
	expect(title4).toBe("Another Italic Title");
	expect(content4).toBe("Content here.");
});

test("cleanMarkdownString: should remove only heading and inline markdown formatting from a title string", () => {
	const titleString =
		"# My **Bold** *Title* `with code` [and link](http://example.com).";
	const expectedCleanTitle = "My Bold Title with code and link.";
	const cleanedTitle = cleanMarkdownString(titleString);
	expect(cleanedTitle).toBe(expectedCleanTitle);
});

test("cleanMarkdownString: should handle a title string with no markdown", () => {
	const titleString = "A Plain Title";
	const expectedCleanTitle = "A Plain Title";
	const cleanedTitle = cleanMarkdownString(titleString);
	expect(cleanedTitle).toBe(expectedCleanTitle);
});

test("cleanMarkdownString: should handle an empty title string", () => {
	const titleString = "";
	const expectedCleanTitle = "";
	const cleanedTitle = cleanMarkdownString(titleString);
	expect(cleanedTitle).toBe(expectedCleanTitle);
});

test("validateCleanedContent: should pass for content without HTML tags", () => {
	const content =
		"This is plain Markdown content with **bold** text and - list items.";
	expect(() => validateCleanedContent(content)).not.toThrow();
});

test("validateCleanedContent: should throw error for content with HTML tags", () => {
	const content = "This text contains <p>HTML</p> tags.";
	expect(() => validateCleanedContent(content)).toThrow(
		"Content contains unsupported HTML tags. Only Markdown formatting is allowed.",
	);
});

test("validateCleanedContent: should throw error for content with incomplete HTML tags", () => {
	const content = "This text contains <p>incomplete HTML tags.";
	expect(() => validateCleanedContent(content)).toThrow(
		"Content contains unsupported HTML tags. Only Markdown formatting is allowed.",
	);
});

test("validateCleanedContent: should pass for content with angle brackets that are not HTML tags", () => {
	const content = "This text has < and > symbols but no HTML.";
	expect(() => validateCleanedContent(content)).not.toThrow();
});

test("should convert tables to nested lists", () => {
	const markdown = `| Название | Значение | Описание |
|----------|----------|----------|
| Первый   | 100      | Тест 1   |
| Второй   | 200      | Тест 2   |
| Третий   | 300      | Тест 3   |`;

	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
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
								{ tag: "li", children: ["Название: Первый"] },
								{ tag: "li", children: ["Значение: 100"] },
								{ tag: "li", children: ["Описание: Тест 1"] },
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
								{ tag: "li", children: ["Название: Второй"] },
								{ tag: "li", children: ["Значение: 200"] },
								{ tag: "li", children: ["Описание: Тест 2"] },
							],
						},
					],
				},
				{
					tag: "li",
					children: [
						"3",
						{
							tag: "ul",
							children: [
								{ tag: "li", children: ["Название: Третий"] },
								{ tag: "li", children: ["Значение: 300"] },
								{ tag: "li", children: ["Описание: Тест 3"] },
							],
						},
					],
				},
			],
		},
	]);
});

test("should handle table with empty cells", () => {
	const markdown = `| Колонка 1 | Колонка 2 |
|-----------|-----------|
| Значение  |           |
|           | Другое    |`;

	const result = convertMarkdownToTelegraphNodes(markdown);

	expect(result).toEqual([
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
								{ tag: "li", children: ["Колонка 1: Значение"] },
								{ tag: "li", children: ["Колонка 2: "] },
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
								{ tag: "li", children: ["Колонка 1: "] },
								{ tag: "li", children: ["Колонка 2: Другое"] },
							],
						},
					],
				},
			],
		},
	]);
});
