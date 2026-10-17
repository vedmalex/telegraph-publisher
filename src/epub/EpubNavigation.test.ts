import { expect, test } from "bun:test";
import { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import {
	buildOutline,
	renderBookToc,
	renderInlineNavigation,
	renderNav,
	renderNcx,
} from "./EpubNavigation";
import type { ChapterPart, ParsedSource } from "./EpubTypes";

function context(text: string, title = "Book") {
	const source = parseEpubMarkdown(text, "/books/book.md", {
		sourceOrdinal: 0,
		sourceTitle: title,
		pageBreaks: true,
	});
	const index = new EpubAnchorRegistry();
	index.registerSource(source);
	const parts: ChapterPart[] = source.units.map((_unit, i) => ({
		id: `chapter-${i + 1}`,
		href: `chapter-${i + 1}.html`,
		sourceKey: source.descriptor.key,
		firstUnit: i,
		endUnitExclusive: i + 1,
		logicalSectionId: "book",
		reason: i ? "size" : "source",
		finalBytes: 0,
	}));
	index.assignParts(parts);
	return { source, index, outline: buildOutline([source]) };
}
test("source title reuses matching first h1, depth filtering preserves levels and actual part targets", () => {
	const { source, index, outline } = context(
		"# Book\n\n### Deep & <x>\n\ntext\n\n######## Extended\n\nMore\n",
	);
	expect(outline).toHaveLength(1);
	expect(outline[0]?.label).toBe("Book");
	expect(outline[0]?.children[0]?.level).toBe(3);
	expect(outline[0]?.children[0]?.children[0]?.level).toBe(8);
	const nav = renderNav(outline, [], index, { tocDepth: 3 });
	expect(nav.match(/>Book<\/a>/g)).toHaveLength(1);
	expect(nav).toContain("Deep &amp; &lt;x&gt;");
	expect(nav).not.toContain(">Extended<");
	const heading = source.anchors.find(
		(anchor) => anchor.kind === "heading" && anchor.ordinal === 2,
	);
	if (!heading) throw new Error("Missing heading anchor");
	const target = index.target(heading.targetId);
	expect(nav).toContain(`${target.href}#${target.id}`);
	expect(nav).not.toContain("Part 2");
});
test("preamble and differing h1 retain one source root plus every semantic heading", () => {
	const { index, outline } = context("Preamble\n\n# Other\n\n## Child\n");
	expect(outline[0]?.level).toBe(0);
	expect(outline[0]?.children[0]?.label).toBe("Other");
	const nav = renderNav(outline, [], index);
	expect(nav).toContain('href="chapter-1.html">Book');
	expect(nav).toContain(">Other<");
	const synthetic: ParsedSource = {
		...context("# Book\n").source,
		descriptor: {
			...context("# Book\n").source.descriptor,
			title: '<Book & "quoted">',
		},
	};
	expect(buildOutline([synthetic])[0]?.label).toBe('<Book & "quoted">');
});
test("NCX DFS order and computed depth include repeated page occurrences without EPUB3 attributes", () => {
	const { source, index, outline } = context(
		"# Book\n\n### Third\n\n<!-- Page 7 -->\n\ntext\n\n<!-- Page 7 -->\n\n#### Fourth\n",
	);
	const ncx = renderNcx(outline, source.pages, index, {
		epubVersion: 2,
		title: 'A & "B"',
		identifier: "uid&1",
	});
	expect(ncx).toContain('name="dtb:depth" content="3"');
	expect(ncx).toContain("A &amp; &quot;B&quot;");
	expect(ncx).toContain("uid&amp;1");
	expect(ncx.match(/<pageTarget /g)).toHaveLength(2);
	expect(ncx.match(/<text>7<\/text>/g)).toHaveLength(2);
	const orders = [...ncx.matchAll(/playOrder="(\d+)"/g)].map((match) =>
		Number(match[1]),
	);
	expect(orders).toEqual([1, 2, 3, 4, 5]);
	expect(ncx).not.toContain("epub:");
	const nav = renderNav(outline, source.pages, index);
	expect(nav.match(/>7<\/a>/g)).toHaveLength(2);
	expect(() =>
		renderNav(outline, source.pages, index, { epubVersion: 2 }),
	).toThrow();
	const book = renderBookToc(outline, source.pages, index, {
		epubVersion: 2,
		bookTocDepth: 8,
	});
	expect(book).toContain("XHTML 1.1");
	expect(book).not.toContain("epub:");
});
test("inline full navigation returns one atomic list per requested logical boundary", () => {
	const { outline, index } = context("# Book\n\n## One\n\nText\n\n#### Four\n");
	const inline = renderInlineNavigation(outline[0]?.children ?? [], index, {
		chapterToc: "full",
		chapterTocPosition: "both",
		chapterTocDepth: 2,
	});
	expect(inline.start).toBe(inline.end);
	expect(inline.start).toContain(">One<");
	expect(inline.start).not.toContain(">Four<");
	expect(inline.start.match(/<ol>/g)).toHaveLength(1);
	expect(
		renderInlineNavigation(outline, index, { chapterToc: "auto" }),
	).toEqual({ start: "", end: "" });
});
test("block milestones use source heading IDs after splitting and never exceed configured cap", () => {
	const { outline, index } = context(
		`# Book\n\n${Array.from({ length: 100 }, (_, i) => `## Текст ${i + 1}\n\nparagraph\n`).join("\n")}`,
	);
	const inline = renderInlineNavigation(outline[0]?.children ?? [], index, {
		chapterToc: "blocks",
		navMaxItems: 4,
		navThreshold: 30,
	});
	const hrefs = [...inline.start.matchAll(/href="([^"]+)"/g)].map(
		(match) => match[1],
	);
	expect(hrefs.length).toBeGreaterThan(0);
	expect(hrefs.length).toBeLessThanOrEqual(4);
	expect(hrefs.every((href) => href?.startsWith("chapter-"))).toBe(true);
	expect(inline.start).toBe(inline.end);
});
