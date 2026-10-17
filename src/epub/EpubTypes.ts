import type { Token } from "marked";
import type { TelegraphNode } from "../telegraphPublisher";

export type { TelegraphNode };

export interface EpubSplitOptions {
	splitAt?: 1 | 2 | 3 | 4 | 5 | 6;
	maxChapterBytes?: number | null; // undefined=307200, null=off
	oversizePolicy?: "warn" | "error";
	strictLinks?: boolean;
	signal?: AbortSignal;
}

export type SourceKey = string;
export type UnitId = string; // s<sourceOrdinal>-u<unitOrdinal>, deterministic
export type TargetId = string; // s<sourceOrdinal>-a<anchorOrdinal>

export interface SourceRange {
	startByte: number;
	endByte: number;
	startLine: number;
	endLine: number;
}

export interface SourceDescriptor {
	key: SourceKey;
	ordinal: number;
	title: string;
	originalBytes: number;
	sha256: string;
	metadata: Record<string, string>;
	sourceSpoolPath?: string;
}

export interface EpubAtomicUnit {
	id: UnitId;
	sourceKey: SourceKey;
	ordinal: number;
	range: SourceRange;
	kind:
		| "heading"
		| "paragraph"
		| "code"
		| "list"
		| "blockquote"
		| "table"
		| "html"
		| "rule"
		| "generated";
	heading?: {
		level: number;
		text: string;
		targetId: TargetId;
	};
	keepWithNext: boolean;
	anchorIds: TargetId[];
	payloadRef: string; // in A memory-store key; B on-disk record key
}

export interface AnchorTarget {
	targetId: TargetId;
	sourceKey: SourceKey;
	unitId: UnitId;
	id: string;
	aliases: string[];
	kind: "heading" | "explicit" | "page" | "source-title";
	ordinal: number;
}

export interface LinkSymbol {
	sourceKey: SourceKey;
	unitId: UnitId;
	nodePath: number[];
	rawHref: string;
	range: SourceRange;
	kind: "content" | "toc" | "page";
}

export interface ChapterPart {
	id: string;
	href: string;
	sourceKey: SourceKey;
	firstUnit: number;
	endUnitExclusive: number;
	logicalSectionId: string;
	reason: "source" | "heading" | "size";
	finalBytes: number;
}

export interface OutlineNode {
	id: string;
	sourceKey: SourceKey;
	level: number;
	label: string;
	targetId: TargetId;
	children: OutlineNode[]; // source root + semantic headings, never physical parts
}

export interface EpubDiagnostic {
	code: string;
	severity: "warning" | "error";
	source?: SourceKey;
	range?: SourceRange;
	unitId?: UnitId;
	href?: string;
	actualBytes?: number;
	limitBytes?: number;
	message: string;
}

export interface EpubBuildReport {
	schemaVersion: 1;
	mode: "generate" | "dry-run";
	outputCommitted: boolean;
	settings: {
		maxChapterBytes: number | null;
		splitAt: number | null;
		oversizePolicy: "warn" | "error";
		strictLinks: boolean;
		epubVersion: 2 | 3;
	};
	sources: Array<{
		path: string;
		sha256: string;
		bytes: number;
		units: number;
	}>;
	documents: Array<{
		href: string;
		kind: "content" | "navigation" | "title-page" | "book-toc";
		bytes: number;
		oversized: boolean;
		splittable: boolean;
	}>;
	counters: {
		sourceBytes: number;
		contentParts: number;
		atomicUnits: number;
		localLinks: number;
		resolvedLinks: number;
		unresolvedLinks: number;
		ambiguousLinks: number;
		anchors: number;
		images: number;
		oversizedDocuments: number;
		maxXhtmlBytes: number;
		layoutPasses: number;
	};
	diagnostics: EpubDiagnostic[];
	artifacts?: { debugDir?: string };
}

export class EpubBuildError extends Error {
	code: string;
	diagnostics: EpubDiagnostic[];
	report?: EpubBuildReport;

	constructor(
		message: string,
		code: string,
		diagnostics: EpubDiagnostic[] = [],
		report?: EpubBuildReport,
	) {
		super(message);
		this.name = "EpubBuildError";
		this.code = code;
		this.diagnostics = diagnostics;
		this.report = report;
	}
}

export interface ImageSymbol {
	sourceKey: SourceKey;
	unitId: UnitId;
	rawSrc: string;
	altText?: string;
	title?: string;
	range?: SourceRange;
}

export interface ReferenceDefinition {
	range?: SourceRange;
	label: string;
	href: string;
	title?: string;
}

export interface PageTarget {
	targetId: TargetId;
	sourceKey: SourceKey;
	unitId: UnitId;
	pageNumber: number;
	label: string;
	id: string;
}

export interface EpubUnitPayload {
	tokens: Token[];
	links: LinkSymbol[];
	images: ImageSymbol[];
}

export interface ParsedSource {
	diagnostics?: EpubDiagnostic[];
	descriptor: SourceDescriptor;
	units: EpubAtomicUnit[];
	payloadStore: Map<string, EpubUnitPayload>;
	anchors: AnchorTarget[];
	outline: OutlineNode[];
	definitions: Map<string, ReferenceDefinition>;
	links: LinkSymbol[];
	pages: PageTarget[];
	images: ImageSymbol[];
	coverage: {
		totalBytes: number;
		coveredBytes: number;
		ranges: SourceRange[];
	};
}

export interface EpubRenderContext {
	diagnostics?: EpubDiagnostic[];
	sourceKey: SourceKey;
	anchors?: AnchorTarget[] | Map<string, AnchorTarget>;
	definitions?:
		| Map<string, ReferenceDefinition>
		| Record<string, { href: string; title?: string }>;
	pageBreaks?: boolean;
	epubVersion?: 2 | 3;
	targetMap?: Map<string, string>;
	imageMap?: Map<string, string>;
}

export interface ParseOptions {
	sourceOrdinal?: number;
	pageBreaks?: boolean;
	metadataMode?: "publication";
	sourceTitle?: string;
}

export type ResolvedLink =
	| { kind: "resolved"; href: string; targetId?: TargetId }
	| { kind: "external"; href: string }
	| { kind: "unresolved"; href: string; diagnostic: EpubDiagnostic }
	| { kind: "ambiguous"; href: string; diagnostic: EpubDiagnostic };

export interface RenderedXhtml {
	text: string;
	bytes: number;
	sha256: string;
	spoolPath?: string;
}
