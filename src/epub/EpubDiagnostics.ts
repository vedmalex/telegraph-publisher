import { relative, resolve, sep } from "node:path";
import type { NormalizedEpubOptions } from "./EpubOptions";
import type {
	EpubBuildReport,
	EpubDiagnostic,
	SourceDescriptor,
} from "./EpubTypes";

export type ReportDocument = EpubBuildReport["documents"][number];
export interface ReportSource {
	descriptor: SourceDescriptor;
	units: number;
}
export interface BuildState {
	inputRoot: string;
	options: Pick<
		NormalizedEpubOptions,
		| "maxChapterBytes"
		| "splitAt"
		| "oversizePolicy"
		| "strictLinks"
		| "epubVersion"
		| "dryRun"
	>;
	outputCommitted: boolean;
	sources: ReportSource[];
	documents: ReportDocument[];
	diagnostics: EpubDiagnostic[];
	counters: Pick<
		EpubBuildReport["counters"],
		| "localLinks"
		| "resolvedLinks"
		| "unresolvedLinks"
		| "ambiguousLinks"
		| "anchors"
		| "images"
		| "layoutPasses"
	>;
	artifacts?: EpubBuildReport["artifacts"];
}
export function createBuildState(
	options: BuildState["options"],
	inputRoot: string,
): BuildState {
	return {
		options,
		inputRoot,
		outputCommitted: false,
		sources: [],
		documents: [],
		diagnostics: [],
		counters: {
			localLinks: 0,
			resolvedLinks: 0,
			unresolvedLinks: 0,
			ambiguousLinks: 0,
			anchors: 0,
			images: 0,
			layoutPasses: 0,
		},
	};
}
function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
/** Snapshot the state; source order and diagnostic order never depend on worker completion. */
export function finalizeReport(state: BuildState): EpubBuildReport {
	const sources = [...state.sources].sort(
		(a, b) =>
			a.descriptor.ordinal - b.descriptor.ordinal ||
			compareText(a.descriptor.key, b.descriptor.key),
	);
	const ordinals = new Map(
		sources.map((source) => [source.descriptor.key, source.descriptor.ordinal]),
	);
	const path = (source: string) =>
		relative(resolve(state.inputRoot), resolve(state.inputRoot, source))
			.split(sep)
			.join("/") || ".";
	const diagnostics = state.diagnostics.map((diagnostic) => ({
		...diagnostic,
		range: diagnostic.range ? { ...diagnostic.range } : undefined,
	}));
	diagnostics.sort(
		(a, b) =>
			(ordinals.get(a.source ?? "") ?? Number.MAX_SAFE_INTEGER) -
				(ordinals.get(b.source ?? "") ?? Number.MAX_SAFE_INTEGER) ||
			(a.range?.startByte ?? -1) - (b.range?.startByte ?? -1) ||
			(a.range?.endByte ?? -1) - (b.range?.endByte ?? -1) ||
			compareText(a.code, b.code) ||
			compareText(a.href ?? "", b.href ?? "") ||
			compareText(a.unitId ?? "", b.unitId ?? "") ||
			compareText(a.message, b.message) ||
			compareText(a.severity, b.severity) ||
			(a.actualBytes ?? -1) - (b.actualBytes ?? -1) ||
			(a.limitBytes ?? -1) - (b.limitBytes ?? -1) ||
			compareText(a.source ?? "", b.source ?? ""),
	);
	for (const diagnostic of diagnostics)
		if (diagnostic.source !== undefined)
			diagnostic.source = path(diagnostic.source);
	const documents = state.documents
		.map((document) => ({
			...document,
			oversized:
				state.options.maxChapterBytes !== null &&
				document.bytes > state.options.maxChapterBytes,
		}))
		.sort((a, b) => compareText(a.href, b.href));
	return {
		schemaVersion: 1,
		mode: state.options.dryRun ? "dry-run" : "generate",
		outputCommitted: state.outputCommitted,
		settings: {
			maxChapterBytes: state.options.maxChapterBytes,
			splitAt: state.options.splitAt ?? null,
			oversizePolicy: state.options.oversizePolicy,
			strictLinks: state.options.strictLinks,
			epubVersion: state.options.epubVersion,
		},
		sources: sources.map((source) => ({
			path: path(source.descriptor.key),
			sha256: source.descriptor.sha256,
			bytes: source.descriptor.originalBytes,
			units: source.units,
		})),
		documents,
		counters: {
			...state.counters,
			sourceBytes: sources.reduce(
				(total, source) => total + source.descriptor.originalBytes,
				0,
			),
			atomicUnits: sources.reduce((total, source) => total + source.units, 0),
			contentParts: documents.filter((document) => document.kind === "content")
				.length,
			oversizedDocuments: documents.filter((document) => document.oversized)
				.length,
			maxXhtmlBytes: documents.reduce(
				(maximum, document) => Math.max(maximum, document.bytes),
				0,
			),
		},
		diagnostics,
		...(state.artifacts ? { artifacts: { ...state.artifacts } } : {}),
	};
}
