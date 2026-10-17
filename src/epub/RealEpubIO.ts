import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import type { DstIO } from "../dst/DstIO";
import { RealDstIO } from "../dst/RealDstIO";
import {
	checkEpubAbort,
	type EpubFileStat,
	type EpubIO,
	type EpubWriter,
} from "./EpubIO";
import { EpubBuildError } from "./EpubTypes";

export class RealEpubIO implements EpubIO {
	constructor(public readonly base: DstIO = new RealDstIO()) {}

	async *readChunks(
		path: string,
		signal?: AbortSignal,
	): AsyncIterable<Uint8Array> {
		checkEpubAbort(signal);
		const stream = createReadStream(path, { highWaterMark: 64 * 1024 });
		const abort = () =>
			stream.destroy(new EpubBuildError("EPUB build aborted", "E_ABORTED"));
		signal?.addEventListener("abort", abort, { once: true });
		try {
			for await (const chunk of stream) {
				checkEpubAbort(signal);
				yield chunk as Uint8Array;
			}
			checkEpubAbort(signal);
		} finally {
			signal?.removeEventListener("abort", abort);
			stream.destroy();
		}
	}

	async openWriter(
		path: string,
		options: { exclusive: boolean },
	): Promise<EpubWriter> {
		const stream = createWriteStream(path, {
			flags: options.exclusive ? "wx" : "w",
		});
		let failure: Error | undefined;
		stream.on("error", (error) => {
			failure = error;
		});

		try {
			await once(stream, "open");
		} catch (error) {
			stream.destroy();
			throw error;
		}

		let state: "open" | "closed" | "aborted" = "open";

		return {
			async write(bytes: Uint8Array): Promise<void> {
				if (failure) throw failure;
				if (state !== "open") {
					throw new EpubBuildError("Writer is closed", "E_STATE");
				}

				await new Promise<void>((resolve, reject) => {
					let cbFired = false;
					let drained = true;
					let errorFired: Error | undefined;

					const cleanup = () => {
						stream.removeListener("error", onError);
						stream.removeListener("drain", onDrain);
						stream.removeListener("close", onClose);
					};

					const maybeDone = () => {
						if (errorFired) {
							cleanup();
							reject(errorFired);
						} else if (cbFired && drained) {
							cleanup();
							resolve();
						}
					};

					const onError = (err: Error) => {
						errorFired = err;
						maybeDone();
					};

					const onDrain = () => {
						drained = true;
						maybeDone();
					};

					const onClose = () => {
						if (!cbFired || !drained) {
							errorFired =
								errorFired ??
								new EpubBuildError("Writer closed unexpectedly", "E_IO");
							maybeDone();
						}
					};

					stream.on("error", onError);
					stream.on("close", onClose);

					const canContinue = stream.write(bytes, (err) => {
						if (err) errorFired = err;
						cbFired = true;
						maybeDone();
					});

					if (!canContinue) {
						drained = false;
						stream.once("drain", onDrain);
					}
				});
			},

			async close(): Promise<void> {
				if (state !== "open") {
					if (failure) throw failure;
					return;
				}
				state = "closed";
				const completion = finished(stream);
				stream.end();
				await completion;
			},

			async abort(): Promise<void> {
				if (state === "aborted" || state === "closed") return;
				state = "aborted";
				const completion = finished(stream).catch(() => undefined);
				stream.destroy();
				await completion;
			},
		};
	}

	async mkdtemp(parent: string, prefix: string): Promise<string> {
		return mkdtemp(join(parent, prefix));
	}

	async renameReplace(staged: string, target: string): Promise<void> {
		await rename(staged, target);
	}

	async stat(path: string): Promise<EpubFileStat> {
		const info = await stat(path);
		return { size: info.size, mtimeMs: info.mtimeMs, ino: info.ino };
	}

	async readRange(
		path: string,
		start: number,
		length: number,
	): Promise<Uint8Array> {
		if (
			!Number.isSafeInteger(start) ||
			start < 0 ||
			!Number.isSafeInteger(length) ||
			length < 0
		) {
			throw new EpubBuildError("Invalid read range", "E_IO");
		}
		const file = await open(path, "r");
		try {
			const bytes = new Uint8Array(length);
			let read = 0;
			while (read < length) {
				const result = await file.read(
					bytes,
					read,
					length - read,
					start + read,
				);
				if (!result.bytesRead) break;
				read += result.bytesRead;
			}
			return bytes.subarray(0, read);
		} finally {
			await file.close();
		}
	}
}

export function createEpubIO(): EpubIO {
	return new RealEpubIO();
}
