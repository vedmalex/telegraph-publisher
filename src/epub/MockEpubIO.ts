import { resolve } from "node:path";
import { DstError } from "../dst/DstIO";
import { MockDstIO } from "../dst/MockDstIO";
import {
	checkEpubAbort,
	type EpubFileStat,
	type EpubIO,
	type EpubWriter,
} from "./EpubIO";
import { EpubBuildError } from "./EpubTypes";

export interface EpubMockOperation {
	ordinal: number;
	kind: string;
	path: string;
}

export interface EpubMockFault {
	operation?: string;
	path?: string;
	ordinal?: number;
	error?: Error;
}

/** Deterministic scheduler; buffer storage is intentionally limited to this test adapter. */
export class MockEpubIO implements EpubIO {
	readonly operations: EpubMockOperation[] = [];
	readonly faults: EpubMockFault[] = [];
	onOperation?: (operation: EpubMockOperation) => void | Promise<void>;
	chunkSize = 64 * 1024;
	writerHighWaterMark?: number;
	private sequence = 0;

	constructor(public readonly base = new MockDstIO()) {}

	fail(fault: EpubMockFault): void {
		this.faults.push(fault);
	}

	private async operation(kind: string, path: string): Promise<void> {
		const resolvedPath = resolve(path);
		const operation = {
			ordinal: this.operations.length + 1,
			kind,
			path: resolvedPath,
		};
		this.operations.push(operation);
		await this.onOperation?.(operation);

		const i = this.faults.findIndex(
			(f) =>
				(!f.operation || f.operation === kind) &&
				(!f.path ||
					resolve(f.path) === resolvedPath ||
					resolvedPath.endsWith(`/${f.path}`) ||
					resolvedPath.endsWith(`\\${f.path}`) ||
					resolvedPath === f.path) &&
				(f.ordinal === undefined || f.ordinal === operation.ordinal),
		);

		if (i >= 0) {
			const [fault] = this.faults.splice(i, 1);
			throw (
				fault?.error ??
				new EpubBuildError(`Injected ${kind} failure: ${path}`, "E_IO")
			);
		}
	}

	async *readChunks(
		path: string,
		signal?: AbortSignal,
	): AsyncIterable<Uint8Array> {
		checkEpubAbort(signal);
		await this.operation("readChunks", path);
		checkEpubAbort(signal);

		const bytes = this.base.readFileBuffer(path);
		if (!Number.isSafeInteger(this.chunkSize) || this.chunkSize <= 0) {
			throw new EpubBuildError("Invalid mock chunk size", "E_STATE");
		}

		for (let offset = 0; offset < bytes.length; offset += this.chunkSize) {
			await this.operation("readChunk", path);
			checkEpubAbort(signal);
			yield bytes.slice(offset, offset + this.chunkSize);
		}
		checkEpubAbort(signal);
	}

	async openWriter(
		path: string,
		options: { exclusive: boolean },
	): Promise<EpubWriter> {
		await this.operation("openWriter", path);
		if (options.exclusive && this.base.exists(path)) {
			throw new DstError(`File exists: ${path}`, "EEXIST");
		}
		this.base.writeFileBuffer(path, new Uint8Array());
		let state: "open" | "closed" | "aborted" = "open";
		let bufferedBytes = 0;

		return {
			write: async (bytes: Uint8Array) => {
				if (state !== "open") {
					throw new EpubBuildError("Writer is closed", "E_STATE");
				}
				await this.operation("write", path);
				bufferedBytes += bytes.length;
				if (
					this.writerHighWaterMark !== undefined &&
					bufferedBytes >= this.writerHighWaterMark
				) {
					await this.operation("drain", path);
					bufferedBytes = 0;
					if (state !== "open") {
						throw new EpubBuildError(
							"Writer aborted during backpressure",
							"E_ABORTED",
						);
					}
				}
				const previous = this.base.readFileBuffer(path);
				const next = new Uint8Array(previous.length + bytes.length);
				next.set(previous);
				next.set(bytes, previous.length);
				this.base.writeFileBuffer(path, next);
			},
			close: async () => {
				if (state !== "open") return;
				await this.operation("close", path);
				state = "closed";
			},
			abort: async () => {
				if (state !== "open") return;
				await this.operation("abort", path);
				state = "aborted";
			},
		};
	}

	async mkdtemp(parent: string, prefix: string): Promise<string> {
		await this.operation("mkdtemp", parent);
		const path = resolve(parent, `${prefix}${++this.sequence}`);
		this.base.mkdir(path, true);
		return path;
	}

	async renameReplace(staged: string, target: string): Promise<void> {
		await this.operation("renameReplace", target);
		const data = this.base.readFileBuffer(staged);
		this.base.writeFileBuffer(target, data);
		this.base.unlink(staged);
	}

	async readRange(
		path: string,
		start: number,
		length: number,
	): Promise<Uint8Array> {
		await this.operation("readRange", path);
		if (
			!Number.isSafeInteger(start) ||
			start < 0 ||
			!Number.isSafeInteger(length) ||
			length < 0
		) {
			throw new EpubBuildError("Invalid read range", "E_IO");
		}
		return this.base.readFileBuffer(path).slice(start, start + length);
	}

	async stat(path: string): Promise<EpubFileStat> {
		await this.operation("stat", path);
		const stat = this.base.stat(path);
		return { size: stat.size, mtimeMs: stat.mtimeMs };
	}
}
