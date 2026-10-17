import { describe, expect, test } from "bun:test";
import { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import {
	type EpubBookModel,
	EpubLayoutPlanner,
	type PayloadStore,
} from "./EpubLayoutPlanner";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import { buildOutline } from "./EpubNavigation";
import { type EpubInputOptions, normalizeEpubOptions } from "./EpubOptions";
import {
	EpubBuildError,
	type EpubUnitPayload,
	type ParsedSource,
} from "./EpubTypes";
import { EpubXhtmlRenderer } from "./EpubXhtmlRenderer";

function createParsedSource(
	markdown: string,
	key = "/books/book1.md",
	title = "Book One",
	ordinal = 1,
): ParsedSource {
	return parseEpubMarkdown(markdown, key, {
		sourceOrdinal: ordinal,
		sourceTitle: title,
		pageBreaks: true,
	});
}

function createBookModel(sources: ParsedSource[]): EpubBookModel {
	const anchorRegistry = new EpubAnchorRegistry();
	for (const s of sources) {
		anchorRegistry.registerSource(s);
	}
	const outline = buildOutline(sources);
	const pages = sources.flatMap((s) => s.pages);
	return {
		sources,
		anchorRegistry,
		outline,
		pages,
	};
}

function makeOptions(overrides: Partial<EpubInputOptions> = {}) {
	return normalizeEpubOptions({
		outputPath: "/out/book.epub",
		title: "Test Book",
		author: "Author",
		epubVersion: 3,
		language: "ru",
		maxChapterBytes: 307200,
		...overrides,
	});
}

describe("EpubLayoutPlanner", () => {
	const planner = new EpubLayoutPlanner();
	const renderer = new EpubXhtmlRenderer();

	test("source separation: units from different sources are never mixed in one content part", async () => {
		const s1 = createParsedSource(
			"# S1 Title\n\nSource 1 content paragraph.",
			"/books/s1.md",
			"S1 Title",
			1,
		);
		const s2 = createParsedSource(
			"# S2 Title\n\nSource 2 content paragraph.",
			"/books/s2.md",
			"S2 Title",
			2,
		);
		const book = createBookModel([s1, s2]);

		const result = await planner.plan(book, makeOptions(), renderer);

		expect(result.parts.length).toBeGreaterThanOrEqual(2);
		expect(result.parts[0]?.sourceKey).toBe("/books/s1.md");
		expect(result.parts[1]?.sourceKey).toBe("/books/s2.md");

		for (const part of result.parts) {
			const source = book.sources.find(
				(s) => s.descriptor.key === part.sourceKey,
			);
			expect(source).toBeDefined();
			expect(part.firstUnit).toBeGreaterThanOrEqual(0);
			expect(part.endUnitExclusive).toBeLessThanOrEqual(
				source?.units.length ?? 0,
			);
		}
	});

	test("mandatory splitAt partitions headings of level <= splitAt into separate logical sections", async () => {
		const markdown = `# Level 1\n\nParagraph 1.\n\n## Level 2\n\nParagraph 2.\n\n### Level 3\n\nParagraph 3.`;
		const s = createParsedSource(markdown, "/books/split.md", "Level 1", 1);
		const book = createBookModel([s]);

		const options = makeOptions({
			splitAt: 2,
			maxChapterBytes: null, // no size-based split, only splitAt
		});

		const result = await planner.plan(book, options, renderer);

		expect(result.parts).toHaveLength(2);
		expect(result.parts[0]?.firstUnit).toBe(0);
		expect(result.parts[1]?.reason).toBe("heading");

		const p1 = result.renderedParts.get(result.parts[0]?.id ?? "");
		const p2 = result.renderedParts.get(result.parts[1]?.id ?? "");

		expect(p1?.text).toContain("Level 1</h1>");
		expect(p1?.text).not.toContain("Level 2");

		expect(p2?.text).toContain('<h2 id="Level-2">Level 2</h2>');
		expect(p2?.text).toContain('<h3 id="Level-3">Level 3</h3>');
	});

	test("heading keepWithNext: cut point is never placed immediately after a heading", async () => {
		const p1 = "A".repeat(2500);
		const p2 = "B".repeat(2500);
		const markdown = `# Main Title\n\n${p1}\n\n## Next Heading\n\n${p2}`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		const result = await planner.plan(book, options, renderer);
		expect(result.parts.length).toBeGreaterThanOrEqual(2);

		for (const part of result.parts) {
			const units = s.units.slice(part.firstUnit, part.endUnitExclusive);
			if (units.length === 1 && units[0]?.kind === "heading") {
				expect(part.endUnitExclusive).toBe(s.units.length);
			}
		}
	});

	test("exact threshold boundary L-1 / L / L+1 in UTF-8 bytes", async () => {
		const p1 = "Текст на русском языке. ".repeat(100);
		const p2 = "Второй абзац книги. ".repeat(100);
		const markdown = `# Заголовок\n\n${p1}\n\n${p2}`;
		const s = createParsedSource(markdown, "/books/exact.md", "Заголовок", 1);
		const book = createBookModel([s]);

		const fullResult = await planner.plan(
			book,
			makeOptions({ maxChapterBytes: null }),
			renderer,
		);
		expect(fullResult.parts).toHaveLength(1);
		const fullBytes = fullResult.parts[0]?.finalBytes ?? 0;
		expect(fullBytes).toBeGreaterThan(4096);

		const fitResult = await planner.plan(
			book,
			makeOptions({ maxChapterBytes: fullBytes }),
			renderer,
		);
		expect(fitResult.parts).toHaveLength(1);
		expect(fitResult.parts[0]?.finalBytes).toBe(fullBytes);

		const splitResult = await planner.plan(
			book,
			makeOptions({ maxChapterBytes: fullBytes - 1 }),
			renderer,
		);
		expect(splitResult.parts.length).toBeGreaterThanOrEqual(2);
		for (const part of splitResult.parts) {
			expect(part.finalBytes).toBeLessThanOrEqual(fullBytes - 1);
		}
	});

	test("indivisible blocks (fenced code, list, table) are not cut internally", async () => {
		const longCode = "const item = 'val';\n".repeat(150);
		const pAfter = "End paragraph.\n".repeat(100);
		const markdown = `# Title\n\n\`\`\`typescript\n${longCode}\`\`\`\n\n${pAfter}`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		const result = await planner.plan(book, options, renderer);
		expect(result.parts.length).toBeGreaterThanOrEqual(2);

		let foundCode = false;
		for (const part of result.parts) {
			const units = s.units.slice(part.firstUnit, part.endUnitExclusive);
			for (const u of units) {
				if (u.kind === "code") {
					foundCode = true;
					const rendered = result.renderedParts.get(part.id);
					expect(rendered?.text).toContain("<pre><code>");
					expect(rendered?.text).toContain("</code></pre>");
				}
			}
		}
		expect(foundCode).toBe(true);
	});

	test("links across split and forward/backward references resolve to chapter-N.html#id", async () => {
		const p1 = "Text taking space. ".repeat(150);
		const p2 = "Text taking more space. ".repeat(150);
		const markdown = `# Start\n\n[Go to End](#End)\n\n${p1}\n\n## End\n\n[Go back to Start](#Start)\n\n${p2}`;
		const s = createParsedSource(markdown, "/books/links.md", "Start", 1);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
			strictLinks: true,
		});

		const result = await planner.plan(book, options, renderer);
		expect(result.parts.length).toBeGreaterThanOrEqual(2);

		const pFirst = result.renderedParts.get(result.parts[0]?.id ?? "");
		const pLast = result.renderedParts.get(
			result.parts[result.parts.length - 1]?.id ?? "",
		);

		expect(pFirst?.text).toMatch(/href="chapter-\d+\.html#End"/);
		expect(pLast?.text).toMatch(/href="chapter-1\.html#Start"/);
	});

	test("heading preference within fitting prefix during size splitting", async () => {
		const p1 = "A".repeat(1800);
		const p2 = "B".repeat(1800);
		const p3 = "C".repeat(1800);
		const markdown = `# Title\n\n${p1}\n\n## Section Heading\n\n${p2}\n\n${p3}`;
		const s = createParsedSource(markdown, "/books/pref.md", "Title", 1);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		const result = await planner.plan(book, options, renderer);

		const secondPart = result.parts[1];
		expect(secondPart).toBeDefined();
		const firstUnitInSecondPart = s.units[secondPart?.firstUnit ?? 0];
		expect(firstUnitInSecondPart?.kind).toBe("heading");
		expect(firstUnitInSecondPart?.heading?.text).toBe("Section Heading");
	});

	test("semantic navigation outline is unchanged before and after physical splitting", async () => {
		const p1 = "Content A. ".repeat(200);
		const p2 = "Content B. ".repeat(200);
		const markdown = `# Chapter One\n\n## Section A\n\n${p1}\n\n## Section B\n\n${p2}`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const outlineBefore = book.outline;

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		const result = await planner.plan(book, options, renderer);

		expect(book.outline).toEqual(outlineBefore);
		expect(result.parts.length).toBeGreaterThan(1);
	});

	test("singleton oversized: warn policy preserves unit and emits W_OVERSIZE", async () => {
		const hugeText = "A".repeat(5000);
		const markdown = `# Title\n\n${hugeText}`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
			oversizePolicy: "warn",
		});

		const result = await planner.plan(book, options, renderer);

		const oversizeDiag = result.diagnostics.find(
			(d) => d.code === "W_OVERSIZE",
		);
		expect(oversizeDiag).toBeDefined();
		expect(oversizeDiag?.actualBytes).toBeGreaterThan(4096);
		expect(oversizeDiag?.limitBytes).toBe(4096);

		const rendered = [...result.renderedParts.values()]
			.map((r) => r.text)
			.join("");
		expect(rendered).toContain(hugeText);
	});

	test("singleton oversized: error policy throws E_OVERSIZE", async () => {
		const hugeText = "B".repeat(5000);
		const markdown = `# Title\n\n${hugeText}`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
			oversizePolicy: "error",
		});

		expect(planner.plan(book, options, renderer)).rejects.toThrow(
			EpubBuildError,
		);
		try {
			await planner.plan(book, options, renderer);
		} catch (e: unknown) {
			const err = e as EpubBuildError;
			expect(err.code).toBe("E_OVERSIZE");
			expect(err.diagnostics[0]?.code).toBe("E_OVERSIZE");
			expect(err.diagnostics[0]?.actualBytes).toBeGreaterThan(4096);
		}
	});

	test("empty wrapper oversize throws E_WRAPPER_OVERSIZE", async () => {
		const markdown = `# Short\n\nText`;
		const s = createParsedSource(
			markdown,
			"/books/wrapper.md",
			"T".repeat(5000),
		);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		expect(planner.plan(book, options, renderer)).rejects.toThrow(
			EpubBuildError,
		);
		try {
			await planner.plan(book, options, renderer);
		} catch (e: unknown) {
			const err = e as EpubBuildError;
			expect(err.code).toBe("E_WRAPPER_OVERSIZE");
		}
	});

	test("strictLinks true throws E_LINK_UNRESOLVED on broken local link", async () => {
		const markdown = `# Title\n\n[Broken Link](nonexistent.md#nowhere)`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const options = makeOptions({
			strictLinks: true,
		});

		expect(planner.plan(book, options, renderer)).rejects.toThrow(
			EpubBuildError,
		);
		try {
			await planner.plan(book, options, renderer);
		} catch (e: unknown) {
			const err = e as EpubBuildError;
			expect(err.code).toBe("E_LINK_UNRESOLVED");
		}
	});

	test("async payload access works with custom async PayloadStore", async () => {
		const markdown = `# Title\n\nParagraph 1.\n\nParagraph 2.`;
		const s = createParsedSource(markdown);

		const underlyingMap = new Map<string, EpubUnitPayload>(s.payloadStore);
		s.payloadStore.clear();

		let getCount = 0;
		let releaseCount = 0;

		const customStore: PayloadStore = {
			async get(ref: string) {
				getCount++;
				const p = underlyingMap.get(ref);
				if (!p) throw new Error("Not found");
				return p;
			},
			async release(_ref: string) {
				releaseCount++;
			},
		};

		const book: EpubBookModel = {
			...createBookModel([s]),
			payloadStore: customStore,
		};

		const result = await planner.plan(book, makeOptions(), renderer);

		expect(result.parts.length).toBeGreaterThanOrEqual(1);
		expect(getCount).toBeGreaterThan(0);
		expect(releaseCount).toBeGreaterThan(0);
	});

	test("deterministic rerender parity: identical inputs yield identical outputs", async () => {
		const p1 = "Paragraph one. ".repeat(150);
		const p2 = "Paragraph two. ".repeat(150);
		const p3 = "Paragraph three. ".repeat(150);
		const markdown = `# Title\n\n${p1}\n\n${p2}\n\n${p3}`;
		const s1 = createParsedSource(markdown, "/books/doc.md", "Title", 1);
		const s2 = createParsedSource(markdown, "/books/doc.md", "Title", 1);

		const book1 = createBookModel([s1]);
		const book2 = createBookModel([s2]);

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		const res1 = await planner.plan(book1, options, renderer);
		const res2 = await planner.plan(book2, options, renderer);

		expect(res1.parts.length).toBe(res2.parts.length);
		for (let i = 0; i < res1.parts.length; i++) {
			expect(res1.parts[i]?.id).toBe(res2.parts[i]?.id);
			expect(res1.parts[i]?.finalBytes).toBe(res2.parts[i]?.finalBytes);
			const r1 = res1.renderedParts.get(res1.parts[i]?.id ?? "");
			const r2 = res2.renderedParts.get(res2.parts[i]?.id ?? "");
			expect(r1?.text).toBe(r2?.text);
			expect(r1?.sha256).toBe(r2?.sha256);
		}
		expect(res1.report.counters).toEqual(res2.report.counters);
	});

	test("source-scoped target maps isolate duplicate anchors and relative links in different directories", async () => {
		const s1 = createParsedSource(
			'# Source One\n\n<span id="same">Anchor in 1</span>\n\n[Go Same](#same)\n\n[Notes](./notes.md)',
			"/dirA/s1.md",
			"Source One",
			1,
		);
		const s2 = createParsedSource(
			'# Source Two\n\n<span id="same">Anchor in 2</span>\n\n[Go Same](#same)\n\n[Notes](./notes.md)',
			"/dirB/s2.md",
			"Source Two",
			2,
		);
		const s3 = createParsedSource(
			"# Notes A\n\nNotes in dirA.",
			"/dirA/notes.md",
			"Notes A",
			3,
		);
		const s4 = createParsedSource(
			"# Notes B\n\nNotes in dirB.",
			"/dirB/notes.md",
			"Notes B",
			4,
		);

		const book = createBookModel([s1, s2, s3, s4]);
		const options = makeOptions({ strictLinks: true });

		const result = await planner.plan(book, options, renderer);

		const p1 = result.renderedParts.get("chapter-1");
		const p2 = result.renderedParts.get("chapter-2");

		// s1's #same must resolve to chapter-1 and its notes to chapter-3
		expect(p1?.text).toContain('href="chapter-1.html#same"');
		expect(p1?.text).toContain('href="chapter-3.html"');

		// s2's #same must resolve to chapter-2 and its notes to chapter-4
		expect(p2?.text).toContain('href="chapter-2.html#same"');
		expect(p2?.text).toContain('href="chapter-4.html"');
	});

	test("encoded IDs in local fragment links resolve correctly", async () => {
		const markdown = `# Заголовок\n\n## Раздел 1\n\n[Ссылка Encoded](#%D0%A0%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB-1)\n\n[Ссылка Plain](#Раздел-1)`;
		const s = createParsedSource(
			markdown,
			"/books/cyrillic.md",
			"Заголовок",
			1,
		);
		const book = createBookModel([s]);
		const options = makeOptions({ strictLinks: true });

		const result = await planner.plan(book, options, renderer);
		const p1 = result.renderedParts.get("chapter-1");

		expect(p1?.text).toMatch(/href="chapter-1\.html#[^"]+"/);
		// Both encoded and unencoded link occurrences must be resolved without unresolved link errors
		expect(result.report.counters.unresolvedLinks).toBe(0);
		expect(result.report.counters.resolvedLinks).toBe(2);
	});

	test("non-retaining stage B mode: retainRenderedText false stores only metadata and empty text", async () => {
		const p1 = "Content paragraph. ".repeat(50);
		const markdown = `# Title\n\n${p1}`;
		const s = createParsedSource(markdown);
		const book = {
			...createBookModel([s]),
			retainRenderedText: false,
		};

		const result = await planner.plan(book, makeOptions(), renderer);
		const rendered = result.renderedParts.get("chapter-1");

		expect(rendered).toBeDefined();
		expect(rendered?.text).toBe("");
		expect(rendered?.bytes).toBeGreaterThan(100);
		expect(rendered?.sha256).toBeDefined();
		expect(rendered?.bytes).toBe(result.parts[0]?.finalBytes ?? 0);

		// Final caller writes via renderPartToWriter
		const writtenChunks: Uint8Array[] = [];
		const mockWriter = {
			async write(chunk: Uint8Array) {
				writtenChunks.push(chunk);
			},
		};
		const streamed = await renderer.renderPartToWriter(
			result.parts[0]!,
			{
				source: s,
				options: makeOptions(),
			},
			mockWriter,
		);

		expect(streamed.bytes).toBe(rendered!.bytes);
		expect(streamed.sha256).toBe(rendered!.sha256);
		expect(Buffer.concat(writtenChunks).byteLength).toBe(rendered!.bytes);
	});

	test("inline nav is scoped to logical section unit interval rather than entire source outline", async () => {
		const markdown = `# Book Title\n\n## Section One\n\n### Sub 1.1\n\nContent one.\n\n## Section Two\n\n### Sub 2.1\n\nContent two.`;
		const s = createParsedSource(
			markdown,
			"/books/inlinenav.md",
			"Book Title",
			1,
		);
		const book = createBookModel([s]);
		const options = makeOptions({
			splitAt: 2,
			chapterToc: "full",
		});

		const result = await planner.plan(book, options, renderer);

		expect(result.parts.length).toBe(2);
		const p1 = result.renderedParts.get("chapter-1");
		const p2 = result.renderedParts.get("chapter-2");

		// Section One's inline nav must include Sub 1.1 and NOT Section Two or Sub 2.1
		expect(p1?.text).toContain("Sub 1.1");
		expect(p1?.text).not.toContain("Section Two");
		expect(p1?.text).not.toContain("Sub 2.1");

		// Section Two's inline nav must include Sub 2.1 and NOT Section One or Sub 1.1
		expect(p2?.text).toContain("Sub 2.1");
		expect(p2?.text).not.toContain("Section One");
		expect(p2?.text).not.toContain("Sub 1.1");
	});

	test("multi-pass sizing with indivisible unit does not duplicate W_OVERSIZE across passes", async () => {
		const hugeText = "X".repeat(6000);
		// Multi-part source with an indivisible oversized unit plus other paragraphs that cause multiple sizing passes
		const p1 = "A".repeat(3000);
		const p2 = "B".repeat(3000);
		const markdown = `# Title\n\n${hugeText}\n\n${p1}\n\n${p2}`;
		const s = createParsedSource(markdown);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
			oversizePolicy: "warn",
		});

		const result = await planner.plan(book, options, renderer);

		const oversizeDiags = result.diagnostics.filter(
			(d) => d.code === "W_OVERSIZE",
		);
		// Indivisible unit oversize warning must appear exactly once
		expect(oversizeDiags).toHaveLength(1);
		expect(oversizeDiags[0]?.actualBytes).toBeGreaterThan(6000);
	});

	test("provisional multiple cuts per pass handles large paragraph corpus in few passes without quadratic probing", async () => {
		const paragraphs: string[] = [];
		for (let i = 0; i < 40; i++) {
			paragraphs.push(`Paragraph ${i}: ${"Word ".repeat(100)}`);
		}
		const markdown = `# Big Book\n\n${paragraphs.join("\n\n")}`;
		const s = createParsedSource(markdown, "/books/big.md", "Big Book", 1);
		const book = createBookModel([s]);

		const options = makeOptions({
			maxChapterBytes: 4096,
		});

		const result = await planner.plan(book, options, renderer);

		// Must partition into at least 4 parts
		expect(result.parts.length).toBeGreaterThanOrEqual(4);
		// Must terminate in very few passes (<= 3 passes) using provisional multiple cuts per pass
		expect(result.passes).toBeLessThanOrEqual(3);

		for (const part of result.parts) {
			expect(part.finalBytes).toBeLessThanOrEqual(4096);
		}
	});
});
