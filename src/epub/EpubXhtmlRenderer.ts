import { createHash } from "node:crypto";
import type { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import type { NormalizedEpubOptions } from "./EpubOptions";
import { renderEpubTokens } from "./EpubTokenRenderer";
import {
	type ChapterPart,
	EpubBuildError,
	type EpubDiagnostic,
	type EpubRenderContext,
	type EpubUnitPayload,
	type OutlineNode,
	type ParsedSource,
	type RenderedXhtml,
	type TelegraphNode,
} from "./EpubTypes";

export interface PayloadStore {
	get(ref: string): Promise<EpubUnitPayload> | EpubUnitPayload;
	release?(ref: string): Promise<void> | void;
}

export interface RenderContext {
	source: ParsedSource;
	payloadStore?: PayloadStore | Map<string, EpubUnitPayload>;
	registry?: EpubAnchorRegistry;
	options: NormalizedEpubOptions;
	targetMap?: Map<string, string>;
	sourceTargetMaps?: Map<string, Map<string, string>>;
	imageMap?: Map<string, string>;
	inlineNav?: { start: string; end: string };
	isFirstPartInLogicalSection?: boolean;
	isLastPartInLogicalSection?: boolean;
	logicalTitle?: string;
	diagnostics?: EpubDiagnostic[];
	writer?: { write(bytes: Uint8Array): Promise<void> };
	retainText?: boolean;
}

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

const voidElements = new Set(["br", "hr", "img"]);

export function serializeNode(node: TelegraphNode | string): string {
	if (typeof node === "string") {
		return escapeXml(node);
	}

	const tag = node.tag;
	const attrs = node.attrs ?? {};
	const children = node.children ?? [];

	const attrPairs: string[] = [];
	for (const [key, value] of Object.entries(attrs)) {
		if (value !== undefined && value !== null) {
			attrPairs.push(`${key}="${escapeXml(String(value))}"`);
		}
	}
	const attrString = attrPairs.length > 0 ? ` ${attrPairs.join(" ")}` : "";

	if (voidElements.has(tag)) {
		return `<${tag}${attrString}/>`;
	}

	const childrenHtml = children.map(serializeNode).join("");
	return `<${tag}${attrString}>${childrenHtml}</${tag}>`;
}

function findOutlineNode(
	nodes: readonly OutlineNode[],
	targetId: string,
): OutlineNode | undefined {
	for (const node of nodes) {
		if (node.targetId === targetId) return node;
		const found = findOutlineNode(node.children, targetId);
		if (found) return found;
	}
	return undefined;
}

export function hasMatchingFirstH1(source: ParsedSource): boolean {
	for (const unit of source.units) {
		if (unit.kind === "html") {
			const payload = source.payloadStore.get(unit.payloadRef);
			const raw =
				payload?.tokens.map((token) => token.raw).join("") ?? "";
			const text = raw
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/<a\b[^>]*(?:\/>|>\s*<\/a>)/gi, "")
				.replace(/<span\b[^>]*(?:\/>|>\s*<\/span>)/gi, "")
				.replace(/<div\b[^>]*(?:\/>|>\s*<\/div>)/gi, "")
				.trim();
			if (!text) continue;
			// Visible HTML before heading means the first visible node is not a matching h1
			return false;
		}

		if (unit.kind === "heading") {
			if (!unit.heading || unit.heading.level !== 1) return false;
			const node = findOutlineNode(source.outline, unit.heading.targetId);
			if (!node) return false;
			return (
				node.label.trim().toLowerCase() ===
				source.descriptor.title.trim().toLowerCase()
			);
		}

		// Any other unit (paragraph, code, list, blockquote, table, rule, generated) is visible content.
		// Since visible content appears before any heading, the document does not start with a matching h1.
		return false;
	}
	return false;
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

export class EpubXhtmlRenderer {
	measureEmptyWrapper(
		options: NormalizedEpubOptions,
		source?: ParsedSource,
	): number {
		const language = escapeXml(options.language ?? "ru");
		const epub3 = (options.epubVersion ?? 3) === 3;
		const doctype = epub3
			? "<!DOCTYPE html>"
			: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
		const htmlAttrs = epub3
			? `xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}"`
			: `xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}"`;
		const title = source?.descriptor.title ?? options.title ?? "";
		const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n<html ${htmlAttrs}><head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body></body></html>\n`;
		return Buffer.byteLength(xhtml, "utf8");
	}

	async renderPart(
		part: ChapterPart,
		context: RenderContext,
	): Promise<RenderedXhtml> {
		const retain = context.retainText ?? true;
		const chunks: Uint8Array[] = retain ? [] : (null as any);
		let totalBytes = 0;
		const hasher = createHash("sha256");

		for await (const chunk of this.renderPartToChunks(part, context)) {
			if (retain) {
				chunks.push(chunk);
			}
			totalBytes += chunk.byteLength;
			hasher.update(chunk);
			if (context.writer) {
				await context.writer.write(chunk);
			}
		}

		const text = retain ? Buffer.concat(chunks).toString("utf8") : "";
		const sha256 = hasher.digest("hex");

		return {
			text,
			bytes: totalBytes,
			sha256,
		};
	}

	async renderPartToWriter(
		part: ChapterPart,
		context: RenderContext,
		writer: { write(bytes: Uint8Array): Promise<void> },
	): Promise<RenderedXhtml> {
		let totalBytes = 0;
		const hasher = createHash("sha256");

		for await (const chunk of this.renderPartToChunks(part, context)) {
			totalBytes += chunk.byteLength;
			hasher.update(chunk);
			await writer.write(chunk);
		}

		const sha256 = hasher.digest("hex");

		return {
			text: "",
			bytes: totalBytes,
			sha256,
		};
	}

	async *renderPartToChunks(
		part: ChapterPart,
		context: RenderContext,
	): AsyncIterable<Uint8Array> {
		const options = context.options;
		const language = escapeXml(options.language ?? "ru");
		const epub3 = (options.epubVersion ?? 3) === 3;
		const doctype = epub3
			? "<!DOCTYPE html>"
			: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
		const htmlAttrs = epub3
			? `xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}"`
			: `xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}"`;

		const sourceTitle = context.source.descriptor.title;
		const headTitle =
			part.firstUnit === 0 ? sourceTitle : `${sourceTitle} (продолжение)`;

		// 1. Header wrapper
		yield Buffer.from(
			`<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n<html ${htmlAttrs}><head><meta charset="UTF-8"/><title>${escapeXml(headTitle)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>\n`,
			"utf8",
		);

		// 2. Title handling:
		// First part of source:
		// If source does not already have a visible h1 matching title, emit synthetic h1 once.
		if (part.firstUnit === 0) {
			if (!hasMatchingFirstH1(context.source)) {
				yield Buffer.from(
					`<h1 id="source-root-${context.source.descriptor.ordinal}">${escapeXml(sourceTitle)}</h1>\n`,
					"utf8",
				);
			}
		} else if (part.reason === "size") {
			// Continuation part: continuation title in a div, NOT a heading or navpoint.
			yield Buffer.from(
				`<div class="epub-continuation">${escapeXml(sourceTitle)} (продолжение)</div>\n`,
				"utf8",
			);
		}

		// 3. Inline navigation start (inserted once at the start of a logical section)
		if (context.isFirstPartInLogicalSection && context.inlineNav?.start) {
			yield Buffer.from(`${context.inlineNav.start}\n`, "utf8");
		}

		// 4. Units rendering
		const units = context.source.units.slice(
			part.firstUnit,
			part.endUnitExclusive,
		);
		const payloadStore = context.payloadStore ?? context.source.payloadStore;

		// Resolve source-scoped targetMap
		let targetMap: Map<string, string> | undefined;
		if (context.sourceTargetMaps) {
			targetMap = context.sourceTargetMaps.get(part.sourceKey);
			if (!targetMap) {
				targetMap = new Map<string, string>();
				context.sourceTargetMaps.set(part.sourceKey, targetMap);
			}
		} else {
			targetMap = context.targetMap;
		}

		for (const unit of units) {
			const payload = await resolvePayload(payloadStore, unit.payloadRef);
			try {
				if (context.registry && targetMap) {
					for (const link of payload.links) {
						if (!targetMap.has(link.rawHref)) {
							const res = context.registry.resolve(
								link.sourceKey,
								link.rawHref,
							);
							if (res.kind === "resolved") {
								targetMap.set(link.rawHref, res.href);
								try {
									const decoded = decodeURI(link.rawHref);
									if (decoded !== link.rawHref) {
										targetMap.set(decoded, res.href);
									}
								} catch {}
								try {
									const encoded = encodeURI(link.rawHref);
									if (encoded !== link.rawHref) {
										targetMap.set(encoded, res.href);
									}
								} catch {}
							} else if (
								res.kind === "unresolved" ||
								res.kind === "ambiguous"
							) {
								context.diagnostics?.push(res.diagnostic);
								if (options.strictLinks) {
									const code =
										res.diagnostic.code === "W_LINK_AMBIGUOUS"
											? "E_LINK_AMBIGUOUS"
											: "E_LINK_UNRESOLVED";
									throw new EpubBuildError(res.diagnostic.message, code, [
										{ ...res.diagnostic, code, severity: "error" },
									]);
								}
							}
						}
					}
				}

				const renderCtx: EpubRenderContext = {
					sourceKey: part.sourceKey,
					pageBreaks: options.pageBreaks,
					epubVersion: options.epubVersion,
					targetMap,
					imageMap: context.imageMap,
					definitions: context.source.definitions,
					anchors: context.source.anchors,
					diagnostics: context.diagnostics,
				};

				const nodes = renderEpubTokens(payload.tokens, renderCtx);
				const unitMarkup = nodes.map(serializeNode).join("\n");
				if (unitMarkup) {
					yield Buffer.from(`${unitMarkup}\n`, "utf8");
				}
			} finally {
				await releasePayload(payloadStore, unit.payloadRef);
			}
		}

		// 5. Inline navigation end (inserted once at the end of a logical section)
		if (context.isLastPartInLogicalSection && context.inlineNav?.end) {
			yield Buffer.from(`${context.inlineNav.end}\n`, "utf8");
		}

		// 6. Footer
		yield Buffer.from("</body></html>\n", "utf8");
	}
}
