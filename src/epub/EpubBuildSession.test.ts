import { describe, expect, test } from "bun:test";
import { EpubBuildSession } from "./EpubBuildSession";
import { EpubBuildError } from "./EpubTypes";
import { MockEpubIO } from "./MockEpubIO";

describe("EpubBuildSession", () => {
	test("create sets up session directory and properties", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		expect(session.outputPath).toBe("/project/out/book.epub");
		expect(session.directory).toContain(".epub-session-");
		expect(session.state).toBe("new");
		expect(session.outputCommitted).toBe(false);
		expect(session.debug).toBe(false);
		expect(typeof session.modified).toBe("string");
		await session.dispose("success");
	});

	test("SOURCE_DATE_EPOCH validation", async () => {
		const mockValid = new MockEpubIO();
		mockValid.base.setEnv("SOURCE_DATE_EPOCH", "1700000000");
		const s1 = await EpubBuildSession.create("/out/book.epub", mockValid, {
			debug: false,
		});
		expect(s1.modified).toBe(new Date(1700000000 * 1000).toISOString());
		await s1.dispose("success");

		const mockZero = new MockEpubIO();
		mockZero.base.setEnv("SOURCE_DATE_EPOCH", "0");
		const s2 = await EpubBuildSession.create("/out/book.epub", mockZero, {
			debug: false,
		});
		expect(s2.modified).toBe(new Date(0).toISOString());
		await s2.dispose("success");

		// Negative
		const mockNeg = new MockEpubIO();
		mockNeg.base.setEnv("SOURCE_DATE_EPOCH", "-10");
		expect(
			EpubBuildSession.create("/out/book.epub", mockNeg, { debug: false }),
		).rejects.toThrow(EpubBuildError);

		// Non-numeric
		const mockAlpha = new MockEpubIO();
		mockAlpha.base.setEnv("SOURCE_DATE_EPOCH", "123abc");
		expect(
			EpubBuildSession.create("/out/book.epub", mockAlpha, { debug: false }),
		).rejects.toThrow(EpubBuildError);

		// Decimal
		const mockDec = new MockEpubIO();
		mockDec.base.setEnv("SOURCE_DATE_EPOCH", "123.45");
		expect(
			EpubBuildSession.create("/out/book.epub", mockDec, { debug: false }),
		).rejects.toThrow(EpubBuildError);
	});

	test("ownedPath restricts access strictly within session directory", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		const valid = session.ownedPath("chapter-1.xhtml");
		expect(valid.startsWith(session.directory)).toBe(true);

		expect(() => session.ownedPath("../escape.txt")).toThrow(EpubBuildError);
		expect(() => session.ownedPath("/etc/passwd")).toThrow(EpubBuildError);
		expect(() => session.ownedPath("")).toThrow(EpubBuildError);
		expect(() => session.ownedPath(".")).toThrow(EpubBuildError);

		await session.dispose("success");
	});

	test("state transitions enforce canonical forward sequence", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		expect(session.state).toBe("new");
		session.transition("scanning");
		expect(session.state).toBe("scanning");
		session.transition("planning");
		expect(session.state).toBe("planning");
		session.transition("rendering");
		expect(session.state).toBe("rendering");
		session.transition("packaging");
		expect(session.state).toBe("packaging");

		// Attempting invalid jump
		expect(() => session.transition("done")).toThrow(EpubBuildError);
		// Attempting backward transition
		expect(() => session.transition("scanning")).toThrow(EpubBuildError);

		await session.dispose("success");
	});

	test("trackWriter and openWriter abort open writers on session dispose", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		const writer1 = await session.openWriter("writer1.bin");
		const writer2 = await session.openWriter("writer2.bin");

		await writer1.write(new Uint8Array([1, 2, 3]));
		await writer1.close(); // writer 1 closed normally

		await writer2.write(new Uint8Array([4, 5, 6]));
		// writer 2 left unclosed!

		await session.dispose("failure");

		// Writer 2 must have been aborted during session dispose
		expect(writer2.write(new Uint8Array([7]))).rejects.toThrow(EpubBuildError);
	});

	test("finish performs atomic rename, sets outputCommitted and is idempotent", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		// Advance state machine to packaging
		session.transition("scanning");
		session.transition("planning");
		session.transition("rendering");
		session.transition("packaging");

		const stagedPath = session.ownedPath("staged.epub");
		mock.base.writeFile(stagedPath, "EPUB CONTENT");

		await session.finish(stagedPath);
		expect(session.outputCommitted).toBe(true);
		expect(session.state).toBe("done");

		// Staged file should have been moved to outputPath
		expect(mock.base.readFile(session.outputPath)).toBe("EPUB CONTENT");

		// Calling finish again is idempotent
		await expect(session.finish(stagedPath)).resolves.toBeUndefined();

		await session.dispose("success");
	});

	test("finish rejects if state is not packaging", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		const stagedPath = session.ownedPath("staged.epub");
		mock.base.writeFile(stagedPath, "EPUB CONTENT");

		// Still in 'new' state
		await expect(session.finish(stagedPath)).rejects.toThrow(EpubBuildError);

		session.transition("scanning");
		await expect(session.finish(stagedPath)).rejects.toThrow(EpubBuildError);

		await session.dispose("failure");
	});

	test("finish rejects if active writers are still open", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);

		session.transition("scanning");
		session.transition("planning");
		session.transition("rendering");
		session.transition("packaging");

		const writer = await session.openWriter("temp.bin");
		const stagedPath = session.ownedPath("staged.epub");
		mock.base.writeFile(stagedPath, "EPUB CONTENT");

		// Writer is still open!
		await expect(session.finish(stagedPath)).rejects.toThrow(EpubBuildError);

		await writer.close();
		// Now finish succeeds
		await expect(session.finish(stagedPath)).resolves.toBeUndefined();

		await session.dispose("success");
	});

	test("dispose preserves primaryError when cleanup fails", async () => {
		const mock = new MockEpubIO();
		const session = await EpubBuildSession.create(
			"/project/out/book.epub",
			mock,
			{ debug: false },
		);
		mock.base.rm = () => {
			throw new Error("rm failed");
		};

		const primaryErr = new Error("Primary build failure");
		await expect(session.dispose("failure", primaryErr)).rejects.toBe(primaryErr);
		expect(session.diagnostics.some((d) => d.code === "E_CLEANUP")).toBe(true);
	});

	test("sentinel preservation: failure or abort before finish never alters existing output", async () => {
		const mock = new MockEpubIO();
		const finalPath = "/project/out/book.epub";
		mock.base.writeFile(finalPath, "OLD COMPLETE SENTINEL");

		const session = await EpubBuildSession.create(finalPath, mock, {
			debug: false,
		});
		session.transition("scanning");
		session.transition("planning");

		// Inject failure during packaging
		const staged = session.ownedPath("staged.epub");
		mock.base.writeFile(staged, "CORRUPT PARTIAL DATA");

		// Failure occurs
		await session.dispose("failure");

		// Sentinel output file MUST be unchanged!
		expect(mock.base.readFile(finalPath)).toBe("OLD COMPLETE SENTINEL");
		expect(session.outputCommitted).toBe(false);
	});

	test("debug mode preserves manifest and directory; non-debug removes directory", async () => {
		const mockDebug = new MockEpubIO();
		const sessDebug = await EpubBuildSession.create(
			"/project/out/book.epub",
			mockDebug,
			{ debug: true },
		);
		const sessDir = sessDebug.directory;
		await sessDebug.dispose("failure");

		// Manifest must exist in debug directory
		expect(mockDebug.base.exists(`${sessDir}/session-manifest.json`)).toBe(
			true,
		);

		const mockNonDebug = new MockEpubIO();
		const sessNonDebug = await EpubBuildSession.create(
			"/project/out/book.epub",
			mockNonDebug,
			{ debug: false },
		);
		const nonDebugDir = sessNonDebug.directory;
		const marker = sessNonDebug.ownedPath("marker.txt");
		mockNonDebug.base.writeFile(marker, "data");

		await sessNonDebug.dispose("failure");
		expect(mockNonDebug.base.exists(marker)).toBe(false);
		expect(mockNonDebug.base.exists(nonDebugDir)).toBe(false);
	});
});
