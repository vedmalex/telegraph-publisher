import type { DstIO } from "../dst/DstIO";
import { EpubBuildError } from "./EpubTypes";

export interface EpubFileStat {
	size: number;
	mtimeMs: number;
	ino?: number;
}
export interface EpubWriter {
	write(bytes: Uint8Array): Promise<void>;
	close(): Promise<void>;
	abort(): Promise<void>;
}
export interface EpubIO {
	base: DstIO;
	readChunks(path: string, signal?: AbortSignal): AsyncIterable<Uint8Array>;
	openWriter(
		path: string,
		options: { exclusive: boolean },
	): Promise<EpubWriter>;
	mkdtemp(parent: string, prefix: string): Promise<string>;
	renameReplace(staged: string, target: string): Promise<void>;
	readRange(path: string, start: number, length: number): Promise<Uint8Array>;
	stat(path: string): Promise<EpubFileStat>;
}
export function checkEpubAbort(signal?: AbortSignal): void {
	if (signal?.aborted)
		throw new EpubBuildError("EPUB build aborted", "E_ABORTED");
}
