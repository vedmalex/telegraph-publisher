import { createHash } from "node:crypto";
import { crc32 as zlibCrc32 } from "node:zlib";
import { checkEpubAbort, type EpubIO } from "./EpubIO";
import { EpubBuildError } from "./EpubTypes";

export interface ZipEntry {
	path: string;
	zipPath: string;
	bytes?: number;
	crc32?: number;
}

export interface ZipReceipt {
	sha256: string;
	bytes: number;
	entryCount: number;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	crcTable[i] = c >>> 0;
}

export function computeCrc32(data: Uint8Array, previous = 0): number {
	if (typeof zlibCrc32 === "function") {
		return zlibCrc32(data, previous) >>> 0;
	}
	let crc = (previous ^ -1) >>> 0;
	for (let i = 0; i < data.length; i++) {
		crc = (crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
	}
	return (crc ^ -1) >>> 0;
}

interface CentralDirectoryEntry {
	nameBytes: Uint8Array;
	flags: number;
	crc32: number;
	size: number;
	localHeaderOffset: number;
}

function createLocalHeader(
	nameBytes: Uint8Array,
	flags: number,
	crc32: number,
	size: number,
): Uint8Array {
	const header = new Uint8Array(30 + nameBytes.length);
	const view = new DataView(
		header.buffer,
		header.byteOffset,
		header.byteLength,
	);

	view.setUint32(0, 0x04034b50, true);
	view.setUint16(4, 20, true);
	view.setUint16(6, flags, true);
	view.setUint16(8, 0, true);
	view.setUint16(10, 0, true);
	view.setUint16(12, 0x0021, true);
	view.setUint32(14, crc32 >>> 0, true);
	view.setUint32(18, size >>> 0, true);
	view.setUint32(22, size >>> 0, true);
	view.setUint16(26, nameBytes.length, true);
	view.setUint16(28, 0, true);
	header.set(nameBytes, 30);

	return header;
}

function createCentralHeader(entry: CentralDirectoryEntry): Uint8Array {
	const header = new Uint8Array(46 + entry.nameBytes.length);
	const view = new DataView(
		header.buffer,
		header.byteOffset,
		header.byteLength,
	);

	view.setUint32(0, 0x02014b50, true);
	view.setUint16(4, 20, true);
	view.setUint16(6, 20, true);
	view.setUint16(8, entry.flags, true);
	view.setUint16(10, 0, true);
	view.setUint16(12, 0, true);
	view.setUint16(14, 0x0021, true);
	view.setUint32(16, entry.crc32 >>> 0, true);
	view.setUint32(20, entry.size >>> 0, true);
	view.setUint32(24, entry.size >>> 0, true);
	view.setUint16(28, entry.nameBytes.length, true);
	view.setUint16(30, 0, true);
	view.setUint16(32, 0, true);
	view.setUint16(34, 0, true);
	view.setUint16(36, 0, true);
	view.setUint32(38, 0, true);
	view.setUint32(42, entry.localHeaderOffset >>> 0, true);
	header.set(entry.nameBytes, 46);

	return header;
}

function createEOCD(
	entryCount: number,
	centralDirSize: number,
	centralDirOffset: number,
): Uint8Array {
	const eocd = new Uint8Array(22);
	const view = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);

	view.setUint32(0, 0x06054b50, true);
	view.setUint16(4, 0, true);
	view.setUint16(6, 0, true);
	view.setUint16(8, entryCount, true);
	view.setUint16(10, entryCount, true);
	view.setUint32(12, centralDirSize >>> 0, true);
	view.setUint32(16, centralDirOffset >>> 0, true);
	view.setUint16(20, 0, true);

	return eocd;
}

export class EpubZipWriter {
	constructor(readonly io?: EpubIO) {}

	static async write(
		entries: readonly ZipEntry[],
		destination: string,
		io: EpubIO,
		signal?: AbortSignal,
	): Promise<ZipReceipt> {
		const writer = new EpubZipWriter(io);
		return writer.write(entries, destination, io, signal);
	}

	async write(
		entries: readonly ZipEntry[],
		destination: string,
		io?: EpubIO,
		signal?: AbortSignal,
	): Promise<ZipReceipt> {
		const effectiveIO = io ?? this.io;
		if (!effectiveIO) {
			throw new EpubBuildError(
				"EpubIO is required to write zip archive",
				"E_STATE",
			);
		}

		checkEpubAbort(signal);

		if (entries.length > 65535) {
			throw new EpubBuildError(
				`ZIP32 entry limit exceeded: entries count ${entries.length} > 65535`,
				"E_ZIP_LIMIT",
			);
		}

		// Validate paths and ensure single mimetype entry
		let mimetypeEntry: ZipEntry | undefined;
		const otherEntries: ZipEntry[] = [];
		const seenPaths = new Set<string>();

		for (const entry of entries) {
			const normZipPath = entry.zipPath.replace(/\\/g, "/");
			const segments = normZipPath.split("/");
			if (
				normZipPath.startsWith("/") ||
				normZipPath === "" ||
				segments.some((s) => s === ".." || s === ".")
			) {
				throw new EpubBuildError(
					`Invalid ZIP entry path: ${entry.zipPath}`,
					"E_ZIP_LIMIT",
				);
			}
			if (seenPaths.has(normZipPath)) {
				throw new EpubBuildError(
					`Duplicate ZIP entry path: ${entry.zipPath}`,
					"E_ZIP_LIMIT",
				);
			}
			seenPaths.add(normZipPath);

			if (normZipPath === "mimetype") {
				if (mimetypeEntry) {
					throw new EpubBuildError(
						"Multiple mimetype entries found in EPUB package",
						"E_ZIP_LIMIT",
					);
				}
				mimetypeEntry = { ...entry, zipPath: normZipPath };
			} else {
				otherEntries.push({ ...entry, zipPath: normZipPath });
			}
		}

		if (!mimetypeEntry) {
			throw new EpubBuildError(
				"EPUB package must contain a mimetype entry",
				"E_ZIP_LIMIT",
			);
		}

		// Sort remaining entries in lexicographic POSIX order
		otherEntries.sort((a, b) =>
			a.zipPath < b.zipPath ? -1 : a.zipPath > b.zipPath ? 1 : 0,
		);

		const sortedEntries: ZipEntry[] = [mimetypeEntry, ...otherEntries];
		const centralEntries: CentralDirectoryEntry[] = [];

		const totalSha256 = createHash("sha256");
		let totalBytes = 0;

		const writer = await effectiveIO.openWriter(destination, {
			exclusive: false,
		});

		const writeChunk = async (chunk: Uint8Array): Promise<void> => {
			totalSha256.update(chunk);
			totalBytes += chunk.length;
			if (totalBytes > 0xffffffff) {
				throw new EpubBuildError(
					"ZIP32 total archive size exceeded 4GiB limit",
					"E_ZIP_LIMIT",
				);
			}
			await writer.write(chunk);
		};

		try {
			for (const entry of sortedEntries) {
				checkEpubAbort(signal);

				const localHeaderOffset = totalBytes;
				if (localHeaderOffset > 0xffffffff) {
					throw new EpubBuildError(
						`ZIP32 offset limit exceeded for entry: ${entry.zipPath}`,
						"E_ZIP_LIMIT",
					);
				}

				const isMimetype = entry.zipPath === "mimetype";
				const nameBytes = new TextEncoder().encode(entry.zipPath);
				if (nameBytes.length > 65535) {
					throw new EpubBuildError(
						`ZIP filename too long: ${entry.zipPath}`,
						"E_ZIP_LIMIT",
					);
				}

				// Pass 1: compute size and crc32 if not provided
				let entrySize = entry.bytes;
				let entryCrc32 = entry.crc32;

				if (entrySize === undefined || entryCrc32 === undefined) {
					let computedSize = 0;
					let computedCrc = 0;
					for await (const chunk of effectiveIO.readChunks(
						entry.path,
						signal,
					)) {
						checkEpubAbort(signal);
						computedSize += chunk.length;
						computedCrc = computeCrc32(chunk, computedCrc);
					}
					entrySize = computedSize;
					entryCrc32 = computedCrc;
				}

				if (entrySize > 0xffffffff) {
					throw new EpubBuildError(
						`ZIP32 file size exceeded 4GiB limit: ${entry.zipPath}`,
						"E_ZIP_LIMIT",
					);
				}

				if (isMimetype) {
					// EPUB OCF specification: exact bytes 'application/epub+zip', 20 bytes, no newline, no BOM
					if (entrySize !== 20 || entryCrc32 !== 749429103) {
						throw new EpubBuildError(
							"mimetype must contain exact bytes 'application/epub+zip' with no extra whitespace or fields",
							"E_ZIP_LIMIT",
						);
					}
				}

				const flags = isMimetype ? 0x0000 : 0x0800; // UTF-8 filename flag for non-mimetype entries

				// Write local header
				const localHeader = createLocalHeader(
					nameBytes,
					flags,
					entryCrc32,
					entrySize,
				);
				await writeChunk(localHeader);

				// Pass 2: stream file contents with backpressure
				let streamedBytes = 0;
				let streamedCrc = 0;
				for await (const chunk of effectiveIO.readChunks(entry.path, signal)) {
					checkEpubAbort(signal);
					streamedBytes += chunk.length;
					streamedCrc = computeCrc32(chunk, streamedCrc);
					await writeChunk(chunk);
				}

				if (streamedBytes !== entrySize || streamedCrc !== entryCrc32) {
					throw new EpubBuildError(
						`File content changed during zip streaming: ${entry.path}`,
						"E_IO",
					);
				}

				centralEntries.push({
					nameBytes,
					flags,
					crc32: entryCrc32,
					size: entrySize,
					localHeaderOffset,
				});
			}

			// Write Central Directory
			checkEpubAbort(signal);
			const centralDirStartOffset = totalBytes;
			if (centralDirStartOffset > 0xffffffff) {
				throw new EpubBuildError(
					"ZIP32 central directory start offset exceeded 4GiB limit",
					"E_ZIP_LIMIT",
				);
			}

			let centralDirSize = 0;
			for (const cdEntry of centralEntries) {
				checkEpubAbort(signal);
				const cdHeader = createCentralHeader(cdEntry);
				centralDirSize += cdHeader.length;
				if (centralDirSize > 0xffffffff) {
					throw new EpubBuildError(
						"ZIP32 central directory size exceeded 4GiB limit",
						"E_ZIP_LIMIT",
					);
				}
				await writeChunk(cdHeader);
			}

			// Write End of Central Directory (EOCD)
			checkEpubAbort(signal);
			const eocd = createEOCD(
				sortedEntries.length,
				centralDirSize,
				centralDirStartOffset,
			);
			await writeChunk(eocd);

			await writer.close();

			return {
				sha256: totalSha256.digest("hex"),
				bytes: totalBytes,
				entryCount: sortedEntries.length,
			};
		} catch (error) {
			await writer.abort().catch(() => undefined);
			throw error;
		}
	}
}
