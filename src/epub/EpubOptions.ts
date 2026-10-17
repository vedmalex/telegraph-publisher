import { resolve } from "node:path";
import type { EpubIO } from "./EpubIO";
import { EpubBuildError, type EpubSplitOptions } from "./EpubTypes";

export interface EpubInputOptions extends EpubSplitOptions {
	outputPath: string;
	title: string;
	author: string;
	language?: string;
	identifier?: string;
	cover?: string;
	debug?: boolean;
	tocDepth?: number;
	bookToc?: "start" | "end";
	bookTocDepth?: number;
	bookTocTitle?: string;
	epubVersion?: 2 | 3;
	titlePage?: boolean;
	pageBreaks?: boolean;
	publisher?: string;
	pubDate?: string;
	translator?: string;
	series?: string;
	description?: string;
	chapterToc?: "none" | "blocks" | "full" | "auto";
	chapterTocDepth?: number;
	chapterTocPosition?: "start" | "end" | "both";
	navThreshold?: number;
	navMaxItems?: number;
	navCaption?: string;
	inlineToC?: boolean;
	tocTitle?: string;
	tocSeparators?: boolean;
	reportPath?: string;
	inputRoot?: string;
	dryRun?: boolean;
	runtime?: { io: EpubIO };
}
export interface NormalizedEpubOptions extends EpubInputOptions {
	language: string;
	debug: boolean;
	tocDepth: number;
	bookTocDepth: number;
	bookTocTitle: string;
	epubVersion: 2 | 3;
	titlePage: boolean;
	pageBreaks: boolean;
	maxChapterBytes: number | null;
	oversizePolicy: "warn" | "error";
	strictLinks: boolean;
	chapterToc: "none" | "blocks" | "full" | "auto";
	navThreshold: number;
	navMaxItems: number;
	navCaption: string;
	dryRun: boolean;
}
export const DEFAULT_MAX_CHAPTER_BYTES = 307200;
export function optionError(message: string): never {
	throw new EpubBuildError(message, "E_OPTION", [
		{ code: "E_OPTION", severity: "error", message },
	]);
}
function size(value: number): number {
	if (!Number.isSafeInteger(value) || value < 4096 || value > 2147483647)
		optionError(
			"Chapter size must be an integer from 4096 to 2147483647 bytes.",
		);
	return value;
}
export function parseByteSize(value: string): number {
	const match = /^(0|[1-9][0-9]*)(B|KiB|MiB)?$/.exec(value);
	if (!match)
		optionError(
			"Invalid chapter size. Use integer bytes, B, KiB or MiB (for example 300KiB).",
		);
	return size(
		Number(match[1]) *
			(match[2] === "MiB" ? 1048576 : match[2] === "KiB" ? 1024 : 1),
	);
}
export function positiveInteger(
	value: number,
	name: string,
	minimum = 1,
): number {
	if (!Number.isSafeInteger(value) || value < minimum)
		optionError(`${name} must be a safe integer of at least ${minimum}.`);
	return value;
}
function enumValue<T extends string | number>(
	value: unknown,
	values: readonly T[],
	name: string,
): void {
	if (value !== undefined && !values.includes(value as T))
		optionError(`Invalid ${name}: expected ${values.join(" | ")}.`);
}
export function normalizeEpubOptions(
	input: EpubInputOptions,
): NormalizedEpubOptions {
	for (const name of ["outputPath", "title", "author"] as const) {
		if (typeof input[name] !== "string" || !input[name].trim())
			optionError(`${name} must be a nonempty string.`);
	}
	for (const name of [
		"language",
		"identifier",
		"cover",
		"reportPath",
		"inputRoot",
	] as const) {
		if (
			input[name] !== undefined &&
			(typeof input[name] !== "string" || !input[name]?.trim())
		)
			optionError(`${name} must be a nonempty string.`);
	}
	for (const name of [
		"debug",
		"titlePage",
		"pageBreaks",
		"strictLinks",
		"dryRun",
		"inlineToC",
		"tocSeparators",
	] as const) {
		if (input[name] !== undefined && typeof input[name] !== "boolean")
			optionError(`${name} must be boolean.`);
	}
	if (
		input.reportPath &&
		resolve(input.reportPath) === resolve(input.outputPath)
	)
		optionError("Report path must differ from outputPath.");
	if (input.maxChapterBytes !== undefined && input.maxChapterBytes !== null)
		size(input.maxChapterBytes);
	if (
		input.splitAt !== undefined &&
		(!Number.isInteger(input.splitAt) || input.splitAt < 1 || input.splitAt > 6)
	)
		optionError("splitAt must be an integer from 1 to 6.");
	for (const name of [
		"tocDepth",
		"bookTocDepth",
		"chapterTocDepth",
		"navThreshold",
		"navMaxItems",
	] as const) {
		if (input[name] !== undefined)
			positiveInteger(input[name], name, name === "navMaxItems" ? 2 : 1);
	}
	enumValue(input.oversizePolicy, ["warn", "error"], "oversize policy");
	enumValue(input.epubVersion, [2, 3], "EPUB version");
	enumValue(input.bookToc, ["start", "end"], "book ToC position");
	enumValue(
		input.chapterToc,
		["none", "blocks", "full", "auto"],
		"chapter ToC mode",
	);
	enumValue(
		input.chapterTocPosition,
		["start", "end", "both"],
		"chapter ToC position",
	);
	return {
		...input,
		language: input.language ?? "ru",
		debug: input.debug ?? false,
		tocDepth: input.tocDepth ?? Infinity,
		bookTocDepth: input.bookTocDepth ?? input.tocDepth ?? 2,
		bookTocTitle: input.bookTocTitle ?? "Содержание",
		epubVersion: input.epubVersion ?? 3,
		titlePage: input.titlePage ?? false,
		pageBreaks: input.pageBreaks ?? false,
		maxChapterBytes:
			input.maxChapterBytes === undefined
				? DEFAULT_MAX_CHAPTER_BYTES
				: input.maxChapterBytes,
		oversizePolicy: input.oversizePolicy ?? "warn",
		strictLinks: input.strictLinks ?? false,
		chapterToc:
			input.chapterToc ??
			(input.inlineToC === true
				? "full"
				: input.inlineToC === false
					? "none"
					: "auto"),
		navThreshold: input.navThreshold ?? 30,
		navMaxItems: input.navMaxItems ?? 12,
		navCaption: input.navCaption ?? "К тексту:",
		dryRun: input.dryRun ?? false,
	};
}
