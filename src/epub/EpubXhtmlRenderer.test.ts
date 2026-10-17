import { describe, expect, test } from "bun:test";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import { normalizeEpubOptions } from "./EpubOptions";
import type { ChapterPart, ParsedSource, TelegraphNode } from "./EpubTypes";
import {
	EpubXhtmlRenderer,
	type RenderContext,
	serializeNode,
} from "./EpubXhtmlRenderer";

function createParsedSource(
	markdown: string,
	title = "My Document",
	key = "/docs/doc.md",
	ordinal = 1,
): ParsedSource {
	return parseEpubMarkdown(markdown, key, {
		sourceOrdinal: ordinal,
		sourceTitle: title,
		pageBreaks: true,
	});
}

function createPart(
	source: ParsedSource,
	firstUnit = 0,
	endUnitExclusive = source.units.length,
	reason: "source" | "heading" | "size" = "source",
): ChapterPart {
	return {
		id: "chapter-1",
		href: "chapter-1.html",
		sourceKey: source.descriptor.key,
		firstUnit,
		endUnitExclusive,
		logicalSectionId: "sec-1",
		reason,
		finalBytes: 0,
	};
}

describe("EpubXhtmlRenderer", () => {
	const renderer = new EpubXhtmlRenderer();
	const baseOptions = normalizeEpubOptions({
		outputPath: "/out/book.epub",
		title: "Test Book",
		author: "Author",
		epubVersion: 3,
		language: "ru",
	});

	test("exact UTF-8 complete serialized XHTML wrapper in EPUB 3", async () => {
		const source = createParsedSource(
			"# Title\n\nSome paragraph text.",
			"Title",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const result = await renderer.renderPart(part, context);

		expect(result.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(result.text).toContain("<!DOCTYPE html>");
		expect(result.text).toContain(
			'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru" lang="ru">',
		);
		expect(result.text).toContain("<title>Title</title>");
		expect(result.text).toContain(
			'<link rel="stylesheet" type="text/css" href="style.css"/>',
		);
		expect(result.text).toContain("<body>");
		expect(result.text).toContain("</body></html>");

		expect(result.bytes).toBe(Buffer.byteLength(result.text, "utf8"));
		expect(result.sha256).toBeDefined();
	});

	test("EPUB 2 wrapper differences", async () => {
		const source = createParsedSource("# Title\n\nContent.", "Title");
		const part = createPart(source);
		const epub2Options = normalizeEpubOptions({
			outputPath: "/out/book.epub",
			title: "Test Book",
			author: "Author",
			epubVersion: 2,
			language: "ru",
		});
		const context: RenderContext = {
			source,
			options: epub2Options,
		};

		const result = await renderer.renderPart(part, context);

		expect(result.text).toContain(
			'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
		);
		expect(result.text).toContain(
			'<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ru">',
		);
		expect(result.text).not.toContain("xmlns:epub");
		expect(result.text).not.toContain(' lang="ru"');
	});

	test("preserves original heading levels without promoting to h1", async () => {
		const source = createParsedSource(
			"# Title\n\n## Subheading Two\n\n### Subheading Three",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const result = await renderer.renderPart(part, context);

		expect(result.text).toContain("<h2");
		expect(result.text).toContain("Subheading Two</h2>");
		expect(result.text).toContain("<h3");
		expect(result.text).toContain("Subheading Three</h3>");
	});

	test("first visible h1 matching title is preserved without duplicate wrapper h1", async () => {
		const source = createParsedSource(
			"# My Document\n\nBody text.",
			"My Document",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const result = await renderer.renderPart(part, context);

		const h1Matches = result.text.match(/<h1\b[^>]*>/g);
		expect(h1Matches).toHaveLength(1);
		expect(result.text).toContain("My Document</h1>");
	});

	test("synthetic h1 is added once when first visible heading is not matching h1", async () => {
		const source = createParsedSource(
			"Preamble paragraph.\n\n## Section One\n\nText.",
			"Custom Title",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const result = await renderer.renderPart(part, context);

		expect(result.text).toContain(
			`<h1 id="source-root-${source.descriptor.ordinal}">Custom Title</h1>`,
		);
		expect(result.text).toContain('<h2 id="Section-One">Section One</h2>');
	});

	test("continuation part gets continuation title in div, NOT heading or navpoint", async () => {
		const source = createParsedSource(
			"# Chapter\n\nParagraph 1.\n\nParagraph 2.",
			"Chapter",
		);
		// Part starting from unit 1 (second unit) due to size
		const part = createPart(source, 1, 3, "size");
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const result = await renderer.renderPart(part, context);

		expect(result.text).toContain("<title>Chapter (продолжение)</title>");
		expect(result.text).toContain(
			'<div class="epub-continuation">Chapter (продолжение)</div>',
		);
		expect(result.text).not.toContain("<h1");
	});

	test("rewrites link hrefs using targetMap and image srcs using imageMap", async () => {
		const source = createParsedSource(
			"Here is a [link](doc.md#heading) and an image ![alt](cat.png).",
		);
		const part = createPart(source);
		const targetMap = new Map<string, string>([
			["doc.md#heading", "chapter-3.html#heading"],
		]);
		const imageMap = new Map<string, string>([
			["cat.png", "images/cat-sha123.png"],
		]);

		const context: RenderContext = {
			source,
			options: baseOptions,
			targetMap,
			imageMap,
		};

		const result = await renderer.renderPart(part, context);

		expect(result.text).toContain('href="chapter-3.html#heading"');
		expect(result.text).toContain('src="images/cat-sha123.png"');
	});

	test("inline navigation placed at logical section ends", async () => {
		const source = createParsedSource("# Title\n\nContent.");
		const part = createPart(source);
		const inlineNav = {
			start: '<nav class="sec-nav-start">Start Nav</nav>',
			end: '<nav class="sec-nav-end">End Nav</nav>',
		};

		// 1. Both first and last in section: receives both start and end
		const resultBoth = await renderer.renderPart(part, {
			source,
			options: baseOptions,
			inlineNav,
			isFirstPartInLogicalSection: true,
			isLastPartInLogicalSection: true,
		});
		expect(resultBoth.text).toContain(
			'<nav class="sec-nav-start">Start Nav</nav>',
		);
		expect(resultBoth.text).toContain('<nav class="sec-nav-end">End Nav</nav>');

		// 2. Middle part in section: receives neither
		const resultMiddle = await renderer.renderPart(part, {
			source,
			options: baseOptions,
			inlineNav,
			isFirstPartInLogicalSection: false,
			isLastPartInLogicalSection: false,
		});
		expect(resultMiddle.text).not.toContain("sec-nav-start");
		expect(resultMiddle.text).not.toContain("sec-nav-end");
	});

	test("streaming writer and chunk seam parity", async () => {
		const source = createParsedSource(
			"# Title\n\nParagraph 1.\n\nParagraph 2.\n\n```ts\nconst x = 1;\n```",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const direct = await renderer.renderPart(part, context);

		const writtenChunks: Uint8Array[] = [];
		const mockWriter = {
			async write(chunk: Uint8Array) {
				writtenChunks.push(chunk);
			},
		};

		const streamed = await renderer.renderPartToWriter(
			part,
			context,
			mockWriter,
		);

		expect(streamed.bytes).toBe(direct.bytes);
		expect(streamed.sha256).toBe(direct.sha256);

		const assembled = Buffer.concat(writtenChunks).toString("utf8");
		expect(assembled).toBe(direct.text);
	});

	test("streaming writer structural verification: does not call Buffer.concat or retain string", async () => {
		const source = createParsedSource(
			"# Title\n\nParagraph 1.\n\nParagraph 2.\n\n```ts\nconst x = 1;\n```",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const direct = await renderer.renderPart(part, context);

		const originalConcat = Buffer.concat;
		let concatCount = 0;
		Buffer.concat = function (...args: Parameters<typeof Buffer.concat>) {
			concatCount++;
			return originalConcat.apply(Buffer, args);
		} as typeof Buffer.concat;

		try {
			const writtenChunks: Uint8Array[] = [];
			const mockWriter = {
				async write(chunk: Uint8Array) {
					writtenChunks.push(chunk);
				},
			};

			const streamed = await renderer.renderPartToWriter(
				part,
				context,
				mockWriter,
			);

			// Must not call Buffer.concat
			expect(concatCount).toBe(0);
			// Streaming text contract: empty string
			expect(streamed.text).toBe("");
			// Exact parity on public byte length and sha256 hash
			expect(streamed.bytes).toBe(direct.bytes);
			expect(streamed.sha256).toBe(direct.sha256);
		} finally {
			Buffer.concat = originalConcat;
		}
	});

	test("renderPart with retainText: false produces empty text and exact metadata", async () => {
		const source = createParsedSource(
			"# Title\n\nParagraph 1.\n\nParagraph 2.",
		);
		const part = createPart(source);
		const context: RenderContext = {
			source,
			options: baseOptions,
		};

		const direct = await renderer.renderPart(part, context);
		const nonretained = await renderer.renderPart(part, {
			...context,
			retainText: false,
		});

		expect(nonretained.text).toBe("");
		expect(nonretained.bytes).toBe(direct.bytes);
		expect(nonretained.sha256).toBe(direct.sha256);
	});

	test("visible preamble paragraph requires synthetic h1 even if matching h1 appears later", async () => {
		const source = createParsedSource(
			"A visible preamble paragraph.\n\n# Document Title\n\nBody content.",
			"Document Title",
		);
		const part = createPart(source);
		const result = await renderer.renderPart(part, {
			source,
			options: baseOptions,
		});

		const h1Matches = result.text.match(/<h1\b[^>]*>/g);
		// Since first visible node is a paragraph, synthetic h1 is emitted at the top
		expect(h1Matches).toHaveLength(2);
		expect(result.text).toContain(
			`<h1 id="source-root-${source.descriptor.ordinal}">Document Title</h1>`,
		);
	});

	test("invisible HTML comments and empty tags before h1 do not trigger synthetic h1", async () => {
		const source = createParsedSource(
			'<!-- Top comment --><div id="top"></div>\n\n# Document Title\n\nBody content.',
			"Document Title",
		);
		const part = createPart(source);
		const result = await renderer.renderPart(part, {
			source,
			options: baseOptions,
		});

		const h1Matches = result.text.match(/<h1\b[^>]*>/g);
		expect(h1Matches).toHaveLength(1);
		expect(result.text).not.toContain(
			`source-root-${source.descriptor.ordinal}`,
		);
	});

	test("source-scoped targetMap isolates href resolution across different sources", async () => {
		const sourceA = createParsedSource(
			"[Link](#same)",
			"Source A",
			"/dir/a.md",
			1,
		);
		const sourceB = createParsedSource(
			"[Link](#same)",
			"Source B",
			"/dir/b.md",
			2,
		);
		const partA = createPart(sourceA);
		const partB = createPart(sourceB);

		const sourceTargetMaps = new Map<string, Map<string, string>>([
			["/dir/a.md", new Map([["#same", "chapter-1.html#same"]])],
			["/dir/b.md", new Map([["#same", "chapter-2.html#same"]])],
		]);

		const resA = await renderer.renderPart(partA, {
			source: sourceA,
			options: baseOptions,
			sourceTargetMaps,
		});
		const resB = await renderer.renderPart(partB, {
			source: sourceB,
			options: baseOptions,
			sourceTargetMaps,
		});

		expect(resA.text).toContain('href="chapter-1.html#same"');
		expect(resB.text).toContain('href="chapter-2.html#same"');
	});

	test("measureEmptyWrapper produces accurate baseline bytes", () => {
		const bytes = renderer.measureEmptyWrapper(baseOptions);
		expect(bytes).toBeGreaterThan(100);
		expect(bytes).toBeLessThan(1000);
	});

	test("serializeNode handles void tags and XML entities correctly", () => {
		const brNode: TelegraphNode = { tag: "br" };
		expect(serializeNode(brNode)).toBe("<br/>");

		const hrNode: TelegraphNode = { tag: "hr" };
		expect(serializeNode(hrNode)).toBe("<hr/>");

		const imgNode: TelegraphNode = {
			tag: "img",
			attrs: { src: "image.png", alt: 'A "photo" & sketch' },
		};
		expect(serializeNode(imgNode)).toBe(
			'<img src="image.png" alt="A &quot;photo&quot; &amp; sketch"/>',
		);

		const pNode: TelegraphNode = {
			tag: "p",
			children: ["Text with < & > and 'quotes'."],
		};
		expect(serializeNode(pNode)).toBe(
			"<p>Text with &lt; &amp; &gt; and &apos;quotes&apos;.</p>",
		);
	});
});
