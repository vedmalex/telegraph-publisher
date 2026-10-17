import { describe, expect, test } from "bun:test";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import { renderEpubTokens } from "./EpubTokenRenderer";
import type { EpubRenderContext } from "./EpubTypes";

describe("EpubTokenRenderer", () => {
	const defaultContext: EpubRenderContext = {
		sourceKey: "test.md",
		pageBreaks: true,
		epubVersion: 3,
	};

	test("renders headings with correct tags, IDs and level > 6 prefix", () => {
		const source = `# Main Heading
## Sub Heading
####### Deep Heading 7`;
		const parsed = parseEpubMarkdown(source, "test.md");

		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);
		const nodes = renderEpubTokens(tokens, defaultContext);

		expect(nodes).toHaveLength(3);
		expect(nodes[0]!.tag).toBe("h1");
		expect(nodes[0]!.attrs?.id).toBe("Main-Heading");

		expect(nodes[1]!.tag).toBe("h2");
		expect(nodes[1]!.attrs?.id).toBe("Sub-Heading");

		// Level 7 uses tag h6 and prepends '>>> '
		expect(nodes[2]!.tag).toBe("h6");
		expect(nodes[2]!.attrs?.id).toBe("___-Deep-Heading-7");
		expect(nodes[2]!.children?.[0]).toBe(">>> ");
	});

	test("renders shlokas with soft line breaks preserved as <br/>", () => {
		const source = `śrī-kṛṣṇa-caitanya prabhu-doyā koro more |
tomā binā ke doyālu jagat-saṁsāre || 1 ||`;
		const parsed = parseEpubMarkdown(source, "shloka.md");
		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);
		const nodes = renderEpubTokens(tokens, defaultContext);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.tag).toBe("p");

		// Find <br> tag in children
		const brNode = nodes[0]!.children?.find(
			(c) => typeof c === "object" && c.tag === "br",
		);
		expect(brNode).toBeDefined();
	});

	test("renders code blocks as <pre><code> structure", () => {
		const source = "```typescript\nconst message = 'Hare Krishna';\n```";
		const parsed = parseEpubMarkdown(source, "code.md");
		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);
		const nodes = renderEpubTokens(tokens, defaultContext);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.tag).toBe("pre");
		expect(nodes[0]!.children?.[0]).toMatchObject({
			tag: "code",
			children: ["const message = 'Hare Krishna';"],
		});
	});

	test("renders GFM tables with thead and tbody", () => {
		const source = `| Name | Age |
| :--- | :-- |
| Ram  | 25  |
| Sham | 30  |`;
		const parsed = parseEpubMarkdown(source, "table.md");
		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);
		const nodes = renderEpubTokens(tokens, defaultContext);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.tag).toBe("table");

		const thead = nodes[0]!.children?.find(
			(c) => typeof c === "object" && c.tag === "thead",
		);
		expect(thead).toBeDefined();

		const tbody = nodes[0]!.children?.find(
			(c) => typeof c === "object" && c.tag === "tbody",
		);
		expect(tbody).toBeDefined();
	});

	test("renders lists with nested sub-lists and ordered start attribute", () => {
		const source = `3. Item Three
4. Item Four
   - Sub bullet A
   - Sub bullet B`;
		const parsed = parseEpubMarkdown(source, "list.md");
		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);
		const nodes = renderEpubTokens(tokens, defaultContext);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.tag).toBe("ol");
		expect(nodes[0]!.attrs?.start).toBe("3");

		// Second li has nested ul
		const liItems = (nodes[0]!.children ?? []).filter(
			(c) => typeof c === "object" && c.tag === "li",
		);
		expect(liItems).toHaveLength(2);
	});

	test("renders page break spans when pageBreaks is enabled", () => {
		const source = `<!-- Page 77 -->\nSome text on page 77.`;
		const parsed = parseEpubMarkdown(source, "page.md", { pageBreaks: true });
		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);
		const nodes = renderEpubTokens(tokens, defaultContext);

		const pageSpan = nodes.find(
			(n) =>
				typeof n === "object" && n.tag === "span" && n.attrs?.id === "page-77",
		);
		expect(pageSpan).toBeDefined();
		expect(pageSpan?.attrs?.["epub:type"]).toBe("pagebreak");
		expect(pageSpan?.attrs?.role).toBe("doc-pagebreak");
	});

	test("rewrites links and images via targetMap and imageMap in context", () => {
		const source = `See [Section](#intro) and ![Photo](pic.jpg).`;
		const parsed = parseEpubMarkdown(source, "maps.md");
		const tokens = parsed.units.flatMap(
			(u) => parsed.payloadStore.get(u.payloadRef)?.tokens ?? [],
		);

		const contextWithMaps: EpubRenderContext = {
			...defaultContext,
			targetMap: new Map([["#intro", "chapter-2.html#intro"]]),
			imageMap: new Map([["pic.jpg", "images/pic-hash.jpg"]]),
		};

		const nodes = renderEpubTokens(tokens, contextWithMaps);
		const pNode = nodes[0]!;
		const link = pNode.children?.find(
			(c) => typeof c === "object" && c.tag === "a",
		);
		expect(typeof link === "object" ? link.attrs?.href : undefined).toBe(
			"chapter-2.html#intro",
		);

		const img = pNode.children?.find(
			(c) => typeof c === "object" && c.tag === "img",
		);
		expect(typeof img === "object" ? img.attrs?.src : undefined).toBe(
			"images/pic-hash.jpg",
		);
	});
});

describe("W1 semantic preservation", () => {
	const render = (
		source: string,
		context: EpubRenderContext = { sourceKey: "/book.md" },
	) => {
		const parsed = parseEpubMarkdown(source, "/book.md", {
			pageBreaks: context.pageBreaks,
		});
		return renderEpubTokens(
			parsed.units.flatMap(
				(u) => parsed.payloadStore.get(u.payloadRef)!.tokens,
			),
			context,
		);
	};
	test("preserves allowed HTML structure and mixed inline Markdown without content loss", () => {
		const nodes = render(
			'<div id="intro"><p>before <em>emphasis</em> &amp; after</p></div>\n\nA <span id="inline">**bold** and [link](x.md)</span> Z',
		);
		expect(nodes[0]).toMatchObject({
			tag: "div",
			attrs: { id: "intro" },
			children: [
				{
					tag: "p",
					children: [
						"before ",
						{ tag: "em", children: ["emphasis"] },
						" & after",
					],
				},
			],
		});
		expect(nodes[1]?.children).toMatchObject([
			"A ",
			{
				tag: "span",
				attrs: { id: "inline" },
				children: [
					{ tag: "strong", children: ["bold"] },
					" and ",
					{ tag: "a", attrs: { href: "x.md" }, children: ["link"] },
				],
			},
			" Z",
		]);
	});
	test("unsupported HTML is literal and diagnostic, never silently discarded", () => {
		const diagnostics: NonNullable<EpubRenderContext["diagnostics"]> = [];
		const source = '<script>alert("x")</script>\n';
		const nodes = render(source, { sourceKey: "/book.md", diagnostics });
		expect(nodes).toEqual([{ tag: "p", children: [source] }]);
		expect(diagnostics.map((d) => d.code)).toContain("W_HTML_UNSUPPORTED");
		expect(render('<p onclick="evil()">Keep text</p>')).toEqual([
			{ tag: "p", children: ['<p onclick="evil()">Keep text</p>'] },
		]);
	});
	test("keeps adjacent formatted list text in one paragraph and nested list atomic", () => {
		const nodes = render("- A **bold** C\n  - Child\n- Last");
		expect(nodes[0]?.children?.[0]).toMatchObject({
			tag: "li",
			children: [
				{
					tag: "p",
					children: ["A ", { tag: "strong", children: ["bold"] }, " C"],
				},
				{ tag: "ul" },
			],
		});
	});
	test("decodes entities once and preserves literal code entity text", () => {
		const nodes = render("A &amp; B &#x1f64f;\n\n`&amp;`\n\n```\n&amp;\n```");
		expect(nodes[0]?.children).toEqual(["A & B 🙏"]);
		expect(nodes[1]?.children).toEqual([{ tag: "code", children: ["&amp;"] }]);
		expect(nodes[2]?.children).toEqual([{ tag: "code", children: ["&amp;"] }]);
	});
	test("repeated page IDs match parser assignments and EPUB2 avoids EPUB3 semantics", () => {
		const nodes = render("<!-- Page 4 -->\n\n<!-- Page 4 -->", {
			sourceKey: "/book.md",
			pageBreaks: true,
			epubVersion: 2,
		});
		expect(nodes.map((n) => n.attrs?.id)).toEqual(["page-4", "page-4-2"]);
		expect(nodes.some((n) => n.attrs?.["epub:type"])).toBe(false);
	});
	test("only valid table delimiter rows create tables, escaped pipes remain cell text", () => {
		const nodes = render(
			"| A | B |\n| --- | --- |\n| a\\|b | c |\n\nline।\nnext॥",
		);
		expect(nodes[0]?.tag).toBe("table");
		expect(JSON.stringify(nodes[0])).toContain("a|b");
		expect(nodes[1]?.children).toContainEqual({ tag: "br" });
	});
});
