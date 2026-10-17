import { describe, expect, test } from "bun:test";
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";

describe("convertMarkdownToTelegraphNodes (target: 'epub')", () => {
	test("Defect D2: 4+ backtick code fence with inner headings does not create heading nodes", () => {
		const markdown = `# Chapter One

\`\`\`\`markdown
\`\`\`
## Fake Code Heading
\`\`\`
\`\`\`\`

## Chapter Two
`;

		const nodes = convertMarkdownToTelegraphNodes(markdown, {
			target: "epub",
			generateToc: false,
		});

		const headings = nodes.filter(
			(n) => typeof n === "object" && n.tag && /^h[1-6]$/.test(n.tag),
		);
		expect(headings).toHaveLength(2);
		expect(headings[0]?.tag).toBe("h1");
		expect(headings[1]?.tag).toBe("h2");

		const codeBlocks = nodes.filter(
			(n) => typeof n === "object" && n.tag === "pre",
		);
		expect(codeBlocks).toHaveLength(1);
	});

	test("Shlokas with daṇḍas (| and ||) preserve soft line breaks as <br/> within single paragraph", () => {
		const markdown = `nama oṁ viṣṇu-pādāya kṛṣṇa-preṣṭhāya bhū-tale |
śrīmate bhaktivedānta-svāmin iti nāmine || 1 ||`;

		const nodes = convertMarkdownToTelegraphNodes(markdown, {
			target: "epub",
			generateToc: false,
		});

		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.tag).toBe("p");

		const children = nodes[0]?.children || [];
		const brTags = children.filter(
			(c) => typeof c === "object" && c.tag === "br",
		);
		expect(brTags.length).toBeGreaterThanOrEqual(1);
	});

	test("GFM tables produce <table> with <thead> and <tbody>", () => {
		const markdown = `| Header 1 | Header 2 |
| :------- | :------- |
| Val 1    | Val 2    |`;

		const nodes = convertMarkdownToTelegraphNodes(markdown, {
			target: "epub",
			generateToc: false,
		});

		expect(nodes).toHaveLength(1);
		const table = nodes[0];
		expect(table?.tag).toBe("table");

		const thead = table?.children?.find(
			(c) => typeof c === "object" && c.tag === "thead",
		);
		expect(thead).toBeDefined();

		const tbody = table?.children?.find(
			(c) => typeof c === "object" && c.tag === "tbody",
		);
		expect(tbody).toBeDefined();
	});

	test("Page breaks populate pageList array and render pagebreak spans", () => {
		const markdown = `# Book Title
<!-- Page 50 -->
Content on page 50.
<!-- Page 51 -->
Content on page 51.`;

		const pageList: number[] = [];
		const nodes = convertMarkdownToTelegraphNodes(markdown, {
			target: "epub",
			generateToc: false,
			pageBreaks: true,
			pageList,
		});

		expect(pageList).toEqual([50, 51]);

		const pageSpans = nodes.filter(
			(n) =>
				typeof n === "object" &&
				n.tag === "span" &&
				n.attrs?.id?.startsWith("page-"),
		);
		expect(pageSpans).toHaveLength(2);
	});

	test("Headings > 6 map to h6 tag with prefix in EPUB mode", () => {
		const markdown = `####### Deep Heading`;

		const nodes = convertMarkdownToTelegraphNodes(markdown, {
			target: "epub",
			generateToc: false,
		});

		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.tag).toBe("h6");
		expect(nodes[0]?.children?.[0]).toBe(">>> ");
	});

	test("Generates inline ToC with ASCII links when requested", () => {
		const markdown = `# Введение
Some text.
# Основная часть
More text.`;

		const nodes = convertMarkdownToTelegraphNodes(markdown, {
			target: "epub",
			generateToc: true,
			inlineToC: true,
		});

		// Contains ToC links with ASCII anchors
		const json = JSON.stringify(nodes);
		expect(json).toContain('"href":"#Vvedenie"');
		expect(json).toContain('"href":"#Osnovnaya-chast"');
	});
});

test("EPUB ToC uses emitted duplicate/explicit/setext IDs and excludes code headings", () => {
	const nodes = convertMarkdownToTelegraphNodes(
		"## Имя\n\n## Имя\n\nExplicit {#custom}\n==================\n\n```\n# Fake\n```",
		{ target: "epub", tocNested: true },
	);
	const links: string[] = [];
	const ids: string[] = [];
	const visit = (
		items: (string | import("./telegraphPublisher").TelegraphNode)[],
	) => {
		for (const n of items)
			if (typeof n !== "string") {
				if (n.attrs?.href) links.push(n.attrs.href);
				if (n.attrs?.id) ids.push(n.attrs.id);
				visit(n.children ?? []);
			}
	};
	visit(nodes);
	expect(links).toEqual(["#Imya", "#Imya-2", "#custom"]);
	expect(ids).toEqual(["Imya", "Imya-2", "custom"]);
	expect(links.every((h) => ids.includes(h.slice(1)))).toBe(true);
});
