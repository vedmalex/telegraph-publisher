import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpubGenerator } from "./EpubGenerator";

describe("EpubGenerator - Large Files & Options Integration", () => {
	let testDir: string;
	let outputDir: string;

	beforeEach(() => {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(7);
		testDir = join(tmpdir(), `epub-large-test-${timestamp}-${random}`);
		outputDir = join(tmpdir(), `epub-large-out-${timestamp}-${random}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(outputDir, { recursive: true });
	});

	afterEach(() => {
		try {
			if (existsSync(testDir))
				rmSync(testDir, { recursive: true, force: true });
			if (existsSync(outputDir))
				rmSync(outputDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	test("splits large markdown file into multiple parts based on maxChapterBytes", async () => {
		const largeFile = join(testDir, "large-chapter.md");
		// Create content with multiple headings, exceeding 4096 bytes
		const sections: string[] = [
			"# Main Chapter Title\n\nIntroduction paragraph.\n\n",
		];
		for (let i = 1; i <= 8; i++) {
			sections.push(
				`## Section ${i}\n\n` +
					`This is section ${i} content. `.repeat(40) +
					"\n\n",
			);
		}
		writeFileSync(largeFile, sections.join("\n"), "utf-8");

		const outputPath = join(outputDir, "split-book.epub");
		const generator = new EpubGenerator({
			outputPath,
			title: "Split Book",
			author: "Author Name",
			maxChapterBytes: 4096, // 4KB limit forces splitting
		});

		await generator.addChapterFromFile(largeFile);
		const report = await generator.generate();

		expect(report).toBeDefined();
		expect(existsSync(outputPath)).toBe(true);
		expect(report.sources.length).toBe(1);
		// The chapter should be planned and split into multiple parts
		expect(report.counters.contentParts).toBeGreaterThan(1);
	});

	test("respects no-auto-split (maxChapterBytes: null) for large files", async () => {
		const largeFile = join(testDir, "no-split.md");
		const sections: string[] = ["# Chapter One\n\n"];
		for (let i = 1; i <= 6; i++) {
			sections.push(
				`## Section ${i}\n\n` +
					"Paragraph line for testing no split mode. ".repeat(40) +
					"\n\n",
			);
		}
		writeFileSync(largeFile, sections.join("\n"), "utf-8");

		const outputPath = join(outputDir, "no-split-book.epub");
		const generator = new EpubGenerator({
			outputPath,
			title: "No Split Book",
			author: "Author Name",
			maxChapterBytes: null, // explicit no auto-split
		});

		await generator.addChapterFromFile(largeFile);
		const report = await generator.generate();

		expect(report.sources.length).toBe(1);
		expect(report.counters.contentParts).toBe(1);
		expect(existsSync(outputPath)).toBe(true);
	});

	test("oversizePolicy 'warn' emits W_OVERSIZE warning for indivisible unit exceeding maxChapterBytes", async () => {
		const oversizeFile = join(testDir, "oversize-warn.md");
		// Single giant paragraph with no sub-headings, exceeding 4096 bytes
		const hugeParagraph =
			"# Single Giant Unit\n\n" + "GiantSentence ".repeat(500) + "\n";
		writeFileSync(oversizeFile, hugeParagraph, "utf-8");

		const outputPath = join(outputDir, "oversize-warn.epub");
		const generator = new EpubGenerator({
			outputPath,
			title: "Oversize Warn",
			author: "Author Name",
			maxChapterBytes: 4096,
			oversizePolicy: "warn",
		});

		await generator.addChapterFromFile(oversizeFile);
		const report = await generator.generate();

		expect(existsSync(outputPath)).toBe(true);
		const hasOversizeWarning = report.diagnostics.some(
			(d) => d.code === "W_OVERSIZE" || d.code === "W_OVERSIZE_BLOCK",
		);
		expect(hasOversizeWarning).toBe(true);
	});

	test("oversizePolicy 'error' throws E_OVERSIZE for indivisible unit exceeding maxChapterBytes", async () => {
		const oversizeFile = join(testDir, "oversize-err.md");
		const hugeParagraph =
			"# Single Giant Unit\n\n" + "Indivisible ".repeat(600) + "\n";
		writeFileSync(oversizeFile, hugeParagraph, "utf-8");

		const outputPath = join(outputDir, "oversize-err.epub");
		const generator = new EpubGenerator({
			outputPath,
			title: "Oversize Error",
			author: "Author Name",
			maxChapterBytes: 4096,
			oversizePolicy: "error",
		});

		await generator.addChapterFromFile(oversizeFile);
		await expect(generator.generate()).rejects.toThrow(
			expect.objectContaining({ code: "E_OVERSIZE" }),
		);
	});

	test("analyze() runs layout planning in dry-run mode without creating EPUB file", async () => {
		const chapterFile = join(testDir, "analyze-test.md");
		writeFileSync(
			chapterFile,
			"# Analyze Chapter\n\nSome body text for dry run testing.\n",
			"utf-8",
		);

		const outputPath = join(outputDir, "dry-run.epub");
		const reportPath = join(outputDir, "dry-run-report.json");
		const generator = new EpubGenerator({
			outputPath,
			title: "Dry Run Book",
			author: "Author Name",
			reportPath,
		});

		await generator.addChapterFromFile(chapterFile);
		const report = await generator.analyze();

		expect(report).toBeDefined();
		expect(report.sources.length).toBe(1);
		expect(report.mode).toBe("dry-run");
		expect(report.outputCommitted).toBe(false);
		// Output EPUB should NOT exist because analyze() is dry run
		expect(existsSync(outputPath)).toBe(false);
		// Report file should be written
		expect(existsSync(reportPath)).toBe(true);
		expect(generator.getLastReport()).toBe(report);
	});

	test("rejects concurrent calls with E_STATE", async () => {
		const chapterFile = join(testDir, "concurrent.md");
		writeFileSync(chapterFile, "# Chapter\n\nText content.\n", "utf-8");

		const outputPath = join(outputDir, "concurrent.epub");
		const generator = new EpubGenerator({
			outputPath,
			title: "Concurrency Book",
			author: "Author Name",
		});

		await generator.addChapterFromFile(chapterFile);

		// Launch generate and simultaneously attempt another operation
		const firstGen = generator.generate();
		await expect(generator.generate()).rejects.toThrow(
			expect.objectContaining({ code: "E_STATE" }),
		);
		await firstGen;
	});
});
