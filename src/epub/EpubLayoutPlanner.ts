import type { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import { createBuildState, finalizeReport } from "./EpubDiagnostics";
import {
	renderBookToc,
	renderInlineNavigation,
	renderNav,
} from "./EpubNavigation";
import type { NormalizedEpubOptions } from "./EpubOptions";
import { renderEpubTokens } from "./EpubTokenRenderer";
import {
	type ChapterPart,
	EpubBuildError,
	type EpubDiagnostic,
	type EpubRenderContext,
	type EpubUnitPayload,
	type OutlineNode,
	type PageTarget,
	type ParsedSource,
	type RenderedXhtml,
} from "./EpubTypes";
import {
	type EpubXhtmlRenderer,
	escapeXml,
	hasMatchingFirstH1,
	type PayloadStore,
	type RenderContext,
	serializeNode,
} from "./EpubXhtmlRenderer";

export interface EpubBookModel {
	sources: readonly ParsedSource[];
	payloadStore?: PayloadStore | Map<string, EpubUnitPayload>;
	anchorRegistry: EpubAnchorRegistry;
	outline: readonly OutlineNode[];
	pages?: readonly PageTarget[];
	imageMap?: Map<string, string>;
	targetMap?: Map<string, string>;
	sourceTargetMaps?: Map<string, Map<string, string>>;
	retainRenderedText?: boolean;
}

export interface LayoutResult {
	parts: ChapterPart[];
	documents: EpubBuildReport["documents"];
	renderedParts: Map<string, RenderedXhtml>;
	report: EpubBuildReport;
	diagnostics: EpubDiagnostic[];
	passes: number;
}

async function resolvePayload(
	store: PayloadStore | Map<string, EpubUnitPayload> | undefined,
	ref: string,
): Promise<EpubUnitPayload> {
	if (!store) {
		throw new EpubBuildError(
			`No payload store available for ref: ${ref}`,
			"E_STATE",
		);
	}
	if (store instanceof Map) {
		const payload = store.get(ref);
		if (!payload) {
			throw new EpubBuildError(`Payload not found: ${ref}`, "E_STATE");
		}
		return payload;
	}
	const payload = await store.get(ref);
	if (!payload) {
		throw new EpubBuildError(`Payload not found: ${ref}`, "E_STATE");
	}
	return payload;
}

async function releasePayload(
	store: PayloadStore | Map<string, EpubUnitPayload> | undefined,
	ref: string,
): Promise<void> {
	if (store && !(store instanceof Map) && typeof store.release === "function") {
		await store.release(ref);
	}
}

function renderTitlePage(options: NormalizedEpubOptions): string {
	const language = escapeXml(options.language ?? "ru");
	const epub3 = (options.epubVersion ?? 3) === 3;
	const doctype = epub3
		? "<!DOCTYPE html>"
		: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
	const htmlAttrs = epub3
		? `xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}"`
		: `xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}"`;

	const lines = [
		`\t\t<h1 class="title-main">${escapeXml(options.title)}</h1>`,
		options.series
			? `\t\t<p class="title-series">${escapeXml(options.series)}</p>`
			: "",
		options.author
			? `\t\t<p class="title-author">${escapeXml(options.author)}</p>`
			: "",
		options.translator
			? `\t\t<p class="title-translator">${escapeXml(options.translator)}</p>`
			: "",
		options.description
			? `\t\t<p class="title-description">${escapeXml(options.description)}</p>`
			: "",
		options.publisher || options.pubDate
			? `\t\t<p class="title-imprint">${escapeXml([options.publisher, options.pubDate].filter(Boolean).join(", "))}</p>`
			: "",
	]
		.filter(Boolean)
		.join("\n");

	const sectionTag = epub3
		? '<section epub:type="titlepage" class="title-page">'
		: '<div class="title-page">';
	const closeTag = epub3 ? "</section>" : "</div>";

	return `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n<html ${htmlAttrs}>\n<head>\n\t<meta charset="UTF-8"/>\n\t<title>${escapeXml(options.title)}</title>\n\t<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n\t${sectionTag}\n${lines}\n\t${closeTag}\n</body>\n</html>\n`;
}

function filterOutlineNodes(
	nodes: readonly OutlineNode[],
	targetIds: Set<string>,
): OutlineNode[] {
	const result: OutlineNode[] = [];
	for (const node of nodes) {
		const matchingChildren = filterOutlineNodes(node.children, targetIds);
		if (targetIds.has(node.targetId)) {
			result.push({
				...node,
				children: matchingChildren,
			});
		} else if (matchingChildren.length > 0) {
			result.push(...matchingChildren);
		}
	}
	return result;
}

function computeScopedInlineNav(
	sectionPartsMap: Map<string, ChapterPart[]>,
	book: EpubBookModel,
	options: NormalizedEpubOptions,
): Map<string, { start: string; end: string }> {
	const inlineNavMap = new Map<string, { start: string; end: string }>();
	for (const [secId, secParts] of sectionPartsMap) {
		const firstPart = secParts[0];
		if (!firstPart) continue;
		const source = book.sources.find(
			(s) => s.descriptor.key === firstPart.sourceKey,
		);
		if (!source) continue;

		const firstUnit = Math.min(...secParts.map((p) => p.firstUnit));
		const endUnit = Math.max(...secParts.map((p) => p.endUnitExclusive));
		const secUnits = source.units.slice(firstUnit, endUnit);
		const secTargetIds = new Set<string>();
		for (const u of secUnits) {
			if (u.heading?.targetId) {
				secTargetIds.add(u.heading.targetId);
			}
		}
		const scopedOutline = filterOutlineNodes(source.outline, secTargetIds);
		const nav = renderInlineNavigation(
			scopedOutline,
			book.anchorRegistry,
			options,
		);
		inlineNavMap.set(secId, nav);
	}
	return inlineNavMap;
}

async function buildSourceTargetMaps(
	book: EpubBookModel,
): Promise<Map<string, Map<string, string>>> {
	const sourceTargetMaps =
		book.sourceTargetMaps ?? new Map<string, Map<string, string>>();

	for (const source of book.sources) {
		let sMap = sourceTargetMaps.get(source.descriptor.key);
		if (!sMap) {
			sMap = new Map<string, string>();
			sourceTargetMaps.set(source.descriptor.key, sMap);
		}
		for (const unit of source.units) {
			const payload = await resolvePayload(
				book.payloadStore ?? source.payloadStore,
				unit.payloadRef,
			);
			try {
				for (const link of payload.links) {
					const res = book.anchorRegistry.resolve(
						link.sourceKey,
						link.rawHref,
					);
					if (res.kind === "resolved") {
						sMap.set(link.rawHref, res.href);
						try {
							const decoded = decodeURI(link.rawHref);
							if (decoded !== link.rawHref) {
								sMap.set(decoded, res.href);
							}
						} catch {}
						try {
							const encoded = encodeURI(link.rawHref);
							if (encoded !== link.rawHref) {
								sMap.set(encoded, res.href);
							}
						} catch {}
						if (book.targetMap) {
							book.targetMap.set(link.rawHref, res.href);
						}
					}
				}
			} finally {
				await releasePayload(
					book.payloadStore ?? source.payloadStore,
					unit.payloadRef,
				);
			}
		}
	}
	return sourceTargetMaps;
}

async function getUnitPrefixSums(
	source: ParsedSource,
	payloadStore: PayloadStore | Map<string, EpubUnitPayload> | undefined,
	options: NormalizedEpubOptions,
	unitPrefixSumsCache: Map<string, number[]>,
	targetMap?: Map<string, string>,
): Promise<number[]> {
	let prefix = unitPrefixSumsCache.get(source.descriptor.key);
	if (prefix) return prefix;

	prefix = new Array(source.units.length + 1);
	prefix[0] = 0;

	for (let i = 0; i < source.units.length; i++) {
		const unit = source.units[i]!;
		const payload = await resolvePayload(
			payloadStore ?? source.payloadStore,
			unit.payloadRef,
		);
		try {
			const renderCtx: EpubRenderContext = {
				sourceKey: source.descriptor.key,
				pageBreaks: options.pageBreaks,
				epubVersion: options.epubVersion,
				targetMap,
				definitions: source.definitions,
				anchors: source.anchors,
			};
			const nodes = renderEpubTokens(payload.tokens, renderCtx);
			const markup = nodes.map(serializeNode).join("\n");
			const unitBytes = markup
				? Buffer.byteLength(`${markup}\n`, "utf8")
				: 0;
			prefix[i + 1] = prefix[i]! + unitBytes;
		} finally {
			await releasePayload(
				payloadStore ?? source.payloadStore,
				unit.payloadRef,
			);
		}
	}

	unitPrefixSumsCache.set(source.descriptor.key, prefix);
	return prefix;
}

function estimatePartOverhead(
	firstUnit: number,
	source: ParsedSource,
	renderer: EpubXhtmlRenderer,
	options: NormalizedEpubOptions,
	inlineNav?: { start: string; end: string },
	isFirstInSec?: boolean,
	isLastInSec?: boolean,
): number {
	let overhead = renderer.measureEmptyWrapper(options, source) + 1; // 1 for \n after <body>
	if (firstUnit === 0) {
		if (!hasMatchingFirstH1(source)) {
			overhead += Buffer.byteLength(
				`<h1 id="source-root-${source.descriptor.ordinal}">${escapeXml(source.descriptor.title)}</h1>\n`,
				"utf8",
			);
		}
	} else {
		overhead += Buffer.byteLength(
			`<div class="epub-continuation">${escapeXml(source.descriptor.title)} (продолжение)</div>\n`,
			"utf8",
		);
	}
	if (isFirstInSec && inlineNav?.start) {
		overhead += Buffer.byteLength(`${inlineNav.start}\n`, "utf8");
	}
	if (isLastInSec && inlineNav?.end) {
		overhead += Buffer.byteLength(`${inlineNav.end}\n`, "utf8");
	}
	return overhead;
}

export class EpubLayoutPlanner {
	async plan(
		book: EpubBookModel,
		normalizedOptions: NormalizedEpubOptions,
		renderer: EpubXhtmlRenderer,
	): Promise<LayoutResult> {
		const retainText = book.retainRenderedText ?? true;
		const unitPrefixSumsCache = new Map<string, number[]>();

		// 1. Verify empty wrapper size
		if (normalizedOptions.maxChapterBytes !== null) {
			for (const source of book.sources) {
				const emptySize = renderer.measureEmptyWrapper(
					normalizedOptions,
					source,
				);
				if (emptySize > normalizedOptions.maxChapterBytes) {
					const diag: EpubDiagnostic = {
						code: "E_WRAPPER_OVERSIZE",
						severity: "error",
						source: source.descriptor.key,
						actualBytes: emptySize,
						limitBytes: normalizedOptions.maxChapterBytes,
						message: `Empty XHTML wrapper (${emptySize} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
					};
					throw new EpubBuildError(diag.message, "E_WRAPPER_OVERSIZE", [diag]);
				}
			}
		}

		// 2. Initial partition: source separation + mandatory splitAt boundaries
		const initialParts: ChapterPart[] = [];
		for (const source of book.sources) {
			const sections: {
				firstUnit: number;
				endUnitExclusive: number;
				sourceKey: string;
				logicalSectionId: string;
			}[] = [];

			let sectionStart = 0;
			let sectionIdx = 0;

			for (let i = 1; i < source.units.length; i++) {
				const unit = source.units[i];
				if (!unit) continue;
				if (
					normalizedOptions.splitAt !== undefined &&
					normalizedOptions.splitAt !== null &&
					unit.kind === "heading" &&
					unit.heading &&
					unit.heading.level <= normalizedOptions.splitAt &&
					source.units[i - 1]?.keepWithNext === false
				) {
					sections.push({
						firstUnit: sectionStart,
						endUnitExclusive: i,
						sourceKey: source.descriptor.key,
						logicalSectionId: `sec-${source.descriptor.ordinal}-${sectionIdx++}`,
					});
					sectionStart = i;
				}
			}
			sections.push({
				firstUnit: sectionStart,
				endUnitExclusive: source.units.length,
				sourceKey: source.descriptor.key,
				logicalSectionId: `sec-${source.descriptor.ordinal}-${sectionIdx}`,
			});

			for (const [s, sec] of sections.entries()) {
				initialParts.push({
					id: "",
					href: "",
					sourceKey: sec.sourceKey,
					firstUnit: sec.firstUnit,
					endUnitExclusive: sec.endUnitExclusive,
					logicalSectionId: sec.logicalSectionId,
					reason: s === 0 ? "source" : "heading",
					finalBytes: 0,
				});
			}
		}

		// 3. Iterative refinement loop with monotonic cuts and cached estimates
		let parts = initialParts;
		const totalUnits = book.sources.reduce(
			(sum, s) => sum + s.units.length,
			0,
		);
		const maxPasses = totalUnits + 1;
		let pass = 0;

		const diagnostics: EpubDiagnostic[] = [];
		let renderedParts = new Map<string, RenderedXhtml>();

		while (true) {
			pass++;
			if (pass > maxPasses) {
				const diag: EpubDiagnostic = {
					code: "E_LAYOUT_STALLED",
					severity: "error",
					message: `Layout stalled: exceeded maximum passes (${maxPasses})`,
				};
				throw new EpubBuildError(diag.message, "E_LAYOUT_STALLED", [diag]);
			}

			// Number parts
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part) {
					part.id = `chapter-${i + 1}`;
					part.href = `chapter-${i + 1}.html`;
				}
			}

			// Assign to registry
			book.anchorRegistry.assignParts(parts);

			// Build sourceTargetMaps from registry
			const sourceTargetMaps = await buildSourceTargetMaps(book);

			// Group parts by logical section
			const sectionPartsMap = new Map<string, ChapterPart[]>();
			for (const p of parts) {
				const list = sectionPartsMap.get(p.logicalSectionId) ?? [];
				list.push(p);
				sectionPartsMap.set(p.logicalSectionId, list);
			}

			// Compute scoped inline navigation per logical section
			const inlineNavMap = computeScopedInlineNav(
				sectionPartsMap,
				book,
				normalizedOptions,
			);

			let anyCompositeSplit = false;
			const nextParts: ChapterPart[] = [];
			renderedParts = new Map<string, RenderedXhtml>();

			for (const part of parts) {
				const source = book.sources.find(
					(s) => s.descriptor.key === part.sourceKey,
				);
				if (!source) {
					throw new EpubBuildError(
						`Unknown source key: ${part.sourceKey}`,
						"E_STATE",
					);
				}
				const secParts = sectionPartsMap.get(part.logicalSectionId) ?? [part];
				const isFirst = secParts[0] === part;
				const isLast = secParts[secParts.length - 1] === part;
				const inlineNav = inlineNavMap.get(part.logicalSectionId);

				const renderContext: RenderContext = {
					source,
					payloadStore: book.payloadStore ?? source.payloadStore,
					registry: book.anchorRegistry,
					options: normalizedOptions,
					targetMap: sourceTargetMaps.get(part.sourceKey),
					sourceTargetMaps,
					imageMap: book.imageMap,
					inlineNav,
					isFirstPartInLogicalSection: isFirst,
					isLastPartInLogicalSection: isLast,
					retainText,
				};

				const rendered = await renderer.renderPart(part, renderContext);
				part.finalBytes = rendered.bytes;
				renderedParts.set(part.id, rendered);

				if (
					normalizedOptions.maxChapterBytes !== null &&
					part.finalBytes > normalizedOptions.maxChapterBytes
				) {
					// Safe cut points inside this part
					const safeCuts: number[] = [];
					for (
						let u = part.firstUnit + 1;
						u < part.endUnitExclusive;
						u++
					) {
						if (source.units[u - 1]?.keepWithNext === false) {
							safeCuts.push(u);
						}
					}

					if (safeCuts.length === 0) {
						// Indivisible singleton overflow
						if (normalizedOptions.oversizePolicy === "error") {
							const unitId = source.units[part.firstUnit]?.id;
							const diag: EpubDiagnostic = {
								code: "E_OVERSIZE",
								severity: "error",
								source: part.sourceKey,
								unitId,
								range: source.units[part.firstUnit]?.range,
								actualBytes: part.finalBytes,
								limitBytes: normalizedOptions.maxChapterBytes,
								message: `Indivisible unit ${unitId ?? part.id} (${part.finalBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
							};
							throw new EpubBuildError(diag.message, "E_OVERSIZE", [
								diag,
							]);
						}
						// With warn policy, keep indivisible part; W_OVERSIZE will be reported cleanly in final validation
						nextParts.push(part);
					} else {
						// Composite overflow: provisional multiple cuts per pass using cached estimates and exact boundary verification
						const prefixSums = await getUnitPrefixSums(
							source,
							book.payloadStore ?? source.payloadStore,
							normalizedOptions,
							unitPrefixSumsCache,
							sourceTargetMaps.get(part.sourceKey),
						);

						let currentStart = part.firstUnit;
						while (currentStart < part.endUnitExclusive) {
							const remainingSafeCuts = safeCuts.filter(
								(c) => c > currentStart && c < part.endUnitExclusive,
							);
							if (remainingSafeCuts.length === 0) {
								nextParts.push({
									id: "",
									href: "",
									sourceKey: part.sourceKey,
									firstUnit: currentStart,
									endUnitExclusive: part.endUnitExclusive,
									logicalSectionId: part.logicalSectionId,
									reason:
										currentStart === part.firstUnit
											? part.reason
											: "size",
									finalBytes: 0,
								});
								break;
							}

							// If not at the very beginning of the part, check if remainder fits
							if (currentStart > part.firstUnit) {
								const candPart: ChapterPart = {
									...part,
									firstUnit: currentStart,
									endUnitExclusive: part.endUnitExclusive,
								};
								const candRender = await renderer.renderPart(
									candPart,
									{
										...renderContext,
										isFirstPartInLogicalSection: false,
										isLastPartInLogicalSection: isLast,
										retainText: false,
										diagnostics: [],
									},
								);
								if (
									candRender.bytes <=
									normalizedOptions.maxChapterBytes
								) {
									nextParts.push({
										id: "",
										href: "",
										sourceKey: part.sourceKey,
										firstUnit: currentStart,
										endUnitExclusive: part.endUnitExclusive,
										logicalSectionId: part.logicalSectionId,
										reason: "size",
										finalBytes: 0,
									});
									break;
								}
							}

							// Binary search on remainingSafeCuts to find best fitting cut
							let low = 0;
							let high = remainingSafeCuts.length - 1;
							let bestFitIdx = -1;

							while (low <= high) {
								const mid = Math.floor((low + high) / 2);
								const candidateCut = remainingSafeCuts[mid]!;
								const candidatePart: ChapterPart = {
									...part,
									firstUnit: currentStart,
									endUnitExclusive: candidateCut,
								};
								const candRender = await renderer.renderPart(
									candidatePart,
									{
										...renderContext,
										isFirstPartInLogicalSection:
											currentStart === part.firstUnit &&
											isFirst,
										isLastPartInLogicalSection: false,
										retainText: false,
										diagnostics: [],
									},
								);

								if (
									candRender.bytes <=
									normalizedOptions.maxChapterBytes
								) {
									bestFitIdx = mid;
									low = mid + 1; // try to include more
								} else {
									high = mid - 1;
								}
							}

							let chosenCut: number;
							if (bestFitIdx >= 0) {
								// Heading preference within fitting prefix
								let headingCut: number | undefined;
								for (let k = bestFitIdx; k >= 0; k--) {
									const cutCandidate = remainingSafeCuts[k]!;
									if (
										source.units[cutCandidate]?.kind === "heading"
									) {
										headingCut = cutCandidate;
										break;
									}
								}
								chosenCut =
									headingCut ?? remainingSafeCuts[bestFitIdx]!;
							} else {
								// No safe cut fits; isolate smallest atomic group
								chosenCut = remainingSafeCuts[0]!;
							}

							if (
								chosenCut <= currentStart ||
								chosenCut >= part.endUnitExclusive
							) {
								throw new EpubBuildError(
									`Layout stalled: invalid cut point ${chosenCut} for part ${part.id}`,
									"E_LAYOUT_STALLED",
								);
							}

							nextParts.push({
								id: "",
								href: "",
								sourceKey: part.sourceKey,
								firstUnit: currentStart,
								endUnitExclusive: chosenCut,
								logicalSectionId: part.logicalSectionId,
								reason:
									currentStart === part.firstUnit
										? part.reason
										: "size",
								finalBytes: 0,
							});

							currentStart = chosenCut;
							anyCompositeSplit = true;
						}
					}
				} else {
					nextParts.push(part);
				}
			}

			if (anyCompositeSplit) {
				parts = nextParts;
				continue;
			}

			// All composite parts fit or are singleton overflows
			break;
		}

		// Final pass: ensure numbering and re-render exact bytes
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part) {
				part.id = `chapter-${i + 1}`;
				part.href = `chapter-${i + 1}.html`;
			}
		}
		book.anchorRegistry.assignParts(parts);

		const finalSourceTargetMaps = await buildSourceTargetMaps(book);

		const sectionPartsMap = new Map<string, ChapterPart[]>();
		for (const p of parts) {
			const list = sectionPartsMap.get(p.logicalSectionId) ?? [];
			list.push(p);
			sectionPartsMap.set(p.logicalSectionId, list);
		}

		const inlineNavMap = computeScopedInlineNav(
			sectionPartsMap,
			book,
			normalizedOptions,
		);

		renderedParts = new Map<string, RenderedXhtml>();
		for (const part of parts) {
			const source = book.sources.find(
				(s) => s.descriptor.key === part.sourceKey,
			);
			if (!source) {
				throw new EpubBuildError(
					`Unknown source key: ${part.sourceKey}`,
					"E_STATE",
				);
			}
			const secParts = sectionPartsMap.get(part.logicalSectionId) ?? [part];
			const isFirst = secParts[0] === part;
			const isLast = secParts[secParts.length - 1] === part;
			const inlineNav = inlineNavMap.get(part.logicalSectionId);

			const renderContext: RenderContext = {
				source,
				payloadStore: book.payloadStore ?? source.payloadStore,
				registry: book.anchorRegistry,
				options: normalizedOptions,
				targetMap: finalSourceTargetMaps.get(part.sourceKey),
				sourceTargetMaps: finalSourceTargetMaps,
				imageMap: book.imageMap,
				inlineNav,
				isFirstPartInLogicalSection: isFirst,
				isLastPartInLogicalSection: isLast,
				diagnostics,
				retainText,
			};

			const rendered = await renderer.renderPart(part, renderContext);
			part.finalBytes = rendered.bytes;
			renderedParts.set(part.id, rendered);
		}

		// Validate final rerender actual limit/diagnostic consistency
		if (normalizedOptions.maxChapterBytes !== null) {
			for (const part of parts) {
				if (part.finalBytes > normalizedOptions.maxChapterBytes) {
					const source = book.sources.find(
						(s) => s.descriptor.key === part.sourceKey,
					);
					const unitId = source?.units[part.firstUnit]?.id;
					const range = source?.units[part.firstUnit]?.range;
					if (normalizedOptions.oversizePolicy === "error") {
						const diag: EpubDiagnostic = {
							code: "E_OVERSIZE",
							severity: "error",
							source: part.sourceKey,
							unitId,
							range,
							actualBytes: part.finalBytes,
							limitBytes: normalizedOptions.maxChapterBytes,
							message: `Indivisible unit ${unitId ?? part.id} (${part.finalBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
						};
						throw new EpubBuildError(diag.message, "E_OVERSIZE", [
							diag,
						]);
					}
					diagnostics.push({
						code: "W_OVERSIZE",
						severity: "warning",
						source: part.sourceKey,
						unitId,
						range,
						actualBytes: part.finalBytes,
						limitBytes: normalizedOptions.maxChapterBytes,
						message: `Indivisible unit ${unitId ?? part.id} (${part.finalBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
					});
				}
			}
		}

		// 4. Strict link checking & link counters
		let localLinks = 0;
		let resolvedLinks = 0;
		let unresolvedLinks = 0;
		let ambiguousLinks = 0;

		for (const source of book.sources) {
			for (const unit of source.units) {
				const payload = await resolvePayload(
					book.payloadStore ?? source.payloadStore,
					unit.payloadRef,
				);
				try {
					for (const link of payload.links) {
						const res = book.anchorRegistry.resolve(
							link.sourceKey,
							link.rawHref,
						);
						if (res.kind === "resolved") {
							localLinks++;
							resolvedLinks++;
						} else if (res.kind === "unresolved") {
							localLinks++;
							unresolvedLinks++;
							diagnostics.push(res.diagnostic);
							if (normalizedOptions.strictLinks) {
								const code = "E_LINK_UNRESOLVED";
								throw new EpubBuildError(res.diagnostic.message, code, [
									{ ...res.diagnostic, code, severity: "error" },
								]);
							}
						} else if (res.kind === "ambiguous") {
							localLinks++;
							ambiguousLinks++;
							diagnostics.push(res.diagnostic);
							if (normalizedOptions.strictLinks) {
								const code = "E_LINK_AMBIGUOUS";
								throw new EpubBuildError(res.diagnostic.message, code, [
									{ ...res.diagnostic, code, severity: "error" },
								]);
							}
						}
					}
				} finally {
					await releasePayload(
						book.payloadStore ?? source.payloadStore,
						unit.payloadRef,
					);
				}
			}
		}

		// 5. Build documents list including navigation documents
		const documents: EpubBuildReport["documents"] = parts.map((part) => ({
			href: part.href,
			kind: "content" as const,
			bytes: part.finalBytes,
			oversized:
				normalizedOptions.maxChapterBytes !== null &&
				part.finalBytes > normalizedOptions.maxChapterBytes,
			splittable: true,
		}));

		if (normalizedOptions.titlePage) {
			const titlePageXhtml = renderTitlePage(normalizedOptions);
			const titlePageBytes = Buffer.byteLength(titlePageXhtml, "utf8");
			const titlePageOversized =
				normalizedOptions.maxChapterBytes !== null &&
				titlePageBytes > normalizedOptions.maxChapterBytes;
			if (titlePageOversized) {
				if (normalizedOptions.oversizePolicy === "error") {
					const diag: EpubDiagnostic = {
						code: "E_OVERSIZE",
						severity: "error",
						href: "title-page.html",
						actualBytes: titlePageBytes,
						limitBytes: normalizedOptions.maxChapterBytes,
						message: `title-page.html (${titlePageBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
					};
					throw new EpubBuildError(diag.message, "E_OVERSIZE", [diag]);
				}
				diagnostics.push({
					code: "W_OVERSIZE",
					severity: "warning",
					href: "title-page.html",
					actualBytes: titlePageBytes,
					limitBytes: normalizedOptions.maxChapterBytes,
					message: `title-page.html (${titlePageBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
				});
			}
			documents.push({
				href: "title-page.html",
				kind: "title-page",
				bytes: titlePageBytes,
				oversized: titlePageOversized,
				splittable: false,
			});
		}

		if (normalizedOptions.bookToc) {
			const bookTocXhtml = renderBookToc(
				book.outline,
				book.pages ?? [],
				book.anchorRegistry,
				normalizedOptions,
			);
			const bookTocBytes = Buffer.byteLength(bookTocXhtml, "utf8");
			const bookTocOversized =
				normalizedOptions.maxChapterBytes !== null &&
				bookTocBytes > normalizedOptions.maxChapterBytes;
			if (bookTocOversized) {
				if (normalizedOptions.oversizePolicy === "error") {
					const diag: EpubDiagnostic = {
						code: "E_OVERSIZE",
						severity: "error",
						href: "book-toc.html",
						actualBytes: bookTocBytes,
						limitBytes: normalizedOptions.maxChapterBytes,
						message: `book-toc.html (${bookTocBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
					};
					throw new EpubBuildError(diag.message, "E_OVERSIZE", [diag]);
				}
				diagnostics.push({
					code: "W_OVERSIZE",
					severity: "warning",
					href: "book-toc.html",
					actualBytes: bookTocBytes,
					limitBytes: normalizedOptions.maxChapterBytes,
					message: `book-toc.html (${bookTocBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
				});
			}
			documents.push({
				href: "book-toc.html",
				kind: "book-toc",
				bytes: bookTocBytes,
				oversized: bookTocOversized,
				splittable: false,
			});
		}

		if (normalizedOptions.epubVersion === 3) {
			const navXhtml = renderNav(
				book.outline,
				book.pages ?? [],
				book.anchorRegistry,
				normalizedOptions,
			);
			const navBytes = Buffer.byteLength(navXhtml, "utf8");
			const navOversized =
				normalizedOptions.maxChapterBytes !== null &&
				navBytes > normalizedOptions.maxChapterBytes;
			if (navOversized) {
				if (normalizedOptions.oversizePolicy === "error") {
					const diag: EpubDiagnostic = {
						code: "E_OVERSIZE",
						severity: "error",
						href: "nav.xhtml",
						actualBytes: navBytes,
						limitBytes: normalizedOptions.maxChapterBytes,
						message: `nav.xhtml (${navBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
					};
					throw new EpubBuildError(diag.message, "E_OVERSIZE", [diag]);
				}
				diagnostics.push({
					code: "W_OVERSIZE",
					severity: "warning",
					href: "nav.xhtml",
					actualBytes: navBytes,
					limitBytes: normalizedOptions.maxChapterBytes,
					message: `nav.xhtml (${navBytes} bytes) exceeds maxChapterBytes (${normalizedOptions.maxChapterBytes} bytes)`,
				});
			}
			documents.push({
				href: "nav.xhtml",
				kind: "navigation",
				bytes: navBytes,
				oversized: navOversized,
				splittable: false,
			});
		}

		let totalImages = 0;
		for (const source of book.sources) {
			totalImages += source.images?.length ?? 0;
		}

		// Deduplicate diagnostics
		const seenDiags = new Set<string>();
		const uniqueDiagnostics: EpubDiagnostic[] = [];
		for (const d of diagnostics) {
			const key = `${d.code}:${d.source ?? ""}:${d.unitId ?? ""}:${d.href ?? ""}:${d.actualBytes ?? ""}:${d.message}`;
			if (!seenDiags.has(key)) {
				seenDiags.add(key);
				uniqueDiagnostics.push(d);
			}
		}

		const buildState = createBuildState(
			{
				maxChapterBytes: normalizedOptions.maxChapterBytes,
				splitAt: normalizedOptions.splitAt,
				oversizePolicy: normalizedOptions.oversizePolicy,
				strictLinks: normalizedOptions.strictLinks,
				epubVersion: normalizedOptions.epubVersion,
				dryRun: normalizedOptions.dryRun,
			},
			normalizedOptions.inputRoot ?? process.cwd(),
		);
		buildState.sources = book.sources.map((s) => ({
			descriptor: s.descriptor,
			units: s.units.length,
		}));
		buildState.documents = documents;
		buildState.diagnostics = uniqueDiagnostics;
		buildState.counters = {
			localLinks,
			resolvedLinks,
			unresolvedLinks,
			ambiguousLinks,
			anchors: book.anchorRegistry.getTargets().length,
			images: totalImages,
			layoutPasses: pass,
		};

		const report = finalizeReport(buildState);

		return {
			parts,
			documents: report.documents,
			renderedParts,
			report,
			diagnostics: report.diagnostics,
			passes: pass,
		};
	}
}
