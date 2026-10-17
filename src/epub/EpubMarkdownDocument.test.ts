import { describe, expect, test } from "bun:test";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";

describe("EpubMarkdownDocument", () => {
	describe("Defect D2: Fenced code block handling", () => {
		test("fenced code with 4 backticks containing 3 backticks does not create false headings or outline entries", () => {
			const source = `## Real Heading 1

\`\`\`\`markdown
\`\`\`
## False Inside Heading
\`\`\`
\`\`\`\`

## Real Heading 2
`;
			const parsed = parseEpubMarkdown(source, "test.md");

			// Outline must ONLY contain the two real headings
			expect(parsed.outline).toHaveLength(2);
			expect(parsed.outline[0]!.label).toBe("Real Heading 1");
			expect(parsed.outline[1]!.label).toBe("Real Heading 2");

			// Verify atomic units
			const headingUnits = parsed.units.filter((u) => u.kind === "heading");
			expect(headingUnits).toHaveLength(2);
			expect(headingUnits[0]!.heading?.text).toBe("Real Heading 1");
			expect(headingUnits[1]!.heading?.text).toBe("Real Heading 2");

			const codeUnits = parsed.units.filter((u) => u.kind === "code");
			expect(codeUnits).toHaveLength(1);
			const codePayload = parsed.payloadStore.get(codeUnits[0]!.payloadRef);
			expect(codePayload).toBeDefined();
			expect(codePayload?.tokens[0]?.type).toBe("code");
		});

		test("fenced code with tildes does not break on backticks or inside headings", () => {
			const source = `## Heading Before

~~~~
\`\`\`
### Inside Tilde Block
\`\`\`
~~~~

## Heading After
`;
			const parsed = parseEpubMarkdown(source, "test.md");
			expect(parsed.outline).toHaveLength(2);
			expect(parsed.outline[0]!.label).toBe("Heading Before");
			expect(parsed.outline[1]!.label).toBe("Heading After");
		});
	});

	describe("Shlokas and Verses Atomicity", () => {
		test("shlokas with single and double daṇḍas (| and ||) remain a single indivisible paragraph unit", () => {
			const source = `nama oṁ viṣṇu-pādāya kṛṣṇa-preṣṭhāya bhū-tale |
śrīmate bhaktivedānta-svāmin iti nāmine || 1 ||
namas te sārasvate deve gaura-vāṇī-pracāriṇe |
nirviśeṣa-śūnyavādi-pāścātya-deśa-tāriṇe || 2 ||`;

			const parsed = parseEpubMarkdown(source, "shloka.md");
			expect(parsed.units).toHaveLength(1);
			expect(parsed.units[0]!.kind).toBe("paragraph");
			expect(parsed.units[0]!.id).toBe("s1-u1");
		});

		test("Sanskrit pipe lines are not misinterpreted as tables", () => {
			const source = `*śrī kṛṣṇa* |
*hare rāma* ||

| --- | --- |`;

			const parsed = parseEpubMarkdown(source, "verse.md");
			const tableUnits = parsed.units.filter((u) => u.kind === "table");
			expect(tableUnits).toHaveLength(0);
			expect(parsed.units.filter((u) => u.kind === "paragraph")).toHaveLength(
				2,
			);
		});
	});

	describe("Tables Atomicity", () => {
		test("GFM table remains a single indivisible table unit", () => {
			const source = `# Chapter With Table

| Column 1 | Column 2 |
| :------- | :------: |
| Value A  | Value B  |
| Value C  | Value D  |

Paragraph after table.`;

			const parsed = parseEpubMarkdown(source, "table.md");
			expect(parsed.units).toHaveLength(3);
			expect(parsed.units[0]!.kind).toBe("heading");
			expect(parsed.units[1]!.kind).toBe("table");
			expect(parsed.units[2]!.kind).toBe("paragraph");
		});
	});

	describe("Lists and Blockquotes Atomicity", () => {
		test("entire nested list with sub-items is a single atomic unit", () => {
			const source = `- Item 1
  - Subitem 1.1
  - Subitem 1.2
- Item 2
  1. Ordered sub 1
  2. Ordered sub 2`;

			const parsed = parseEpubMarkdown(source, "list.md");
			expect(parsed.units).toHaveLength(1);
			expect(parsed.units[0]!.kind).toBe("list");
		});

		test("blockquote is a single atomic unit", () => {
			const source = `> Line 1 of quote
> Line 2 of quote
> > Nested quote line`;

			const parsed = parseEpubMarkdown(source, "quote.md");
			expect(parsed.units).toHaveLength(1);
			expect(parsed.units[0]!.kind).toBe("blockquote");
		});
	});

	describe("Headings with level > 6 and custom IDs", () => {
		test("supports headings up to depth 10 while preserving semantic level", () => {
			const source = `###### Heading 6
####### Heading 7
######## Heading 8
########## Heading 10`;

			const parsed = parseEpubMarkdown(source, "headings.md");
			expect(parsed.units).toHaveLength(4);
			expect(parsed.units[0]!.heading?.level).toBe(6);
			expect(parsed.units[1]!.heading?.level).toBe(7);
			expect(parsed.units[2]!.heading?.level).toBe(8);
			expect(parsed.units[3]!.heading?.level).toBe(10);
		});

		test("supports explicit {#custom-id} heading anchors", () => {
			const source = `## Section Title {#my-explicit-anchor}`;

			const parsed = parseEpubMarkdown(source, "custom-id.md");
			expect(parsed.units[0]!.heading?.text).toBe("Section Title");
			const anchor = parsed.anchors.find((a) => a.id === "my-explicit-anchor");
			expect(anchor).toBeDefined();
			expect(anchor?.kind).toBe("explicit");
			expect(parsed.outline[0]!.id).toBe("my-explicit-anchor");
		});

		test("duplicate headings in same source receive -2, -3 suffixes", () => {
			const source = `## Введение
## Введение
## Введение`;

			const parsed = parseEpubMarkdown(source, "duplicates.md");
			expect(parsed.anchors).toHaveLength(3);
			expect(parsed.anchors[0]!.id).toBe("Vvedenie");
			expect(parsed.anchors[1]!.id).toBe("Vvedenie-2");
			expect(parsed.anchors[2]!.id).toBe("Vvedenie-3");
		});
	});

	describe("Outline Tree Generation", () => {
		test("builds correct hierarchical tree without creating artificial levels", () => {
			const source = `# Level 1
## Level 2A
### Level 3A
## Level 2B
# Level 1B`;

			const parsed = parseEpubMarkdown(source, "outline.md");
			expect(parsed.outline).toHaveLength(2); // Two H1 roots

			const h1A = parsed.outline[0]!;
			expect(h1A.label).toBe("Level 1");
			expect(h1A.children).toHaveLength(2); // Level 2A and Level 2B

			const h2A = h1A.children[0]!;
			expect(h2A.label).toBe("Level 2A");
			expect(h2A.children).toHaveLength(1); // Level 3A

			const h2B = h1A.children[1]!;
			expect(h2B.label).toBe("Level 2B");
			expect(h2B.children).toHaveLength(0);

			const h1B = parsed.outline[1]!;
			expect(h1B.label).toBe("Level 1B");
		});
	});

	describe("Page markers and breaks", () => {
		test("parses <!-- Page N --> as page targets when pageBreaks is enabled", () => {
			const source = `# Chapter 1
<!-- Page 42 -->
Content on page 42.
<!-- Page 43 -->
Content on page 43.`;

			const parsed = parseEpubMarkdown(source, "pages.md", {
				pageBreaks: true,
			});
			expect(parsed.pages).toHaveLength(2);
			expect(parsed.pages[0]!.pageNumber).toBe(42);
			expect(parsed.pages[0]!.id).toBe("page-42");
			expect(parsed.pages[1]!.pageNumber).toBe(43);
			expect(parsed.pages[1]!.id).toBe("page-43");

			const pageAnchors = parsed.anchors.filter((a) => a.kind === "page");
			expect(pageAnchors).toHaveLength(2);
		});

		test("ignores page markers when pageBreaks is false", () => {
			const source = `<!-- Page 42 -->
Content`;

			const parsed = parseEpubMarkdown(source, "pages.md", {
				pageBreaks: false,
			});
			expect(parsed.pages).toHaveLength(0);
		});
	});

	describe("Reference definitions and symbol tracking", () => {
		test("collects reference definitions into definitions map", () => {
			const source = `[ref1]: https://example.com/one "Title 1"
[ref2]: https://example.com/two

Paragraph with [ref1] and [ref2].`;

			const parsed = parseEpubMarkdown(source, "refs.md");
			expect(parsed.definitions.has("ref1")).toBe(true);
			expect(parsed.definitions.get("ref1")?.href).toBe(
				"https://example.com/one",
			);
			expect(parsed.definitions.get("ref1")?.title).toBe("Title 1");
			expect(parsed.definitions.has("ref2")).toBe(true);

			// Def tokens are not atomic units
			expect(parsed.units).toHaveLength(1);
			expect(parsed.units[0]!.kind).toBe("paragraph");
		});

		test("extracts links and images into symbols", () => {
			const source = `Paragraph with [link](https://example.com) and ![alt text](images/pic.png "Pic Title").`;

			const parsed = parseEpubMarkdown(source, "symbols.md");
			expect(parsed.links).toHaveLength(1);
			expect(parsed.links[0]!.rawHref).toBe("https://example.com");
			expect(parsed.images).toHaveLength(1);
			expect(parsed.images[0]!.rawSrc).toBe("images/pic.png");
			expect(parsed.images[0]!.altText).toBe("alt text");
			expect(parsed.images[0]!.title).toBe("Pic Title");
		});
	});

	describe("Source Range and KeepWithNext", () => {
		test("calculates byte and line ranges accurately", () => {
			const source = `# Heading

Paragraph text.`;

			const parsed = parseEpubMarkdown(source, "ranges.md");
			expect(parsed.units).toHaveLength(2);
			expect(parsed.units[0]!.range.startLine).toBe(1);
			expect(parsed.units[1]!.range.startLine).toBe(3);
			expect(parsed.coverage.coveredBytes).toBe(
				Buffer.byteLength(source, "utf8"),
			);
		});

		test("headings keepWithNext is true unless at document tail", () => {
			const source = `# Heading 1

Paragraph.

# Trailing Heading`;

			const parsed = parseEpubMarkdown(source, "tail.md");
			expect(parsed.units[0]!.keepWithNext).toBe(true); // Heading 1
			expect(parsed.units[1]!.keepWithNext).toBe(false); // Paragraph
			expect(parsed.units[2]!.keepWithNext).toBe(false); // Trailing Heading
		});
	});
});

describe("W1 preservation regressions", () => {
	test("original byte ranges cover CRLF, multibyte front matter and duplicate reference definitions without gaps", () => {
		const source =
			'---\r\ntitle: "Книга"\r\n---\r\n\r\n## Имя\r\n\r\n[Текст][A B]\r\n\r\n[A B]: /first "Первый"\r\n[a   b]: /second\r\n';
		const parsed = parseEpubMarkdown(source, "/book.md");
		let cursor = 0;
		for (const range of parsed.coverage.ranges) {
			expect(range.startByte).toBe(cursor);
			expect(range.endByte).toBeGreaterThanOrEqual(cursor);
			cursor = range.endByte;
		}
		expect(cursor).toBe(Buffer.byteLength(source));
		expect(parsed.coverage.coveredBytes).toBe(cursor);
		expect(parsed.descriptor.title).toBe("Книга");
		expect(parsed.definitions.get("a b")?.href).toBe("/first");
		expect(parsed.diagnostics?.map((d) => d.code)).toContain(
			"W_REFERENCE_DUPLICATE",
		);
		expect(parsed.links[0]?.rawHref).toBe("/first");
		expect(
			parsed.units.find((u) => u.kind === "heading")?.range.startLine,
		).toBe(5);
	});
	test("reserves later explicit IDs and pages, registers nested and suffixed Unicode aliases", () => {
		const parsed = parseEpubMarkdown(
			"## Имя\n\n## Имя\n\n## Reserved {#Imya}\n\n> ## Nested\n\n## page-1\n\n<!-- Page 1 -->\n\n<!-- Page 1 -->",
			"/book.md",
			{ pageBreaks: true },
		);
		expect(parsed.anchors.map((a) => a.id)).toEqual([
			"Imya-2",
			"Imya-3",
			"Imya",
			"Nested",
			"page-1-3",
			"page-1",
			"page-1-2",
		]);
		expect(parsed.anchors[0]?.aliases).toContain("Имя-2");
		expect(new Set(parsed.anchors.map((a) => a.id)).size).toBe(
			parsed.anchors.length,
		);
		expect(
			parsed.units.find((u) => u.kind === "blockquote")?.anchorIds,
		).toHaveLength(1);
	});
	test("rejects duplicate explicit IDs including inline HTML IDs", () => {
		expect(() =>
			parseEpubMarkdown(
				'## A {#same}\n\nText <span id="same">word</span>',
				"/book.md",
			),
		).toThrow("Duplicate explicit anchor");
	});
	test("page markers and anchors inside code remain code without targets", () => {
		const parsed = parseEpubMarkdown(
			'```html\n<!-- Page 9 -->\n<a id="fake"></a>\n```',
			"/book.md",
			{ pageBreaks: true },
		);
		expect(parsed.anchors).toEqual([]);
		expect(parsed.pages).toEqual([]);
	});
	test("formatted headings expose visible labels, escaped custom suffix stays text and explicit setext anchors work", () => {
		const parsed = parseEpubMarkdown(
			"## **Bold** [label](/url)\n\n## Escape \\{#literal}\n\n## `code {#literal}`",
			"/book.md",
		);
		expect(parsed.outline[0]?.label).toBe("Bold label");
		expect(parsed.anchors.some((a) => a.id === "literal")).toBe(false);
	});
	test("raw HTML anchors, links and images join the symbol table", () => {
		const parsed = parseEpubMarkdown(
			'<div id="block"><a href="later.md">Text</a><img src="pic.png" alt="pic"/></div>\n\nInline <span id="inline">keep</span>',
			"/book.md",
		);
		expect(parsed.anchors.map((a) => a.id)).toEqual(["block", "inline"]);
		expect(parsed.links.map((a) => a.rawHref)).toContain("later.md");
		expect(parsed.images.map((a) => a.rawSrc)).toContain("pic.png");
	});
});
