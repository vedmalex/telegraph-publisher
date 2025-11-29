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
	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	expect(result).toEqual([
		// ToC should be generated first (4 headings = 2+ requirement met)
		{
			tag: "ul",
			children: [
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#Heading-1" }, children: ["Heading 1"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#Heading-2" }, children: ["Heading 2"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#Heading-3" }, children: ["Heading 3"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#Heading-4" }, children: ["Heading 4"] }] }
			]
		},
		{ tag: "h3", attrs: { id: "Heading-1" }, children: ["Heading 1"] }, // H1 → h3
		{ tag: "h3", attrs: { id: "Heading-2" }, children: ["Heading 2"] }, // H2 → h3
		{ tag: "h3", attrs: { id: "Heading-3" }, children: ["Heading 3"] }, // H3 → h3
		{ tag: "h4", attrs: { id: "Heading-4" }, children: ["Heading 4"] }, // H4 → h4
	]);
});

test("should convert H5/H6 headings to h4 with visual prefixes for anchor support", () => {
	const markdown = "##### Heading 5\n###### Heading 6";
	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	expect(result).toEqual([
		// ToC should be generated first (2 headings = 2+ requirement met)
		{
			tag: "ul",
			children: [
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>-Heading-5" }, children: ["> Heading 5"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>-Heading-6" }, children: [">> Heading 6"] }] }
			]
		},
		{ tag: "h4", attrs: { id: ">-Heading-5" }, children: ["> Heading 5"] }, // H5 → h4 with > prefix
		{ tag: "h4", attrs: { id: ">>-Heading-6" }, children: [">> Heading 6"] }, // H6 → h4 with >> prefix
	]);
});

test("should handle all heading levels comprehensively", () => {
	const markdown = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n####### H7+";
	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	expect(result).toEqual([
		// ToC should be generated first (7 headings = 2+ requirement met)
		{
			tag: "ul",
			children: [
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#H1" }, children: ["H1"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#H2" }, children: ["H2"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#H3" }, children: ["H3"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#H4" }, children: ["H4"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>-H5" }, children: ["> H5"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>-H6" }, children: [">> H6"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>>-H7+" }, children: [">>> H7+"] }] }
			]
		},
		{ tag: "h3", attrs: { id: "H1" }, children: ["H1"] },
		{ tag: "h3", attrs: { id: "H2" }, children: ["H2"] },
		{ tag: "h3", attrs: { id: "H3" }, children: ["H3"] },
		{ tag: "h4", attrs: { id: "H4" }, children: ["H4"] },
		{ tag: "h4", attrs: { id: ">-H5" }, children: ["> H5"] },
		{ tag: "h4", attrs: { id: ">>-H6" }, children: [">> H6"] },
		{ tag: "h4", attrs: { id: ">>>-H7+" }, children: [">>> H7+"] }, // Edge case: H7+ → h4 with >>> prefix
	]);
});

test("should preserve inline formatting in H5/H6 with prefixes", () => {
	const markdown = "##### **Bold** H5 with *italic*\n###### Link [text](url) in H6";
	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	expect(result).toEqual([
		// ToC should be generated first (2 headings = 2+ requirement met)
		// Note: ToC uses processInlineMarkdown for children to render formatting
		{
			tag: "ul",
			children: [
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>-Bold-H5-with-italic" }, children: ["> ", { tag: "strong", children: ["Bold"] }, " H5 with ", { tag: "em", children: ["italic"] }] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>-Link-text-in-H6" }, children: [">> Link ", { tag: "a", attrs: { href: "url" }, children: ["text"] }, " in H6"] }] }
			]
		},
		{
			tag: "h4",
			attrs: { id: ">-Bold-H5-with-italic" },
			children: [
				"> ",
				{ tag: "strong", children: ["Bold"] },
				" H5 with ",
				{ tag: "em", children: ["italic"] }
			]
		},
		{
			tag: "h4",
			attrs: { id: ">>-Link-text-in-H6" },
			children: [
				">> Link ",
				{ tag: "a", attrs: { href: "url" }, children: ["text"] },
				" in H6"
			]
		}
	]);
});

test("should generate proper anchors for H5/H6 headings - integration test", () => {
	// This test verifies that H5/H6 headings with prefixes generate correct anchors
	// using the updated generateSlug function from LinkVerifier
	
	const markdown = `# Regular Heading
##### Important Section
###### Sub Important Section
##### Мой раздел
###### Section with @#$% Special Characters!`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	// Should include ToC as first element since there are 5 headings (2+ requirement met)
	expect(result).toEqual([
		// ToC ul element should be first
		{
			tag: "ul",
			children: [
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#Regular-Heading" }, children: ["Regular Heading"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>-Important-Section" }, children: ["> Important Section"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>-Sub-Important-Section" }, children: [">> Sub Important Section"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>-Мой-раздел" }, children: ["> Мой раздел"] }] },
				{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>-Section-with-@#$%-Special-Characters!" }, children: [">> Section with @#$% Special Characters!"] }] }
			]
		},
		// Then the actual headings
		{ tag: "h3", attrs: { id: "Regular-Heading" }, children: ["Regular Heading"] }, // Should generate anchor: "Regular-Heading"
		{ tag: "h4", attrs: { id: ">-Important-Section" }, children: ["> Important Section"] }, // Should generate anchor: ">-Important-Section"
		{ tag: "h4", attrs: { id: ">>-Sub-Important-Section" }, children: [">> Sub Important Section"] }, // Should generate anchor: ">>-Sub-Important-Section"
		{ tag: "h4", attrs: { id: ">-Мой-раздел" }, children: ["> Мой раздел"] }, // Should generate anchor: ">-Мой-раздел"
		{ tag: "h4", attrs: { id: ">>-Section-with-@#$%-Special-Characters!" }, children: [">> Section with @#$% Special Characters!"] }, // Should generate anchor: ">>-Section-with-@#$%-Special-Characters!"
	]);
});

test("should generate Table of Contents for documents with 2+ headings", () => {
	const markdown = `# Main Title
## Section One
### Subsection
#### Details`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	// First element should be ToC ul
	expect(result[0]).toEqual({
		tag: "ul",
		children: [
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Main-Title" }, children: ["Main Title"] }] },
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Section-One" }, children: ["Section One"] }] },
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Subsection" }, children: ["Subsection"] }] },
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Details" }, children: ["Details"] }] }
		]
	});

	// Should have 5 total elements: 1 ToC + 4 headings
	expect(result).toHaveLength(5);
});

test("should NOT generate ToC for documents with fewer than 2 headings", () => {
	const markdownOne = `# Single Heading
Some content here.`;

	const markdownNone = `Just regular content.
No headings at all.`;

	const resultOne = convertMarkdownToTelegraphNodes(markdownOne);
	const resultNone = convertMarkdownToTelegraphNodes(markdownNone);

	// Should not include ToC (no aside element) and should treat
	// consecutive non-empty lines as a single paragraph block.
	expect(resultOne).toEqual([
		{ tag: "h3", attrs: { id: "Single-Heading" }, children: ["Single Heading"] },
		{ tag: "p", children: ["Some content here."] }
	]);

	expect(resultNone).toEqual([
		{ tag: "p", children: ["Just regular content.\nNo headings at all."] }
	]);
});

test("should handle ToC with H5/H6 prefixed headings correctly", () => {
	const markdown = `## Introduction
##### Important Note
###### Warning`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	// Should generate ToC with prefixed headings
	expect(result[0]).toEqual({
		tag: "ul",
		children: [
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Introduction" }, children: ["Introduction"] }] },
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#>-Important-Note" }, children: ["> Important Note"] }] },
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#>>-Warning" }, children: [">> Warning"] }] }
		]
	});
});

test("should handle ToC with Unicode and special characters", () => {
	const markdown = `# Тест заголовок
## Special @#$% Characters!`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: true, tocSeparators: false });

	// Should preserve Unicode and special characters in ToC anchors
	expect(result[0]).toEqual({
		tag: "ul",
		children: [
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Тест-заголовок" }, children: ["Тест заголовок"] }] },
			{ tag: "li", children: [{ tag: "a", attrs: { href: "#Special-@#$%-Characters!" }, children: ["Special @#$% Characters!"] }] }
		]
	});
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

test("should not treat inline numeric references as list items", () => {
	const markdown = `Если кто-то не может следовать всем 16, то рекомендуется соблюдать по крайней мере 10. Они следующие:

1. First item
2. Second item`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

	expect(result[0]).toMatchObject({
		tag: "p",
	});
	const list = result[1];
	expect(list.tag).toBe("ol");
	const firstLi = (list as any).children?.[0];
	expect(firstLi.children?.[0]).toBe("First item");
});

test("should keep list intro paragraph before ordered list", () => {
	const markdown = `Intro sentence with intro text.

1. First
2. Second`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

	expect(result[0]).toMatchObject({ tag: "p" });
	expect((result[0] as any).children?.join("")).toContain("Intro sentence");
	expect(result[1]).toMatchObject({ tag: "ol" });
});

test("should parse horizontal rules with dashes or asterisks (with padding spaces)", () => {
	const markdown = `Line 1
---
Line 2
  ***   
Line 3`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

	expect(result).toMatchObject([
		{ tag: "p", children: ["Line 1"] },
		{ tag: "hr" },
		{ tag: "p", children: ["Line 2"] },
		{ tag: "hr" },
		{ tag: "p", children: ["Line 3"] },
	]);
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
								{ tag: "li", children: ["Название", ": ", "Первый"] },
								{ tag: "li", children: ["Значение", ": ", "100"] },
								{ tag: "li", children: ["Описание", ": ", "Тест 1"] },
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
								{ tag: "li", children: ["Название", ": ", "Второй"] },
								{ tag: "li", children: ["Значение", ": ", "200"] },
								{ tag: "li", children: ["Описание", ": ", "Тест 2"] },
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
								{ tag: "li", children: ["Название", ": ", "Третий"] },
								{ tag: "li", children: ["Значение", ": ", "300"] },
								{ tag: "li", children: ["Описание", ": ", "Тест 3"] },
							],
						},
					],
				},
			],
		},
	]);
});

test("should convert tables to HTML table nodes in EPUB mode", () => {
	const markdown = `| Name | Value |
|------|-------|
| One  | 1     |
| Two  | 2     |`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false, target: "epub" });

	// Expect a single table node
	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({
		tag: "table",
	});
});

test("should preserve tables with links and formatting in EPUB mode", () => {
	const markdown = `#### Цены и ссылки:
| Магазин | Цена | Ссылка |
|---------|------|--------|
| **Wildberries** | 318-390 ₽ | [https://www.wildberries.ru/catalog/tags/robin-green-dlja-roz](https://www.wildberries.ru/catalog/tags/robin-green-dlja-roz) |
| **OZON** | ~400 ₽ | [https://www.ozon.ru/category/udobreniya-dlya-roz/](https://www.ozon.ru/category/udobreniya-dlya-roz/) |`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false, target: "epub" });

	expect(result[0]).toMatchObject({ tag: "h4" });
	const tableNode = result[1] as any;
	expect(tableNode.tag).toBe("table");

	const tbody = (tableNode.children || []).find(
		(child: any) => child && typeof child === "object" && child.tag === "tbody",
	);
	expect(tbody).toBeDefined();

	const firstRow = (tbody!.children || [])[0] as any;
	expect(firstRow.tag).toBe("tr");

	const linkCell = (firstRow.children || [])[2] as any;
	const linkNode = (linkCell.children || []).find(
		(child: any) => child && typeof child === "object" && child.tag === "a",
	);
	expect(linkNode).toBeDefined();
	expect(linkNode!.attrs?.href).toBe("https://www.wildberries.ru/catalog/tags/robin-green-dlja-roz");
	expect(linkNode!.children).toContain("https://www.wildberries.ru/catalog/tags/robin-green-dlja-roz");
});

test("should keep links/bold inside table cells in telegraph mode (legacy ol/ul tables)", () => {
	const markdown = `| Магазин | Цена | Ссылка |
|---------|------|--------|
| **Wildberries** | 1 509 ₽ | [https://www.wildberries.ru/catalog/176621754/detail.aspx](https://www.wildberries.ru/catalog/176621754/detail.aspx) |
| **OZON** | 1 191 ₽ | [https://www.ozon.ru/product/udobrenie-dlya-roz-1l-npk-7-6-7-asb-greenworld-germaniya-1083142943/](https://www.ozon.ru/product/udobrenie-dlya-roz-1l-npk-7-6-7-asb-greenworld-germaniya-1083142943/) |`;

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

	expect(result[0]).toMatchObject({ tag: "ol" });

	const firstRow = (result[0] as any).children[0];
	const nestedItems = firstRow.children[1].children;

	const shopItem = nestedItems[0];
	expect(shopItem.children.some((child: any) => child?.tag === "strong")).toBeTruthy();

	const linkItem = nestedItems[2];
	expect(linkItem.children.some((child: any) => child?.tag === "a")).toBeTruthy();
});

test("should convert images to img nodes with src and alt", () => {
	const markdown = "Intro text ![Alt text](https://example.com/image.png) end.";

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

	expect(result).toHaveLength(1);
	const node = result[0];
	expect(node.tag).toBe("p");

	const imgNode = (node.children || []).find(
		(child) => typeof child === "object" && child && (child as any).tag === "img",
	) as TelegraphNode | undefined;

	expect(imgNode).toBeDefined();
	expect(imgNode?.attrs?.src).toBe("https://example.com/image.png");
	expect(imgNode?.attrs?.alt).toBe("Alt text");
});

test("should merge multiple lines into a single paragraph block with preserved newlines", () => {
	const markdown = [
		"Давным-давно там, под сводами лиан, корова Сурабхи поклонялась Господу",
		"Гаурасундаре, Верховной Личности Бога. Теперь, спустя много лет, рядом",
		"находится бхаджана-кутир, именуемый Прадьюмна-кунджа. В этом укрытом",
		"вьющимися растениями бхаджана-кутире, постоянно пребывая в блаженстве",
		"поклонения Господу (то есть в бхаджанананде), обитал",
		"бабаджи-парамахамса, посвященный в ученики Прадьюмной Брахмачари, вечным",
		"спутником Верховного Господа.",
	].join("\n");

	const result = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });

	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({
		tag: "p",
	});

	const paragraphNode = result[0];
	expect(paragraphNode && typeof paragraphNode === "object" && paragraphNode.children).toBeDefined();
	const textContent = (paragraphNode!.children || [])
		.map((child) => (typeof child === "string" ? child : ""))
		.join("");

	expect(textContent).toBe(markdown);
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
								{ tag: "li", children: ["Колонка 1", ": ", "Значение"] },
								{ tag: "li", children: ["Колонка 2", ": ", ""] },
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
								{ tag: "li", children: ["Колонка 1", ": ", ""] },
								{ tag: "li", children: ["Колонка 2", ": ", "Другое"] },
							],
						},
					],
				},
			],
		},
	]);
});
