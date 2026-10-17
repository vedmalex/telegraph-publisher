import { describe, expect, test } from "bun:test";
import type { Token } from "marked";
import { EpubBuildSession } from "./EpubBuildSession";
import { EpubSpoolStore } from "./EpubSpoolStore";
import { EpubBuildError, type EpubUnitPayload } from "./EpubTypes";
import { MockEpubIO } from "./MockEpubIO";

describe("EpubSpoolStore", () => {
	const samplePayload1: EpubUnitPayload = {
		tokens: [
			{
				type: "paragraph",
				raw: "Unit 1",
				text: "Unit 1",
			} as unknown as Token,
		],
		links: [],
		images: [],
	};

	const samplePayload2: EpubUnitPayload = {
		tokens: [
			{
				type: "paragraph",
				raw: "Unit 2",
				text: "Unit 2",
			} as unknown as Token,
		],
		links: [],
		images: [],
	};

	test("put and get store and load payloads correctly", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});
		const store = new EpubSpoolStore(session);

		const ref1 = await store.put("s1-u1", samplePayload1);
		expect(ref1.startsWith(session.directory)).toBe(true);

		const loaded = await store.get(ref1);
		expect(loaded.tokens.length).toBe(1);
		expect(loaded.tokens[0].raw).toBe("Unit 1");

		await store.dispose();
		await session.dispose("success");
	});

	test("duplicate unitId in put throws E_STATE", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});
		const store = new EpubSpoolStore(session);

		await store.put("s1-u1", samplePayload1);
		expect(store.put("s1-u1", samplePayload1)).rejects.toThrow(EpubBuildError);

		await store.dispose();
		await session.dispose("success");
	});

	test("active payload caching holds at most one unit in memory", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});
		const store = new EpubSpoolStore(session);

		const ref1 = await store.put("s1-u1", samplePayload1);
		const ref2 = await store.put("s1-u2", samplePayload2);

		// First get loads ref1 from disk
		const p1 = await store.get(ref1);
		const opsCountAfterFirstGet = mock.operations.length;

		// Second get of ref1 should return cached object without disk read
		const p1Cached = await store.get(ref1);
		expect(p1Cached).toBe(p1);
		expect(mock.operations.length).toBe(opsCountAfterFirstGet); // No new readRange

		// Loading ref2 should evict ref1 from cache
		const p2 = await store.get(ref2);
		expect(p2.tokens[0].raw).toBe("Unit 2");

		// Release ref2
		await store.release(ref2);

		// Now get ref2 again must hit disk
		const opsCountBeforeReload = mock.operations.length;
		await store.get(ref2);
		expect(mock.operations.length).toBeGreaterThan(opsCountBeforeReload);

		await store.dispose();
		await session.dispose("success");
	});

	test("corrupt or truncated spool file throws E_PARSE or E_IO", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});
		const store = new EpubSpoolStore(session);

		const ref = await store.put("s1-u1", samplePayload1);

		// Overwrite with invalid JSON
		mock.base.writeFile(ref, "CORRUPT JSON CONTENT");
		await store.release(ref); // clear cache
		expect(store.get(ref)).rejects.toThrow(EpubBuildError);

		// Truncated file
		mock.base.writeFile(ref, '{"tokens":[');
		expect(store.get(ref)).rejects.toThrow(EpubBuildError);

		await store.dispose();
		await session.dispose("success");
	});

	test("dispose unlinks records in non-debug mode and forbids further access", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});
		const store = new EpubSpoolStore(session);

		const ref = await store.put("s1-u1", samplePayload1);
		expect(mock.base.exists(ref)).toBe(true);

		await store.dispose();
		expect(mock.base.exists(ref)).toBe(false);

		// Access after dispose throws E_STATE
		expect(store.get(ref)).rejects.toThrow(EpubBuildError);
		expect(store.put("s1-u2", samplePayload2)).rejects.toThrow(EpubBuildError);

		await session.dispose("success");
	});
});
