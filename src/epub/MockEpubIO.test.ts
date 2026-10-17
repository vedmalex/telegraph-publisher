import { describe, expect, test } from "bun:test";
import type { EpubWriter } from "./EpubIO";
import { EpubBuildError } from "./EpubTypes";
import { MockEpubIO } from "./MockEpubIO";

describe("MockEpubIO", () => {
	test("logs operations with ordinal, kind and path", async () => {
		const mock = new MockEpubIO();
		const testPath = "/test/doc.txt";
		const writer = await mock.openWriter(testPath, { exclusive: false });
		await writer.write(new TextEncoder().encode("Hello"));
		await writer.close();

		expect(mock.operations.length).toBeGreaterThanOrEqual(3);
		expect(mock.operations[0].kind).toBe("openWriter");
		expect(mock.operations[1].kind).toBe("write");
		expect(mock.operations[2].kind).toBe("close");
		expect(mock.operations[0].ordinal).toBe(1);
		expect(mock.operations[1].ordinal).toBe(2);
		expect(mock.operations[2].ordinal).toBe(3);
	});

	test("onOperation callback executes on each operation", async () => {
		const mock = new MockEpubIO();
		const seen: string[] = [];
		mock.onOperation = (op) => {
			seen.push(`${op.ordinal}:${op.kind}`);
		};

		const file = "/base/test.txt";
		mock.base.writeFile(file, "content");
		await mock.stat(file);
		await mock.readRange(file, 0, 4);

		expect(seen).toContain("1:stat");
		expect(seen).toContain("2:readRange");
	});

	test("fault matching by operation kind", async () => {
		const mock = new MockEpubIO();
		mock.fail({ operation: "renameReplace" });

		const staged = "/tmp/staged.bin";
		const target = "/tmp/target.bin";
		mock.base.writeFileBuffer(staged, new Uint8Array([1, 2, 3]));

		expect(mock.renameReplace(staged, target)).rejects.toThrow(EpubBuildError);
	});

	test("fault matching by specific path and ordinal", async () => {
		const mock = new MockEpubIO();
		const pathA = "/tmp/fileA.txt";
		const pathB = "/tmp/fileB.txt";

		mock.fail({ operation: "write", path: "fileB.txt" });

		const writerA = await mock.openWriter(pathA, { exclusive: false });
		await expect(
			writerA.write(new TextEncoder().encode("data")),
		).resolves.toBeUndefined();

		const writerB = await mock.openWriter(pathB, { exclusive: false });
		await expect(
			writerB.write(new TextEncoder().encode("data")),
		).rejects.toThrow(EpubBuildError);
	});

	test("configurable chunkSize divides stream chunks precisely", async () => {
		const mock = new MockEpubIO();
		mock.chunkSize = 3;
		const path = "/tmp/chunked.txt";
		mock.base.writeFile(path, "ABCDEFGHIJ"); // 10 bytes -> 3, 3, 3, 1

		const chunks: string[] = [];
		for await (const chunk of mock.readChunks(path)) {
			chunks.push(new TextDecoder().decode(chunk));
		}

		expect(chunks).toEqual(["ABC", "DEF", "GHI", "J"]);
	});

	test("backpressure simulation with writerHighWaterMark and drain operation", async () => {
		const mock = new MockEpubIO();
		mock.writerHighWaterMark = 10;
		const drainEvents: number[] = [];
		mock.onOperation = (op) => {
			if (op.kind === "drain") drainEvents.push(op.ordinal);
		};

		const writer = await mock.openWriter("/tmp/bp.bin", { exclusive: false });
		await writer.write(new Uint8Array(6)); // 6 bytes, below limit -> no drain
		expect(drainEvents.length).toBe(0);

		await writer.write(new Uint8Array(5)); // 6 + 5 = 11 >= 10 -> triggers drain
		expect(drainEvents.length).toBe(1);

		await writer.close();
	});

	test("abort during backpressure rejects in-flight write", async () => {
		const mock = new MockEpubIO();
		mock.writerHighWaterMark = 5;

		const holder: { writer?: EpubWriter } = {};
		mock.onOperation = async (op) => {
			if (op.kind === "drain" && holder.writer) {
				await holder.writer.abort();
			}
		};

		const writer = await mock.openWriter("/tmp/bp-abort.bin", {
			exclusive: false,
		});
		holder.writer = writer;

		// Writing 10 bytes triggers drain, which aborts writer mid-drain
		expect(writer.write(new Uint8Array(10))).rejects.toThrow(EpubBuildError);
	});

	test("openWriter with exclusive fails if file exists", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/tmp/exists.txt", "content");

		expect(
			mock.openWriter("/tmp/exists.txt", { exclusive: true }),
		).rejects.toThrow();
	});
});
