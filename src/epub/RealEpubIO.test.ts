import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpubBuildError } from "./EpubTypes";
import { createEpubIO, RealEpubIO } from "./RealEpubIO";

describe("RealEpubIO", () => {
	let testDir: string;
	let io: RealEpubIO;

	beforeEach(async () => {
		io = new RealEpubIO();
		testDir = await io.mkdtemp(tmpdir(), "real-epub-io-test-");
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {}
	});

	test("factory createEpubIO returns RealEpubIO instance", () => {
		const created = createEpubIO();
		expect(created).toBeInstanceOf(RealEpubIO);
	});

	test("readChunks streams file content with chunking", async () => {
		const filePath = join(testDir, "chunks.bin");
		const data = new Uint8Array(150 * 1024);
		for (let i = 0; i < data.length; i++) data[i] = i % 251;
		writeFileSync(filePath, data);

		const chunks: Uint8Array[] = [];
		let total = 0;
		for await (const chunk of io.readChunks(filePath)) {
			chunks.push(chunk);
			total += chunk.length;
		}

		expect(total).toBe(data.length);
		expect(chunks.length).toBeGreaterThan(1); // 150KB with 64KB highWaterMark -> at least 3 chunks
		const combined = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			combined.set(c, offset);
			offset += c.length;
		}
		expect(combined).toEqual(data);
	});

	test("readChunks respects pre-aborted signal", async () => {
		const filePath = join(testDir, "preabort.txt");
		writeFileSync(filePath, "test data");
		const controller = new AbortController();
		controller.abort();

		const read = async () => {
			for await (const _ of io.readChunks(filePath, controller.signal)) {
			}
		};
		expect(read()).rejects.toThrow(EpubBuildError);
	});

	test("openWriter write, close and backpressure", async () => {
		const filePath = join(testDir, "writer.bin");
		const writer = await io.openWriter(filePath, { exclusive: true });

		const part1 = new TextEncoder().encode("Hello ");
		const part2 = new TextEncoder().encode("World!");
		await writer.write(part1);
		await writer.write(part2);
		await writer.close();

		// Write after close must throw E_STATE
		expect(writer.write(new Uint8Array([1]))).rejects.toThrow(EpubBuildError);

		const stat = await io.stat(filePath);
		expect(stat.size).toBe(part1.length + part2.length);

		const read = await io.readRange(filePath, 0, stat.size);
		expect(new TextDecoder().decode(read)).toBe("Hello World!");
	});

	test("openWriter with exclusive: true fails if file already exists", async () => {
		const filePath = join(testDir, "exclusive.txt");
		writeFileSync(filePath, "already here");

		expect(io.openWriter(filePath, { exclusive: true })).rejects.toThrow();
	});

	test("openWriter abort stops and rejects subsequent writes", async () => {
		const filePath = join(testDir, "aborted.txt");
		const writer = await io.openWriter(filePath, { exclusive: false });
		await writer.write(new TextEncoder().encode("partial"));
		await writer.abort();

		expect(writer.write(new TextEncoder().encode("more"))).rejects.toThrow(
			EpubBuildError,
		);
		// Calling abort again should be safe and idempotent
		await expect(writer.abort()).resolves.toBeUndefined();
	});

	test("renameReplace atomically moves staged file", async () => {
		const staged = join(testDir, "staged.txt");
		const target = join(testDir, "final.txt");
		writeFileSync(staged, "staged content");
		writeFileSync(target, "old content");

		await io.renameReplace(staged, target);

		const targetInfo = await io.stat(target);
		const bytes = await io.readRange(target, 0, targetInfo.size);
		expect(new TextDecoder().decode(bytes)).toBe("staged content");

		// Staged should no longer exist
		expect(io.stat(staged)).rejects.toThrow();
	});

	test("readRange validates bounds and reads slices", async () => {
		const filePath = join(testDir, "range.txt");
		writeFileSync(filePath, "0123456789ABCDEF");

		const slice1 = await io.readRange(filePath, 4, 6);
		expect(new TextDecoder().decode(slice1)).toBe("456789");

		const sliceEnd = await io.readRange(filePath, 12, 10);
		expect(new TextDecoder().decode(sliceEnd)).toBe("CDEF");

		expect(io.readRange(filePath, -1, 5)).rejects.toThrow(EpubBuildError);
		expect(io.readRange(filePath, 0, -2)).rejects.toThrow(EpubBuildError);
	});
});
