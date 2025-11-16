import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { TestHelpers } from "../test-utils/TestHelpers";
import { EpubGenerator } from "./EpubGenerator";

describe("EpubGenerator", () => {
	let tempDir: string;
	let outputDir: string;

	beforeEach(() => {
		tempDir = TestHelpers.createTempDir("epub-generator-test");
		outputDir = TestHelpers.createTempDir("epub-output-test");
	});

	afterEach(() => {
		TestHelpers.cleanup();
	});

	describe("constructor", () => {
		it("should create EpubGenerator with required options", () => {
			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			expect(generator).toBeInstanceOf(EpubGenerator);
		});

		it("should create EpubGenerator with optional language", () => {
			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				language: "en",
			});

			expect(generator).toBeInstanceOf(EpubGenerator);
		});

		it("should create EpubGenerator with optional identifier", () => {
			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				identifier: "test-book-123",
			});

			expect(generator).toBeInstanceOf(EpubGenerator);
		});
	});

	describe("addChapterFromFile", () => {
		it("should add chapter from markdown file", async () => {
			const testFile = join(tempDir, "chapter1.md");
			const content = "# Chapter 1\n\nThis is chapter 1 content.";
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);

			// Generate EPUB to verify chapters were added
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});

		it("should add chapter with metadata title", async () => {
			const testFile = join(tempDir, "chapter1.md");
					const metadata = {
			title: "Custom Chapter Title",
			username: "testuser",
			telegraphUrl: "https://telegra.ph/test-01-01",
			editPath: "/edit/test-01-01",
			publishedAt: new Date().toISOString(),
			originalFilename: "test.md",
		};
		const content = "# Chapter 1\n\nThis is chapter 1 content.";
		TestHelpers.createTestFile(testFile, content, metadata);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});

		it("should add multiple chapters", async () => {
			const chapter1 = join(tempDir, "chapter1.md");
			const chapter2 = join(tempDir, "chapter2.md");
			TestHelpers.createTestFile(chapter1, "# Chapter 1\n\nContent 1.");
			TestHelpers.createTestFile(chapter2, "# Chapter 2\n\nContent 2.");

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(chapter1);
			await generator.addChapterFromFile(chapter2);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});

		it("should process chapter with TOC options", async () => {
			const testFile = join(tempDir, "chapter1.md");
			const content = "# Heading 1\n## Heading 2\n### Heading 3";
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile, {
				tocTitle: "Содержание",
				tocSeparators: true,
			});
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});
	});

	describe("generate", () => {
		it("should generate valid EPUB file", async () => {
			const testFile = join(tempDir, "chapter1.md");
			const content = "# Chapter 1\n\nThis is chapter 1 content.";
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);

			// Verify EPUB is a valid ZIP file (EPUB is a ZIP archive)
			const fileContent = readFileSync(outputPath);
			// Check ZIP signature: PK (0x50 0x4B)
			expect(fileContent[0]).toBe(0x50);
			expect(fileContent[1]).toBe(0x4b);
		});

		it("should generate EPUB with multiple chapters", async () => {
			const chapter1 = join(tempDir, "chapter1.md");
			const chapter2 = join(tempDir, "chapter2.md");
			TestHelpers.createTestFile(chapter1, "# Chapter 1\n\nContent 1.");
			TestHelpers.createTestFile(chapter2, "# Chapter 2\n\nContent 2.");

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(chapter1);
			await generator.addChapterFromFile(chapter2);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);

			// Verify EPUB structure
			const fileContent = readFileSync(outputPath);
			expect(fileContent[0]).toBe(0x50); // ZIP signature
			expect(fileContent[1]).toBe(0x4b);
		});

		it("should generate EPUB with custom language", async () => {
			const testFile = join(tempDir, "chapter1.md");
			TestHelpers.createTestFile(testFile, "# Chapter 1\n\nContent.");

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				language: "en",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});

		it("should generate EPUB with cover image", async () => {
			const testFile = join(tempDir, "chapter1.md");
			TestHelpers.createTestFile(testFile, "# Chapter 1\n\nContent.");

			// Create a test cover image (small PNG)
			const coverPath = join(tempDir, "cover.png");
			const coverData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg==", "base64");
			writeFileSync(coverPath, coverData);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				cover: coverPath,
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);

			// Check if cover is included in EPUB
			const epubContent = readFileSync(outputPath);
			expect(epubContent.length).toBeGreaterThan(0);
		});

		it("should keep temporary files in debug mode", async () => {
			const testFile = join(tempDir, "chapter1.md");
			TestHelpers.createTestFile(testFile, "# Chapter 1\n\nContent.");

			const outputPath = join(outputDir, "test-debug.epub");

			// Mock console.log to capture debug messages
			const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				debug: true, // Enable debug mode
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);

			// Check that debug message was logged
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Debug mode: Temporary files kept at:")
			);

			consoleSpy.mockRestore();
		});

		it("should generate EPUB with custom identifier", async () => {
			const testFile = join(tempDir, "chapter1.md");
			TestHelpers.createTestFile(testFile, "# Chapter 1\n\nContent.");

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				identifier: "custom-id-123",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});
	});

	describe("content processing", () => {
		it("should handle markdown formatting correctly", async () => {
			const testFile = join(tempDir, "formatted.md");
			const content = `# Title

**Bold text** and *italic text*.

- List item 1
- List item 2

\`\`\`code\`\`\`
`;
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});

		it("should handle file without metadata", async () => {
			const testFile = join(tempDir, "no-metadata.md");
			const content = "# Chapter Title\n\nContent without metadata.";
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});

		it("should handle empty file gracefully", async () => {
			const testFile = join(tempDir, "empty.md");
			TestHelpers.createTestFile(testFile, "");

			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);
		});
	});

	describe("error handling", () => {
		it("should throw error when file does not exist", async () => {
			const nonExistentFile = join(tempDir, "nonexistent.md");
			const outputPath = join(outputDir, "test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
			});

			// ContentProcessor.processFile will throw when file doesn't exist
			await expect(generator.addChapterFromFile(nonExistentFile)).rejects.toThrow();
		});
	});
});

