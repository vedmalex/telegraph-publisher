import { describe, expect, test } from "bun:test";
import { parseEpubCliOptions } from "./EpubCliOptions";

const base = { file: ["book.md"], author: "Author" };
const parse = (raw: Record<string, unknown>, flags: string[] = []) =>
	parseEpubCliOptions({ ...base, ...raw }, new Set(flags));
describe("pure EPUB CLI validation", () => {
	test("defaults and valid explicitly set fields", () => {
		expect(parse({}).maxChapterBytes).toBeUndefined();
		expect(
			parse({
				maxChapterSize: "300KiB",
				splitAt: "2",
				tocDepth: "8",
				epubVersion: "2",
			}),
		).toMatchObject({
			maxChapterBytes: 307200,
			splitAt: 2,
			tocDepth: 8,
			epubVersion: 2,
		});
		expect(parse({ autoSplit: false, splitAt: "3" })).toMatchObject({
			maxChapterBytes: null,
			splitAt: 3,
		});
	});
	test("size conflicts independent of flag order and commander naming", () => {
		for (const flags of [
			["maxChapterSize", "noAutoSplit"],
			["no-auto-split", "max-chapter-size"],
			["autoSplit", "maxChapterSize"],
			["--max-chapter-size", "--no-auto-split"],
		])
			expect(() =>
				parse({ autoSplit: false, maxChapterSize: "300KiB" }, flags),
			).toThrow(expect.objectContaining({ code: "E_OPTION" }));
	});
	test("never truncates integer strings or silently changes invalid modes", () => {
		for (const field of [
			"splitAt",
			"tocDepth",
			"bookTocDepth",
			"chapterTocDepth",
			"navThreshold",
			"navMaxItems",
		])
			for (const value of ["0", "-1", "2abc", "2.5", "3e5", ""])
				expect(() => parse({ [field]: value })).toThrow();
		for (const raw of [
			{ splitAt: "7" },
			{ navMaxItems: "1" },
			{ epubVersion: "3junk" },
			{ bookToc: "both" },
			{ chapterToc: "bad" },
			{ chapterTocPosition: "bad" },
			{ oversizePolicy: "bad" },
			{ strictLinks: "true" },
			{ file: [] },
			{ author: "" },
		])
			expect(() => parse(raw)).toThrow(
				expect.objectContaining({ code: "E_OPTION" }),
			);
	});
	test("report path cannot overwrite input or output before IO", () => {
		expect(() => parse({ epubReport: "./book.md" })).toThrow();
		expect(() => parse({ epubReport: "./book.epub" })).toThrow();
		expect(
			parse({ epubReport: "report.json", epubDryRun: true }),
		).toMatchObject({ reportPath: "report.json", dryRun: true });
	});
});
