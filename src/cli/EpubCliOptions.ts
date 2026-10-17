import { resolve } from "node:path";
import {
	type EpubInputOptions,
	normalizeEpubOptions,
	optionError,
	parseByteSize,
	positiveInteger,
} from "../epub/EpubOptions";

export interface EpubCliOptions
	extends Omit<EpubInputOptions, "outputPath" | "title" | "author"> {
	file: string[];
	output?: string;
	title?: string;
	author: string;
	withDependencies: boolean;
	verbose: boolean;
}
function stringOption(
	raw: Record<string, unknown>,
	name: string,
): string | undefined {
	const value = raw[name];
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !value.trim())
		optionError(`${name} must be a nonempty string.`);
	return value;
}
function bool(raw: Record<string, unknown>, name: string): boolean | undefined {
	const value = raw[name];
	if (value !== undefined && typeof value !== "boolean")
		optionError(`${name} must be boolean.`);
	return value;
}
function integer(
	raw: Record<string, unknown>,
	name: string,
	minimum = 1,
): number | undefined {
	const value = raw[name];
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value))
		optionError(`${name} must be an integer.`);
	return positiveInteger(Number(value), name, minimum);
}
/** Pure validation: callers must invoke this before reading sources or changing config. */
export function parseEpubCliOptions(
	raw: Record<string, unknown>,
	explicitlySet: ReadonlySet<string>,
): EpubCliOptions {
	const explicit = (camel: string, flag: string) =>
		explicitlySet.has(camel) ||
		explicitlySet.has(flag) ||
		explicitlySet.has(`--${flag}`);
	if (
		explicit("maxChapterSize", "max-chapter-size") &&
		(explicit("noAutoSplit", "no-auto-split") ||
			(explicit("autoSplit", "auto-split") && raw.autoSplit === false))
	)
		optionError("--max-chapter-size cannot be combined with --no-auto-split.");
	const files = raw.file;
	if (
		!Array.isArray(files) ||
		files.length === 0 ||
		files.some((file) => typeof file !== "string" || !file.trim())
	)
		optionError("At least one Markdown file is required (--file).");
	const author = stringOption(raw, "author");
	if (!author) optionError("Author is required (--author).");
	const max = stringOption(raw, "maxChapterSize");
	const autoSplit = bool(raw, "autoSplit");
	const splitAt = integer(raw, "splitAt");
	if (splitAt !== undefined && splitAt > 6)
		optionError("splitAt must be an integer from 1 to 6.");
	const version = stringOption(raw, "epubVersion");
	if (version !== undefined && version !== "2" && version !== "3")
		optionError("EPUB version must be 2 or 3.");
	const input: EpubInputOptions = {
		outputPath: stringOption(raw, "output") ?? "book.epub",
		title: stringOption(raw, "title") ?? "Untitled",
		author,
		maxChapterBytes:
			autoSplit === false
				? null
				: max === undefined
					? undefined
					: parseByteSize(max),
		splitAt: splitAt as EpubInputOptions["splitAt"],
		epubVersion: version === undefined ? undefined : version === "2" ? 2 : 3,
	};
	for (const name of [
		"language",
		"identifier",
		"cover",
		"bookTocTitle",
		"publisher",
		"pubDate",
		"translator",
		"series",
		"description",
		"navCaption",
		"tocTitle",
	] as const)
		input[name] = stringOption(raw, name);
	for (const name of [
		"debug",
		"titlePage",
		"pageBreaks",
		"strictLinks",
		"tocSeparators",
	] as const)
		input[name] = bool(raw, name);
	input.inlineToC = bool(raw, "inlineToc");
	for (const name of [
		"tocDepth",
		"bookTocDepth",
		"chapterTocDepth",
		"navThreshold",
		"navMaxItems",
	] as const)
		input[name] = integer(raw, name, name === "navMaxItems" ? 2 : 1);
	// These values are checked by the shared API validator before being returned.
	input.bookToc = stringOption(raw, "bookToc") as EpubInputOptions["bookToc"];
	input.chapterToc = stringOption(
		raw,
		"chapterToc",
	) as EpubInputOptions["chapterToc"];
	input.chapterTocPosition = stringOption(
		raw,
		"chapterTocPosition",
	) as EpubInputOptions["chapterTocPosition"];
	input.oversizePolicy = stringOption(
		raw,
		"oversizePolicy",
	) as EpubInputOptions["oversizePolicy"];
	input.reportPath = stringOption(raw, "epubReport");
	input.dryRun = bool(raw, "epubDryRun");
	normalizeEpubOptions(input);
	const reportPath = input.reportPath;
	if (
		reportPath &&
		[input.outputPath, ...files].some(
			(path) => resolve(path) === resolve(reportPath),
		)
	)
		optionError(
			"EPUB report path must differ from every input and the output path.",
		);
	const { outputPath: _outputPath, title: _title, ...options } = input;
	return {
		...options,
		file: [...files] as string[],
		output: stringOption(raw, "output"),
		title: stringOption(raw, "title"),
		author,
		withDependencies: bool(raw, "withDependencies") ?? true,
		verbose: bool(raw, "verbose") ?? false,
	};
}
