import { describe, expect, test } from "bun:test";
import { normalizeEpubOptions, parseByteSize } from "./EpubOptions";

const input = { outputPath: "book.epub", title: "Book", author: "Author" };
describe("EPUB option validation", () => {
	test("strict byte size grammar and limits", () => {
		for (const [raw, expected] of [
			["4096", 4096],
			["300KiB", 307200],
			["1MiB", 1048576],
			["2147483647B", 2147483647],
		] as const)
			expect(parseByteSize(raw)).toBe(expected);
		for (const raw of [
			"0",
			"-1",
			"1.5",
			"2abc",
			"3e5",
			"300KB",
			"Infinity",
			"",
			"04096",
			" 4096",
			"4096 ",
			"2147483648",
			"999999999999999999999MiB",
			"4095",
		])
			expect(() => parseByteSize(raw)).toThrow(
				expect.objectContaining({ code: "E_OPTION" }),
			);
	});
	test("defaults and disabled automatic size split preserve manual split", () => {
		const options = normalizeEpubOptions(input);
		expect(options.maxChapterBytes).toBe(307200);
		expect(options.tocDepth).toBe(Infinity);
		expect(options.bookTocDepth).toBe(2);
		expect(
			normalizeEpubOptions({ ...input, maxChapterBytes: null, splitAt: 2 })
				.maxChapterBytes,
		).toBeNull();
		expect(normalizeEpubOptions({ ...input, tocDepth: 9 }).bookTocDepth).toBe(
			9,
		);
	});
	test("API rejects invalid numeric and enum values", () => {
		for (const patch of [
			{ splitAt: 0 },
			{ splitAt: 7 },
			{ splitAt: 2.5 },
			{ maxChapterBytes: Infinity },
			{ maxChapterBytes: 4095 },
			{ tocDepth: 0 },
			{ navMaxItems: 1 },
			{ oversizePolicy: "silent" },
			{ epubVersion: 4 },
		])
			expect(() =>
				normalizeEpubOptions({ ...input, ...patch } as Parameters<
					typeof normalizeEpubOptions
				>[0]),
			).toThrow(expect.objectContaining({ code: "E_OPTION" }));
		expect(
			normalizeEpubOptions({ ...input, chapterTocDepth: 19 }).chapterTocDepth,
		).toBe(19);
	});
});
