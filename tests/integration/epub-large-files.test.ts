import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EnhancedCommands } from "../../src/cli/EnhancedCommands";
import { EpubGenerator } from "../../src/epub/EpubGenerator";

describe("EPUB Large Files Integration Tests", () => {
	let testDir: string;
	let outputDir: string;
	const verifyScriptPath = resolve("scripts/verify-epub-package.py");

	beforeEach(() => {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(7);
		testDir = join(tmpdir(), `epub-integ-test-${timestamp}-${random}`);
		outputDir = join(tmpdir(), `epub-integ-out-${timestamp}-${random}`);
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

	test("multi-chapter book with >300KiB chapter splits into sub-chapters and passes strict EPUB verification", async () => {
		const ch1File = join(testDir, "chapter-1-large.md");
		const ch2File = join(testDir, "chapter-2-small.md");

		// Build a large chapter (~360 KiB) with multiple sections and cross-references
		const ch1Sections: string[] = [
			"# Первая Большая Глава {#root-one}\n\nВводный текст большой главы.\n",
		];

		// Create 20 sections of ~18KB each with shlokas and paragraphs
		for (let i = 1; i <= 20; i++) {
			const unitId = `unit-${i}`;
			const paragraph =
				`Это подробный параграф раздела ${i} с философским анализом и глубоким разбором священных текстов. ` +
				`Вайшнавская традиция уделяет фундаментальное внимание точности передачи шлок и духовному контексту повествования. `.repeat(
					100,
				);
			const shloka =
				`\n\nдхарма-кшетре куру-кшетре самвета йуйутсавах | ${i}\n` +
				`мамках пандаваш чайва ким акурвата санджайа || ${i}\n\n`;

			const crossLink =
				i < 20
					? `Ссылка вперед: [Перейти к следующему разделу](#unit-${i + 1}).\n\n`
					: `Ссылка назад: [Вернуться к началу раздела 1](#unit-1) и в [Корень](#root-one).\n\n`;

			ch1Sections.push(
				`## Раздел ${i} {#${unitId}}\n\n` +
					paragraph +
					shloka +
					crossLink,
			);
		}

		const ch1Content = ch1Sections.join("\n");
		writeFileSync(ch1File, ch1Content, "utf-8");
		expect(Buffer.byteLength(ch1Content, "utf-8")).toBeGreaterThan(320000);

		const ch2Content =
			"# Вторая Глава {#root-two}\n\n" +
			"Короткая вторая глава со ссылкой на [Раздел 5 первой главы](chapter-1-large.md#unit-5).\n";
		writeFileSync(ch2File, ch2Content, "utf-8");

		const outputPath = join(outputDir, "large-book-epub3.epub");
		const reportPath = join(outputDir, "report-epub3.json");

		const generator = new EpubGenerator({
			outputPath,
			title: "Большая Книга",
			author: "Философский Автор",
			epubVersion: 3,
			maxChapterBytes: 307200, // 300 KiB default
			reportPath,
		});

		await generator.addChapterFromFile(ch1File);
		await generator.addChapterFromFile(ch2File);
		const report = await generator.generate();

		expect(report.outputCommitted).toBe(true);
		expect(existsSync(outputPath)).toBe(true);
		expect(existsSync(reportPath)).toBe(true);

		// Source 1 should be present in report
		const src1 = report.sources.find((s) => s.path.endsWith("chapter-1-large.md"));
		expect(src1).toBeDefined();

		// Content documents should have split into multiple parts
		const contentDocs = report.documents.filter((d) => d.kind === "content");
		expect(contentDocs.length).toBeGreaterThan(2);

		// Verify every document is strictly <= 307200 bytes
		for (const doc of report.documents) {
			expect(doc.bytes).toBeLessThanOrEqual(307200);
		}

		// Run verify-epub-package.py
		const verifyReportPath = join(outputDir, "verify-report-epub3.json");
		const pyOutput = execFileSync(
			"python3",
			[
				verifyScriptPath,
				outputPath,
				"--max-xhtml-bytes",
				"307200",
				"--report",
				verifyReportPath,
			],
			{ encoding: "utf-8" },
		);

		expect(pyOutput).toContain("EPUB package verification PASSED");

		const vReport = JSON.parse(readFileSync(verifyReportPath, "utf-8"));
		expect(vReport.valid).toBe(true);
		expect(vReport.errors.length).toBe(0);
		expect(vReport.maxMeasuredXhtmlBytes).toBeLessThanOrEqual(307200);

		await generator.dispose();
	});

	test("generates and verifies EPUB 2 output package", async () => {
		const chFile = join(testDir, "epub2-chapter.md");
		const content =
			"# EPUB 2 Глава {#root-epub2}\n\n" +
			"Текст главы для стандарта EPUB 2.0.1.\n\n" +
			"## Раздел 1 {#part-1}\n\n" +
			"Содержимое раздела 1.\n\n" +
			"## Раздел 2 {#part-2}\n\n" +
			"Содержимое раздела 2 со ссылкой на [Раздел 1](#part-1).\n";
		writeFileSync(chFile, content, "utf-8");

		const outputPath = join(outputDir, "book-epub2.epub");
		const reportPath = join(outputDir, "report-epub2.json");

		const generator = new EpubGenerator({
			outputPath,
			title: "EPUB 2 Book",
			author: "Author 2",
			epubVersion: 2,
			reportPath,
		});

		await generator.addChapterFromFile(chFile);
		const report = await generator.generate();

		expect(report.outputCommitted).toBe(true);
		expect(existsSync(outputPath)).toBe(true);

		// Run verify-epub-package.py
		const verifyReportPath = join(outputDir, "verify-report-epub2.json");
		const pyOutput = execFileSync(
			"python3",
			[verifyScriptPath, outputPath, "--report", verifyReportPath],
			{ encoding: "utf-8" },
		);

		expect(pyOutput).toContain("EPUB package verification PASSED");

		const vReport = JSON.parse(readFileSync(verifyReportPath, "utf-8"));
		expect(vReport.valid).toBe(true);
		expect(vReport.errors.length).toBe(0);

		await generator.dispose();
	});

	test("CLI execution with EnhancedCommands supports multi-chapter, dry-run and reports", async () => {
		const ch1 = join(testDir, "cli-ch1.md");
		const ch2 = join(testDir, "cli-ch2.md");
		writeFileSync(ch1, "# CLI Chapter 1 {#c1}\n\nContent 1\n");
		writeFileSync(ch2, "# CLI Chapter 2 {#c2}\n\nContent 2 with link to [C1](cli-ch1.md#c1)\n");

		const dryRunOut = join(outputDir, "cli-dry.epub");
		const dryRunReport = join(outputDir, "cli-dry-report.json");

		// 1. Dry run test
		const dryReport = await EnhancedCommands.handleEpubCommand({
			file: [ch1, ch2],
			author: "CLI Author",
			output: dryRunOut,
			title: "CLI Book",
			epubDryRun: true,
			epubReport: dryRunReport,
		});

		expect(dryReport).toBeDefined();
		expect(dryReport?.mode).toBe("dry-run");
		expect(existsSync(dryRunOut)).toBe(false);
		expect(existsSync(dryRunReport)).toBe(true);

		const dryJson = JSON.parse(readFileSync(dryRunReport, "utf-8"));
		expect(dryJson.mode).toBe("dry-run");
		expect(dryJson.outputCommitted).toBe(false);

		// 2. Full generation via CLI
		const fullOut = join(outputDir, "cli-full.epub");
		const fullReport = join(outputDir, "cli-full-report.json");

		const genReport = await EnhancedCommands.handleEpubCommand({
			file: [ch1, ch2],
			author: "CLI Author",
			output: fullOut,
			title: "CLI Full Book",
			maxChapterSize: "300KiB",
			epubReport: fullReport,
		});

		expect(genReport).toBeDefined();
		expect(genReport?.mode).toBe("generate");
		expect(existsSync(fullOut)).toBe(true);
		expect(existsSync(fullReport)).toBe(true);

		// Verify CLI output with verify-epub-package.py
		const verifyReport = join(outputDir, "cli-verify-report.json");
		const pyOutput = execFileSync(
			"python3",
			[verifyScriptPath, fullOut, "--report", verifyReport],
			{ encoding: "utf-8" },
		);

		expect(pyOutput).toContain("EPUB package verification PASSED");
		const vReport = JSON.parse(readFileSync(verifyReport, "utf-8"));
		expect(vReport.valid).toBe(true);
	});
});
