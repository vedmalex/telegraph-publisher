import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { MockDstIO } from "../dst/MockDstIO";
import { EpubGenerator } from "./EpubGenerator";
import { MockEpubIO } from "./MockEpubIO";

describe("EpubPipeline DST - Deterministic Simulation Testing", () => {
	const SEEDS = [1, 42, 472026];

	test("seed corpus: repeatable deterministic generation with identical SHA across chunk sizes", async () => {
		const complexMarkdown = `# Заголовок Книги 1

Это введение с русским текстом и символами UTF-8: привет мир, санскрит: ॐ नमः शिवाय.

## Раздел 1. Шлоки и стихи

Двустишие с разделителями:
дхарма-кшетре куру-кшетре самвета йуйутсавах |
мамках пандаваш чайва ким акурвата санджайа ||

## Раздел 2. Код и блоки

\`\`\`typescript
function testFence() {
    const x = "nested \`\`\` backticks";
    return x;
}
\`\`\`

## Раздел 3. Ссылки и якоря

Ссылка на [Раздел 1](#раздел-1-шлоки-и-стихи) и ссылка на [Код](#раздел-2-код-и-блоки).
`;

		for (const seed of SEEDS) {
			const hashes: string[] = [];
			// Test with different chunk sizes: 1 byte, 7 bytes, 64 KiB
			const chunkSizes = [1, 7, 65536];

			for (const chunkSize of chunkSizes) {
				const base = new MockDstIO(seed);
				base.setEnv("SOURCE_DATE_EPOCH", "1700000000");
				const mock = new MockEpubIO(base);
				mock.chunkSize = chunkSize;

				const srcFile = "/corpus/book.md";
				const outFile = "/corpus/out.epub";
				mock.base.writeFile(srcFile, complexMarkdown);

				const generator = new EpubGenerator({
					outputPath: outFile,
					title: "Deterministic Book",
					author: "Test Author",
					identifier: "urn:uuid:fixed-seed-uuid",
					runtime: { io: mock },
				});

				await generator.addChapterFromFile(srcFile);
				const report = await generator.generate();
				expect(report.outputCommitted).toBe(true);

				const epubBytes = mock.base.readFileBuffer(outFile);
				expect(epubBytes.length).toBeGreaterThan(0);

				const sha256 = createHash("sha256").update(epubBytes).digest("hex");
				hashes.push(sha256);
				await generator.dispose();
			}

			// Invariant: exact byte determinism across chunk sizes
			expect(hashes[0]).toBe(hashes[1]);
			expect(hashes[1]).toBe(hashes[2]);
		}
	});

	test("chunk boundaries: 1-byte chunks across multibyte UTF-8 characters and code fences", async () => {
		const base = new MockDstIO(42);
		const mock = new MockEpubIO(base);
		mock.chunkSize = 1; // 1-byte chunks!

		const multibyteMarkdown = `# Глава 1: Эмодзи и Юникод 🕉️ 📖 🌸

Текст с 2-байтными, 3-байтными и 4-байтными символами UTF-8:
- Кириллица: Съешь же ещё этих мягких французских булок, да выпей чаю.
- Деванагари: हरे कृष्ण हरे कृष्ण कृष्ण कृष्ण हरे हरे ।
- Символы: ॐ 彁 𠮷 𝄢

\`\`\`markdown
\`\`\`nested fence\`\`\`
Внутри блока кода: Привет 🚀!
\`\`\`

## Подраздел {#custom-anchor}
Содержимое подраздела с [обратной ссылкой](#глава-1-эмодзи-и-юникод-️--).
`;

		mock.base.writeFile("/data/multibyte.md", multibyteMarkdown);
		const outPath = "/data/multibyte.epub";

		const generator = new EpubGenerator({
			outputPath: outPath,
			title: "Multibyte Book",
			author: "Author",
			identifier: "multibyte-test-uuid",
			runtime: { io: mock },
		});

		await generator.addChapterFromFile("/data/multibyte.md");
		const report = await generator.generate();

		expect(report.outputCommitted).toBe(true);
		expect(mock.base.exists(outPath)).toBe(true);

		const readChunkOps = mock.operations.filter((op) => op.kind === "readChunk");
		expect(readChunkOps.length).toBeGreaterThan(100);

		await generator.dispose();
	});

	test("output sentinel: destination file is NEVER modified or corrupted when an error occurs before atomic rename", async () => {
		const SENTINEL_CONTENT = "ORIGINAL_COMPLETE_EPUB_SENTINEL_BYTES_SHA256";

		// Scenario A: Error during reading/scanning
		{
			const base = new MockDstIO(42);
			const mock = new MockEpubIO(base);
			const outPath = "/target/book.epub";
			mock.base.writeFile(outPath, SENTINEL_CONTENT);
			mock.base.writeFile("/target/chapter.md", "# Heading\n\nSome text\n");

			// Inject fault on readChunk
			mock.fail({ operation: "readChunk" });

			const generator = new EpubGenerator({
				outputPath: outPath,
				title: "Sentinel Test",
				author: "Author",
				runtime: { io: mock },
			});

			await expect(generator.addChapterFromFile("/target/chapter.md")).rejects.toThrow();
			expect(mock.base.readFile(outPath)).toBe(SENTINEL_CONTENT);
			await generator.dispose();
		}

		// Scenario B: Error during ZIP packaging write
		{
			const base = new MockDstIO(42);
			const mock = new MockEpubIO(base);
			const outPath = "/target/book.epub";
			mock.base.writeFile(outPath, SENTINEL_CONTENT);
			mock.base.writeFile("/target/chapter.md", "# Heading\n\nSome text\n");

			const generator = new EpubGenerator({
				outputPath: outPath,
				title: "Sentinel Test",
				author: "Author",
				runtime: { io: mock },
			});

			await generator.addChapterFromFile("/target/chapter.md");

			// Inject fault on write during packaging
			mock.fail({ operation: "write" });

			await expect(generator.generate()).rejects.toThrow();

			// Destination MUST still be unmodified sentinel
			expect(mock.base.readFile(outPath)).toBe(SENTINEL_CONTENT);
			await generator.dispose();
		}

		// Scenario C: Error during renameReplace
		{
			const base = new MockDstIO(42);
			const mock = new MockEpubIO(base);
			const outPath = "/target/book.epub";
			mock.base.writeFile(outPath, SENTINEL_CONTENT);
			mock.base.writeFile("/target/chapter.md", "# Heading\n\nSome text\n");

			const generator = new EpubGenerator({
				outputPath: outPath,
				title: "Sentinel Test",
				author: "Author",
				runtime: { io: mock },
			});

			await generator.addChapterFromFile("/target/chapter.md");

			// Inject fault on renameReplace
			mock.fail({ operation: "renameReplace" });

			await expect(generator.generate()).rejects.toThrow();

			// Destination MUST still be unmodified sentinel
			expect(mock.base.readFile(outPath)).toBe(SENTINEL_CONTENT);
			await generator.dispose();
		}

		// Scenario D: Abort signal during generation
		{
			const base = new MockDstIO(42);
			const mock = new MockEpubIO(base);
			const outPath = "/target/book.epub";
			mock.base.writeFile(outPath, SENTINEL_CONTENT);
			mock.base.writeFile("/target/chapter.md", "# Heading\n\nSome text\n");

			const controller = new AbortController();

			const generator = new EpubGenerator({
				outputPath: outPath,
				title: "Sentinel Test",
				author: "Author",
				signal: controller.signal,
				runtime: { io: mock },
			});

			await generator.addChapterFromFile("/target/chapter.md");

			// Abort before generate completes
			controller.abort();

			await expect(generator.generate()).rejects.toThrow();
			expect(mock.base.readFile(outPath)).toBe(SENTINEL_CONTENT);
			await generator.dispose();
		}
	});

	test("error and abort cleanup: writers and temp directories cleaned up on abort/failure before commit", async () => {
		const base = new MockDstIO(42);
		const mock = new MockEpubIO(base);
		const outPath = "/cleanup/book.epub";
		mock.base.writeFile("/cleanup/ch.md", "# Ch\n\nText\n");

		// Track all mkdtemp directories
		const mkdtempDirs: string[] = [];
		const origMkdtemp = mock.mkdtemp.bind(mock);
		mock.mkdtemp = async (parent, prefix) => {
			const dir = await origMkdtemp(parent, prefix);
			mkdtempDirs.push(dir);
			return dir;
		};

		const controller = new AbortController();
		const generator = new EpubGenerator({
			outputPath: outPath,
			title: "Cleanup Test",
			author: "Author",
			signal: controller.signal,
			runtime: { io: mock },
		});

		await generator.addChapterFromFile("/cleanup/ch.md");
		expect(mkdtempDirs.length).toBeGreaterThan(0);
		const sessionDir = mkdtempDirs[0];

		// Inside sessionDir, spool files were written
		const filesInSessionBefore = Array.from(mock.base.readdir(sessionDir));
		expect(filesInSessionBefore.length).toBeGreaterThan(0);

		// Abort
		controller.abort();
		await expect(generator.generate()).rejects.toThrow();

		// All temp files inside sessionDir must be cleaned up and readdir must be empty
		const filesInSessionAfter = Array.from(mock.base.readdir(sessionDir));
		expect(filesInSessionAfter.length).toBe(0);

		// No output file should have been created
		expect(mock.base.exists(outPath)).toBe(false);

		await generator.dispose();
	});

	test("backpressure & drain testing: writer pause and resume", async () => {
		const base = new MockDstIO(42);
		const mock = new MockEpubIO(base);
		// Small high-water mark to trigger multiple backpressure drains
		mock.writerHighWaterMark = 512;

		let drainCount = 0;
		mock.onOperation = (op) => {
			if (op.kind === "drain") {
				drainCount++;
			}
		};

		// Generate markdown larger than highWaterMark
		const largeContent = `# Large Chapter for Backpressure\n\n` +
			"This is a paragraph that will cause multiple chunks and buffers to fill. ".repeat(50) +
			"\n\n## Section 2\n\n" +
			"Another long paragraph with backpressure verification. ".repeat(50);

		mock.base.writeFile("/bp/large.md", largeContent);
		const outPath = "/bp/out.epub";

		const generator = new EpubGenerator({
			outputPath: outPath,
			title: "Backpressure Book",
			author: "Author",
			runtime: { io: mock },
		});

		await generator.addChapterFromFile("/bp/large.md");
		const report = await generator.generate();

		expect(report.outputCommitted).toBe(true);
		expect(drainCount).toBeGreaterThan(0);

		// Test abort during backpressure drain in generate()
		const mockAbort = new MockEpubIO(new MockDstIO(42));
		mockAbort.writerHighWaterMark = 256;
		const abortController = new AbortController();

		mockAbort.base.writeFile("/bp/abort.md", largeContent);
		const genAbort = new EpubGenerator({
			outputPath: "/bp/abort.epub",
			title: "Abort BP",
			author: "Author",
			signal: abortController.signal,
			runtime: { io: mockAbort },
		});

		await genAbort.addChapterFromFile("/bp/abort.md");

		// Attach abort trigger on drain during generate()
		mockAbort.onOperation = async (op) => {
			if (op.kind === "drain") {
				abortController.abort();
			}
		};

		await expect(genAbort.generate()).rejects.toThrow();
		expect(mockAbort.base.exists("/bp/abort.epub")).toBe(false);

		await generator.dispose();
		await genAbort.dispose();
	});

	test("concurrent builds: concurrent builds targeting the same output do not interleave corrupt files", async () => {
		const base = new MockDstIO(42);
		const mock = new MockEpubIO(base);
		const sharedOut = "/shared/output.epub";

		mock.base.writeFile("/shared/chA.md", "# Book A Content\n\nUnique text for book A.\n");
		mock.base.writeFile("/shared/chB.md", "# Book B Content\n\nUnique text for book B.\n");

		const genA = new EpubGenerator({
			outputPath: sharedOut,
			title: "Book A",
			author: "Author A",
			runtime: { io: mock },
		});
		await genA.addChapterFromFile("/shared/chA.md");

		const genB = new EpubGenerator({
			outputPath: sharedOut,
			title: "Book B",
			author: "Author B",
			runtime: { io: mock },
		});
		await genB.addChapterFromFile("/shared/chB.md");

		// Run both concurrently
		const [reportA, reportB] = await Promise.all([
			genA.generate(),
			genB.generate(),
		]);

		expect(reportA.outputCommitted).toBe(true);
		expect(reportB.outputCommitted).toBe(true);

		// Check the output file: must be a valid complete ZIP matching either Book A or Book B
		const finalBytes = mock.base.readFileBuffer(sharedOut);
		// Check PK header
		expect(finalBytes.subarray(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

		// Mimetype must be first and uncompressed
		expect(new TextDecoder().decode(finalBytes.subarray(30, 38))).toBe("mimetype");
		expect(new TextDecoder().decode(finalBytes.subarray(38, 58))).toBe("application/epub+zip");

		await genA.dispose();
		await genB.dispose();
	});

	test("idempotent disposal: calling dispose() multiple times does not throw or double-free resources", async () => {
		const base = new MockDstIO(42);
		const mock = new MockEpubIO(base);
		const outPath = "/disp/book.epub";
		mock.base.writeFile("/disp/ch.md", "# Ch\n\nContent\n");

		const generator = new EpubGenerator({
			outputPath: outPath,
			title: "Disposal Test",
			author: "Author",
			runtime: { io: mock },
		});

		await generator.addChapterFromFile("/disp/ch.md");
		await generator.generate();

		// Multiple calls to dispose
		await expect(generator.dispose()).resolves.toBeUndefined();
		await expect(generator.dispose()).resolves.toBeUndefined();
		await expect(generator.dispose()).resolves.toBeUndefined();
	});
});
