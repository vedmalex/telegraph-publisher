import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { EnhancedCommands } from "./EnhancedCommands";

describe("EnhancedCommands EPUB CLI Integration", () => {
	let testDir: string;
	let outputDir: string;
	let initialExitCode: number | undefined;

	beforeEach(() => {
		initialExitCode = process.exitCode;
		process.exitCode = 0;
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(7);
		testDir = join(tmpdir(), `enhanced-epub-test-${timestamp}-${random}`);
		outputDir = join(tmpdir(), `enhanced-epub-out-${timestamp}-${random}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(outputDir, { recursive: true });
	});

	afterEach(() => {
		process.exitCode = initialExitCode;
		try {
			if (existsSync(testDir))
				rmSync(testDir, { recursive: true, force: true });
			if (existsSync(outputDir))
				rmSync(outputDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	test("addEpubCommand registers the epub command and new options in Commander", () => {
		const program = new Command();
		EnhancedCommands.addEpubCommand(program);

		const epubCmd = program.commands.find((cmd) => cmd.name() === "epub");
		expect(epubCmd).toBeDefined();

		const optionNames = epubCmd?.options.map((opt) => opt.long);
		expect(optionNames).toContain("--max-chapter-size");
		expect(optionNames).toContain("--no-auto-split");
		expect(optionNames).toContain("--oversize-policy");
		expect(optionNames).toContain("--strict-links");
		expect(optionNames).toContain("--epub-report");
		expect(optionNames).toContain("--epub-dry-run");
	});

	test("sets exitCode = 2 on missing author", async () => {
		const file = join(testDir, "test.md");
		writeFileSync(file, "# Test\n\nContent\n");

		await EnhancedCommands.handleEpubCommand({
			file: [file],
		});

		expect(process.exitCode).toBe(2);
	});

	test("sets exitCode = 2 on missing file", async () => {
		await EnhancedCommands.handleEpubCommand({
			author: "Author",
		});

		expect(process.exitCode).toBe(2);
	});

	test("sets exitCode = 2 when combining max-chapter-size with no-auto-split", async () => {
		const file = join(testDir, "test.md");
		writeFileSync(file, "# Test\n\nContent\n");

		await EnhancedCommands.handleEpubCommand({
			file: [file],
			author: "Author",
			maxChapterSize: "300KiB",
			noAutoSplit: true,
		});

		expect(process.exitCode).toBe(2);
	});

	test("sets exitCode = 2 on invalid integer options", async () => {
		const file = join(testDir, "test.md");
		writeFileSync(file, "# Test\n\nContent\n");

		await EnhancedCommands.handleEpubCommand({
			file: [file],
			author: "Author",
			splitAt: "9", // invalid: must be 1..6
		});

		expect(process.exitCode).toBe(2);
	});

	test("sets exitCode = 1 on build error (file not found)", async () => {
		const nonexistent = join(testDir, "missing.md");

		await EnhancedCommands.handleEpubCommand({
			file: [nonexistent],
			author: "Author",
		});

		expect(process.exitCode).toBe(1);
	});

	test("runs dry run successfully with --epub-dry-run without creating EPUB file", async () => {
		const file = join(testDir, "dry.md");
		writeFileSync(file, "# Dry Run Title\n\nSome dry run text\n");
		const outputPath = join(outputDir, "output-dry.epub");

		const report = await EnhancedCommands.handleEpubCommand({
			file: [file],
			author: "Author Name",
			output: outputPath,
			epubDryRun: true,
		});

		expect(process.exitCode).toBe(0);
		expect(report).toBeDefined();
		expect(report?.mode).toBe("dry-run");
		expect(existsSync(outputPath)).toBe(false);
	});

	test("writes build report with --epub-report", async () => {
		const file = join(testDir, "report-test.md");
		writeFileSync(file, "# Report Title\n\nText content\n");
		const outputPath = join(outputDir, "report-book.epub");
		const reportPath = join(outputDir, "build-report.json");

		await EnhancedCommands.handleEpubCommand({
			file: [file],
			author: "Author Name",
			output: outputPath,
			epubReport: reportPath,
		});

		expect(process.exitCode).toBe(0);
		expect(existsSync(outputPath)).toBe(true);
		expect(existsSync(reportPath)).toBe(true);

		const parsedReport = JSON.parse(readFileSync(reportPath, "utf-8"));
		expect(parsedReport.schemaVersion).toBe(1);
		expect(parsedReport.mode).toBe("generate");
		expect(parsedReport.outputCommitted).toBe(true);
	});

	test("generates EPUB successfully with valid options", async () => {
		const file = join(testDir, "chapter.md");
		writeFileSync(file, "# Sample Chapter\n\nSample body paragraph.\n");
		const outputPath = join(outputDir, "valid-book.epub");

		await EnhancedCommands.handleEpubCommand({
			file: [file],
			author: "Author Name",
			output: outputPath,
			title: "Sample Book",
		});

		expect(process.exitCode).toBe(0);
		expect(existsSync(outputPath)).toBe(true);
	});
});
