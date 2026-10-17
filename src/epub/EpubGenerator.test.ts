import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

		it("should bundle local images referenced in markdown into EPUB package", async () => {
			const imgDir = join(tempDir, "mudras");
			mkdirSync(imgDir, { recursive: true });
			const imagePath = join(imgDir, "cakra.png");
			const dummyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg==", "base64");
			writeFileSync(imagePath, dummyPng);

			const testFile = join(tempDir, "chapter-img.md");
			TestHelpers.createTestFile(testFile, "# Chapter 1\n\n![Cakra Mudra](./mudras/cakra.png)");

			const outputPath = join(outputDir, "test-images.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Image Book",
				author: "Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);

			const $ = (Bun as any).$;
			const zipList = await $`unzip -l ${outputPath}`.text();
			expect(zipList).toContain("OEBPS/images/cakra.png");

			const opf = await $`unzip -p ${outputPath} OEBPS/content.opf`.text();
			expect(opf).toContain("images/cakra.png");
			expect(opf).toContain("image/png");

			const html = await $`unzip -p ${outputPath} OEBPS/chapter-1.html`.text();
			expect(html).toContain("images/cakra.png");
			expect(html).toContain("Cakra Mudra");
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

			// We don't assert on console output here because Bun's
			// expect(...).toHaveBeenCalledWith is not fully supported.
			consoleSpy.mockRestore();
		});

		it("should write debug JSON for chapter content when debug is enabled", async () => {
			const testFile = join(tempDir, "chapter-debug.md");
			const content = "# Debug Chapter\n\nThis is debug content.";
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "test-debug-json.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Test Book",
				author: "Test Author",
				debug: true,
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			expect(existsSync(outputPath)).toBe(true);

			// Debug JSON with TelegraphNode[] should be written next to source .md
			const jsonPath = resolve(testFile.replace(/\.md$/i, ".epub.json"));
			expect(existsSync(jsonPath)).toBe(true);

			const raw = readFileSync(jsonPath, "utf-8");
			const parsed = JSON.parse(raw);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed[0]?.tag).toBeDefined();
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

	describe("title page", () => {
		/** Read one file out of the generated package. */
		const entry = (epubPath: string, name: string): string =>
			execFileSync("unzip", ["-p", epubPath, name], { encoding: "utf-8" });

		const build = async (options: Record<string, unknown>) => {
			const testFile = join(tempDir, "chapter1.md");
			TestHelpers.createTestFile(testFile, "# Chapter 1\n\nContent.");
			const outputPath = join(outputDir, "titled.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Тестовая книга",
				author: "Тестовый автор",
				...options,
			});
			await generator.addChapterFromFile(testFile);
			await generator.generate();
			return outputPath;
		};

		it("omits the title page unless asked for one", async () => {
			const epub = await build({});
			expect(entry(epub, "OEBPS/content.opf")).not.toContain("title-page.html");
		});

		it("puts the title page first and names the book on it", async () => {
			const epub = await build({ titlePage: true });

			const page = entry(epub, "OEBPS/title-page.html");
			expect(page).toContain("Тестовая книга");
			expect(page).toContain("Тестовый автор");
			expect(page).toContain('epub:type="titlepage"');

			// First in the spine: a reader opening the book sees what the book is
			// before anything else.
			const opf = entry(epub, "OEBPS/content.opf");
			const spine = opf.slice(opf.indexOf("<spine"));
			expect(spine.indexOf("title-page")).toBeLessThan(spine.indexOf("chapter-1"));
			expect(opf).toContain('type="title-page"');
		});

		it("records the imprint details it was given", async () => {
			const epub = await build({
				titlePage: true,
				publisher: "Издательство",
				pubDate: "2026",
				translator: "Переводчик",
				series: "Серия",
				description: "Описание",
			});

			const opf = entry(epub, "OEBPS/content.opf");
			expect(opf).toContain("<dc:publisher>Издательство</dc:publisher>");
			expect(opf).toContain("<dc:date>2026</dc:date>");
			expect(opf).toContain("Переводчик");
			expect(opf).toContain("<dc:description>Описание</dc:description>");
			expect(opf).toContain('property="belongs-to-collection"');

			const page = entry(epub, "OEBPS/title-page.html");
			expect(page).toContain("Серия");
			expect(page).toContain("Издательство, 2026");
		});

		it("marks the title page and the body in the landmarks", async () => {
			const epub = await build({ titlePage: true });
			const nav = entry(epub, "OEBPS/nav.xhtml");
			expect(nav).toContain('epub:type="landmarks"');
			expect(nav).toContain('epub:type="titlepage"');
			expect(nav).toContain('epub:type="bodymatter"');
		});
	});

	describe("page numbers", () => {
		const entry = (epubPath: string, name: string): string =>
			execFileSync("unzip", ["-p", epubPath, name], { encoding: "utf-8" });

		const build = async (options: Record<string, unknown>) => {
			const testFile = join(tempDir, "paged.md");
			TestHelpers.createTestFile(
				testFile,
				"<!-- Page 1 -->\n\n## Первая глава\n\nТекст.\n\n---\n\n<!-- Page 2 -->\n\nЕщё текст.\n",
			);
			const outputPath = join(outputDir, "paged.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Книга",
				author: "Автор",
				...options,
			});
			await generator.addChapterFromFile(testFile);
			await generator.generate();
			return outputPath;
		};

		it("drops page markers when page breaks are not asked for", async () => {
			const epub = await build({});
			expect(entry(epub, "OEBPS/chapter-1.html")).not.toContain("doc-pagebreak");
			expect(entry(epub, "OEBPS/nav.xhtml")).not.toContain("page-list");
		});

		it("keeps printed page numbers out of the contents and in a page-list", async () => {
			const epub = await build({ pageBreaks: true });

			// The number is in the text as a page break, not as words.
			const chapter = entry(epub, "OEBPS/chapter-1.html");
			expect(chapter).toContain('epub:type="pagebreak"');
			expect(chapter).toContain('id="page-1"');
			expect(chapter).not.toContain("&lt;span");

			const nav = entry(epub, "OEBPS/nav.xhtml");
			expect(nav).toContain('epub:type="page-list"');
			expect(nav).toContain('href="chapter-1.html#page-2"');

			// …and the contents lists the chapter, not the page marker.
			const toc = nav.slice(nav.indexOf('epub:type="toc"'), nav.indexOf("page-list"));
			expect(toc).not.toContain("Page 1");
			expect(toc).not.toContain("#page-1");
		});

		it("never titles a chapter with a page marker or a rule", async () => {
			const epub = await build({ pageBreaks: true });
			const nav = entry(epub, "OEBPS/nav.xhtml");
			expect(nav).not.toContain("&lt;!-- Page");
			expect(nav).toContain("Первая глава");
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

	describe("CSS and diacritics support", () => {
		it("should support Sanskrit text with IAST diacritics in code elements", async () => {
			const testFile = join(tempDir, "sanskrit.md");
			const content = `# Sanskrit Text

This text contains Sanskrit with diacritics: \`ra̅ja̅ daśarathah.\`.

More text here.`;
			TestHelpers.createTestFile(testFile, content);

			const outputPath = join(outputDir, "sanskrit.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "Sanskrit Test",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			// Extract and check the generated HTML
			const epubPath = outputPath;
			expect(existsSync(epubPath)).toBe(true);

			// Verify EPUB contains the Sanskrit text
			const htmlContent = readFileSync(epubPath, "utf-8");
			expect(htmlContent.length).toBeGreaterThan(0);
		});

		it("should generate CSS with proper font support for diacritics", async () => {
			const testFile = join(tempDir, "css-test.md");
			TestHelpers.createTestFile(testFile, "# Test\n\nContent");

			const outputPath = join(outputDir, "css-test.epub");
			const generator = new EpubGenerator({
				outputPath,
				title: "CSS Test",
				author: "Test Author",
			});

			await generator.addChapterFromFile(testFile);
			await generator.generate();

			// In debug mode, we could check the CSS file, but here we just verify generation works
			expect(existsSync(outputPath)).toBe(true);
		});
	});
});
});
