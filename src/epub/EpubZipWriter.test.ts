import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpubBuildError } from "./EpubTypes";
import { EpubZipWriter, type ZipEntry } from "./EpubZipWriter";
import { MockEpubIO } from "./MockEpubIO";
import { RealEpubIO } from "./RealEpubIO";

describe("EpubZipWriter", () => {
	let testDir: string;
	let realIO: RealEpubIO;

	beforeEach(async () => {
		realIO = new RealEpubIO();
		testDir = await realIO.mkdtemp(tmpdir(), "epub-zip-writer-test-");
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {}
	});

	test("real ZIP generation produces valid EPUB package verified by Python zipfile", async () => {
		const mimetypePath = join(testDir, "mimetype");
		const containerPath = join(testDir, "container.xml");
		const opfPath = join(testDir, "content.opf");
		const xhtmlPath = join(testDir, "chapter-1.xhtml");
		const outZipPath = join(testDir, "book.epub");

		writeFileSync(mimetypePath, "application/epub+zip");
		writeFileSync(
			containerPath,
			'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
		);
		writeFileSync(
			opfPath,
			'<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Book</dc:title><dc:identifier id="uid">urn:uuid:12345</dc:identifier><dc:language>en</dc:language></metadata><manifest><item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
		);
		writeFileSync(
			xhtmlPath,
			'<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Test content.</p></body></html>',
		);

		// Entries in random order to verify sorting
		const entries: ZipEntry[] = [
			{ path: xhtmlPath, zipPath: "OEBPS/chapter-1.xhtml" },
			{ path: opfPath, zipPath: "OEBPS/content.opf" },
			{ path: containerPath, zipPath: "META-INF/container.xml" },
			{ path: mimetypePath, zipPath: "mimetype" },
		];

		const receipt = await EpubZipWriter.write(entries, outZipPath, realIO);

		expect(receipt.entryCount).toBe(4);
		const fileStat = statSync(outZipPath);
		expect(receipt.bytes).toBe(fileStat.size);

		const actualFileBytes = readFileSync(outZipPath);
		const expectedHash = createHash("sha256")
			.update(actualFileBytes)
			.digest("hex");
		expect(receipt.sha256).toBe(expectedHash);

		// Verify first header bytes:
		// Bytes 0..3: PK\x03\x04
		expect(actualFileBytes.subarray(0, 4)).toEqual(
			new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
		);
		// Bytes 26..27: filename length (8 for 'mimetype')
		expect(actualFileBytes[26]).toBe(8);
		expect(actualFileBytes[27]).toBe(0);
		// Bytes 28..29: extra field length MUST BE 0 for mimetype
		expect(actualFileBytes[28]).toBe(0);
		expect(actualFileBytes[29]).toBe(0);
		// Bytes 30..37: 'mimetype'
		expect(new TextDecoder().decode(actualFileBytes.subarray(30, 38))).toBe(
			"mimetype",
		);
		// Bytes 38..57: 'application/epub+zip'
		expect(new TextDecoder().decode(actualFileBytes.subarray(38, 58))).toBe(
			"application/epub+zip",
		);

		// Run python zipfile verification to check testzip, date_time, extra, and extract
		const pythonScript = `
import zipfile, sys

with zipfile.ZipFile(sys.argv[1], 'r') as zf:
    test_result = zf.testzip()
    if test_result is not None:
        sys.exit(f"testzip failed on: {test_result}")
    
    infolist = zf.infolist()
    names = [info.filename for info in infolist]
    if names[0] != 'mimetype':
        sys.exit(f"first entry is not mimetype: {names[0]}")
    
    # Check remaining order is lexicographic
    expected_order = ['mimetype', 'META-INF/container.xml', 'OEBPS/chapter-1.xhtml', 'OEBPS/content.opf']
    if names != expected_order:
        sys.exit(f"order mismatch: {names} vs {expected_order}")

    # Check mimetype entry constraints
    mime_info = infolist[0]
    if mime_info.compress_type != zipfile.ZIP_STORED:
        sys.exit("mimetype is compressed")
    if len(mime_info.extra) != 0:
        sys.exit("mimetype has extra fields")
    if mime_info.date_time != (1980, 1, 1, 0, 0, 0):
        sys.exit(f"unexpected timestamp: {mime_info.date_time}")
    
    # Read mimetype
    content = zf.read('mimetype').decode('ascii')
    if content != 'application/epub+zip':
        sys.exit(f"mimetype content mismatch: '{content}'")

print("PYTHON_ZIP_OK")
`;

		const output = execFileSync("python3", ["-c", pythonScript, outZipPath], {
			encoding: "utf-8",
		});
		expect(output.trim()).toBe("PYTHON_ZIP_OK");
	});

	test("rejects archive without mimetype entry", async () => {
		const outZipPath = join(testDir, "no-mime.epub");
		const fPath = join(testDir, "file.txt");
		writeFileSync(fPath, "hello");

		const entries: ZipEntry[] = [{ path: fPath, zipPath: "OEBPS/file.txt" }];

		expect(EpubZipWriter.write(entries, outZipPath, realIO)).rejects.toThrow(
			EpubBuildError,
		);
	});

	test("rejects mimetype entry with trailing whitespace or newline", async () => {
		const outZipPath = join(testDir, "bad-mime.epub");
		const mimePath = join(testDir, "mimetype");
		writeFileSync(mimePath, "application/epub+zip\n"); // invalid trailing newline!

		const entries: ZipEntry[] = [{ path: mimePath, zipPath: "mimetype" }];

		expect(EpubZipWriter.write(entries, outZipPath, realIO)).rejects.toThrow(
			EpubBuildError,
		);
	});

	test("rejects duplicate zipPath entries", async () => {
		const outZipPath = join(testDir, "dup.epub");
		const mimePath = join(testDir, "mimetype");
		writeFileSync(mimePath, "application/epub+zip");
		const fPath = join(testDir, "file.txt");
		writeFileSync(fPath, "content");

		const entries: ZipEntry[] = [
			{ path: mimePath, zipPath: "mimetype" },
			{ path: fPath, zipPath: "OEBPS/doc.xhtml" },
			{ path: fPath, zipPath: "OEBPS/doc.xhtml" },
		];

		expect(EpubZipWriter.write(entries, outZipPath, realIO)).rejects.toThrow(
			EpubBuildError,
		);
	});

	test("rejects invalid path with traversal or absolute path", async () => {
		const outZipPath = join(testDir, "bad-path.epub");
		const mimePath = join(testDir, "mimetype");
		writeFileSync(mimePath, "application/epub+zip");
		const fPath = join(testDir, "file.txt");
		writeFileSync(fPath, "content");

		const entries: ZipEntry[] = [
			{ path: mimePath, zipPath: "mimetype" },
			{ path: fPath, zipPath: "../escape.txt" },
		];

		expect(EpubZipWriter.write(entries, outZipPath, realIO)).rejects.toThrow(
			EpubBuildError,
		);

		const entries2: ZipEntry[] = [
			{ path: mimePath, zipPath: "mimetype" },
			{ path: fPath, zipPath: "a/.." },
		];
		expect(EpubZipWriter.write(entries2, outZipPath, realIO)).rejects.toThrow(
			EpubBuildError,
		);

		const entries3: ZipEntry[] = [
			{ path: mimePath, zipPath: "mimetype" },
			{ path: fPath, zipPath: ".." },
		];
		expect(EpubZipWriter.write(entries3, outZipPath, realIO)).rejects.toThrow(
			EpubBuildError,
		);
	});

	test("abort signal stops writing and aborts destination writer", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/tmp/mime", "application/epub+zip");
		mock.base.writeFile("/tmp/large", "A".repeat(1000));

		const controller = new AbortController();
		mock.onOperation = (op) => {
			if (op.kind === "write") controller.abort();
		};

		const entries: ZipEntry[] = [
			{ path: "/tmp/mime", zipPath: "mimetype" },
			{ path: "/tmp/large", zipPath: "OEBPS/large.txt" },
		];

		expect(
			EpubZipWriter.write(entries, "/tmp/out.epub", mock, controller.signal),
		).rejects.toThrow(EpubBuildError);
	});

	test("injected write failure cleans up and does not overwrite existing output", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/tmp/mime", "application/epub+zip");
		mock.base.writeFile("/tmp/ch1", "content");
		mock.fail({ operation: "write" });

		const entries: ZipEntry[] = [
			{ path: "/tmp/mime", zipPath: "mimetype" },
			{ path: "/tmp/ch1", zipPath: "OEBPS/ch1.xhtml" },
		];

		expect(EpubZipWriter.write(entries, "/tmp/out.epub", mock)).rejects.toThrow(
			EpubBuildError,
		);
	});

	test("instance write method defaults to instance io", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/tmp/mime", "application/epub+zip");

		const writer = new EpubZipWriter(mock);
		const receipt = await writer.write(
			[{ path: "/tmp/mime", zipPath: "mimetype" }],
			"/tmp/instance.epub",
		);

		expect(receipt.entryCount).toBe(1);
		expect(receipt.bytes).toBeGreaterThan(0);
	});
});
