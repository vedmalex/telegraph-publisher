import { buildSectionNav } from "../navigation/sectionNav";
import { AnchorGenerator } from "../utils/AnchorGenerator";
import type { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import {
	EpubBuildError,
	type OutlineNode,
	type PageTarget,
	type ParsedSource,
} from "./EpubTypes";

export type NavigationIndex = Pick<EpubAnchorRegistry, "target" | "resolve">;
export interface NavigationOptions {
	title?: string;
	identifier?: string;
	language?: string;
	epubVersion?: 2 | 3;
	tocDepth?: number;
	bookTocDepth?: number;
	bookTocTitle?: string;
}
export interface InlineNavigationOptions {
	chapterToc?: "none" | "blocks" | "full" | "auto";
	chapterTocDepth?: number;
	chapterTocPosition?: "start" | "end" | "both";
	tocDepth?: number;
	navThreshold?: number;
	navMaxItems?: number;
	navCaption?: string;
	tocTitle?: string;
	tocSeparators?: boolean;
}
export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
function flatten(nodes: readonly OutlineNode[]): OutlineNode[] {
	const result: OutlineNode[] = [];
	for (const node of nodes) {
		result.push(node);
		result.push(...flatten(node.children));
	}
	return result;
}
function hierarchy(nodes: readonly OutlineNode[]): OutlineNode[] {
	const roots: OutlineNode[] = [],
		stack: OutlineNode[] = [];
	for (const original of nodes) {
		const node = { ...original, children: [] as OutlineNode[] };
		while (stack.length && (stack.at(-1)?.level ?? 0) >= node.level)
			stack.pop();
		const parent = stack.at(-1);
		if (parent) parent.children.push(node);
		else roots.push(node);
		stack.push(node);
	}
	return roots;
}
function firstVisibleHeading(source: ParsedSource): string | undefined {
	for (const unit of source.units) {
		if (unit.kind === "html") {
			const payload = source.payloadStore.get(unit.payloadRef);
			const text = payload?.tokens
				.map((token) => token.raw)
				.join("")
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/<a\b[^>]*(?:\/>|>\s*<\/a>)/gi, "")
				.trim();
			if (!text) continue;
		}
		return unit.heading?.level === 1 ? unit.heading.targetId : undefined;
	}
	return undefined;
}
/** Logical source roots and semantic headings are built before any physical splitting. */
export function buildOutline(sources: readonly ParsedSource[]): OutlineNode[] {
	return [...sources]
		.sort((a, b) => a.descriptor.ordinal - b.descriptor.ordinal)
		.map((source) => {
			const nodes = flatten(source.outline);
			const firstHeading = firstVisibleHeading(source);
			const first = nodes.find((node) => node.targetId === firstHeading);
			const reuse =
				first?.label.trim().toLowerCase() ===
				source.descriptor.title.trim().toLowerCase()
					? first
					: undefined;
			const root: OutlineNode = reuse
				? { ...reuse, children: [] }
				: {
						id: `source-root-${source.descriptor.ordinal}`,
						sourceKey: source.descriptor.key,
						level: 0,
						label: source.descriptor.title,
						targetId: `source-root-${source.descriptor.ordinal}`,
						children: [],
					};
			root.children = hierarchy(
				nodes.filter((node) => node.targetId !== reuse?.targetId),
			);
			return root;
		});
}
function filtered(
	outline: readonly OutlineNode[],
	depth: number,
): OutlineNode[] {
	return outline.map((root) => ({
		...root,
		children: hierarchy(
			flatten(root.children).filter((node) => node.level <= depth),
		),
	}));
}
function address(node: OutlineNode, index: NavigationIndex): string {
	if (node.id.startsWith("source-root-") && node.targetId === node.id) {
		const result = index.resolve(node.sourceKey, "");
		if (result.kind === "resolved") return result.href;
		throw new EpubBuildError(
			"Navigation source has no assigned content part.",
			"E_LINK_UNRESOLVED",
			result.kind === "external" ? [] : [result.diagnostic],
		);
	}
	const target = index.target(node.targetId);
	return `${target.href}#${encodeURIComponent(target.id)}`;
}
function pageAddress(page: PageTarget, index: NavigationIndex): string {
	const target = index.target(page.targetId);
	return `${target.href}#${encodeURIComponent(target.id)}`;
}
function list(nodes: readonly OutlineNode[], index: NavigationIndex): string {
	return `<ol>${nodes.map((node) => `<li><a href="${escapeXml(address(node, index))}">${escapeXml(node.label)}</a>${node.children.length ? list(node.children, index) : ""}</li>`).join("")}</ol>`;
}
function document(
	body: string,
	title: string,
	options: NavigationOptions,
	nav = false,
): string {
	const language = escapeXml(options.language ?? "ru");
	const epub3 = (options.epubVersion ?? 3) === 3;
	const doctype = epub3
		? "<!DOCTYPE html>"
		: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">';
	return `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n<html xmlns="http://www.w3.org/1999/xhtml"${epub3 ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ""} xml:lang="${language}"${epub3 ? ` lang="${language}"` : ""}><head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body${nav ? ' class="epub-navigation"' : ""}>${body}</body></html>`;
}
export function renderNav(
	outline: readonly OutlineNode[],
	pages: readonly PageTarget[],
	index: NavigationIndex,
	options: NavigationOptions = {},
): string {
	if (options.epubVersion === 2)
		throw new EpubBuildError(
			"EPUB 2 uses NCX navigation, not nav.xhtml.",
			"E_OPTION",
		);
	const title = options.bookTocTitle ?? "Содержание";
	const pageList = pages.length
		? `<nav epub:type="page-list" id="page-list" hidden="hidden"><h2>Страницы</h2><ol>${pages.map((page) => `<li><a href="${escapeXml(pageAddress(page, index))}">${escapeXml(page.label)}</a></li>`).join("")}</ol></nav>`
		: "";
	return document(
		`<nav epub:type="toc" id="toc"><h1>${escapeXml(title)}</h1>${list(filtered(outline, options.tocDepth ?? Infinity), index)}</nav>${pageList}`,
		options.title ?? title,
		options,
		true,
	);
}
export function renderNcx(
	outline: readonly OutlineNode[],
	pages: readonly PageTarget[],
	index: NavigationIndex,
	options: NavigationOptions = {},
): string {
	const tree = filtered(outline, options.tocDepth ?? Infinity);
	let order = 0,
		navId = 0;
	const depth = (nodes: readonly OutlineNode[]): number =>
		nodes.length
			? 1 +
				nodes.reduce(
					(maximum, node) => Math.max(maximum, depth(node.children)),
					0,
				)
			: 0;
	const render = (nodes: readonly OutlineNode[]): string =>
		nodes
			.map(
				(node) =>
					`<navPoint id="nav-${++navId}" playOrder="${++order}"><navLabel><text>${escapeXml(node.label)}</text></navLabel><content src="${escapeXml(address(node, index))}"/>${render(node.children)}</navPoint>`,
			)
			.join("");
	const navMap = render(tree);
	const pageList = pages.length
		? `<pageList><navLabel><text>Страницы</text></navLabel>${pages.map((page, i) => `<pageTarget id="page-target-${i + 1}" value="${i + 1}" type="normal" playOrder="${++order}"><navLabel><text>${escapeXml(page.label)}</text></navLabel><content src="${escapeXml(pageAddress(page, index))}"/></pageTarget>`).join("")}</pageList>`
		: "";
	return `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${escapeXml(options.language ?? "ru")}"><head><meta name="dtb:uid" content="${escapeXml(options.identifier ?? "")}"/><meta name="dtb:depth" content="${depth(tree)}"/><meta name="dtb:totalPageCount" content="${pages.length}"/><meta name="dtb:maxPageNumber" content="${pages.reduce((max, page) => Math.max(max, page.pageNumber), 0)}"/></head><docTitle><text>${escapeXml(options.title ?? "")}</text></docTitle><navMap>${navMap}</navMap>${pageList}</ncx>`;
}
export function renderBookToc(
	outline: readonly OutlineNode[],
	_pages: readonly PageTarget[],
	index: NavigationIndex,
	options: NavigationOptions = {},
): string {
	const title = options.bookTocTitle ?? "Содержание";
	return document(
		`<h1>${escapeXml(title)}</h1>${list(filtered(outline, options.bookTocDepth ?? options.tocDepth ?? 2), index)}`,
		title,
		options,
	);
}
/** One result per logical section; placement across its parts is owned by the layout renderer. */
export function renderInlineNavigation(
	outline: readonly OutlineNode[],
	index: NavigationIndex,
	options: InlineNavigationOptions = {},
): { start: string; end: string } {
	const requested = options.chapterToc ?? "auto";
	const mode =
		requested === "auto"
			? Number.isFinite(options.tocDepth ?? Infinity)
				? "blocks"
				: "none"
			: requested;
	if (mode === "none") return { start: "", end: "" };
	const nodes = flatten(outline).filter((node) => node.level > 0);
	let markup = "";
	if (mode === "full") {
		const tree = hierarchy(
			nodes.filter(
				(node) => node.level <= (options.chapterTocDepth ?? Infinity),
			),
		);
		if (tree.length)
			markup = `<div class="chapter-toc"><p><strong>${escapeXml(options.tocTitle ?? "Содержание")}</strong></p>${list(tree, index)}</div>`;
	} else {
		const headings = nodes.map((node) =>
			AnchorGenerator.extractHeadingInfo([
				"",
				"#".repeat(node.level),
				node.label,
			] as unknown as RegExpMatchArray),
		);
		const maximum = options.navMaxItems ?? 12;
		const items = buildSectionNav(headings, {
			threshold: options.navThreshold ?? 30,
			maxItems: maximum,
		});
		const counts = new Map<number, number>();
		for (const node of nodes)
			counts.set(node.level, (counts.get(node.level) ?? 0) + 1);
		const level = [...counts].sort(
			(a, b) => b[1] - a[1] || a[0] - b[0],
		)[0]?.[0];
		const row = nodes.filter((node) => node.level === level);
		const selected =
			items && items.length > maximum
				? Array.from(
						{ length: maximum },
						(_, i) =>
							items[Math.floor((i * (items.length - 1)) / (maximum - 1))],
					).filter((item) => item !== undefined)
				: items;
		if (selected?.length)
			markup = `<p class="section-nav"><strong>${escapeXml(options.navCaption ?? "К тексту:")}</strong> ${selected
				.map((item) => {
					const node = row[item.ordinal - 1];
					if (!node)
						throw new EpubBuildError(
							"Invalid navigation milestone.",
							"E_STATE",
						);
					return `<a href="${escapeXml(address(node, index))}">${escapeXml(item.label)}</a>`;
				})
				.join(" · ")}</p>`;
	}
	if (!markup) return { start: "", end: "" };
	if (mode === "full" && (options.tocSeparators ?? true))
		markup = `<hr/>${markup}<hr/>`;
	const position =
		options.chapterTocPosition ?? (mode === "blocks" ? "both" : "start");
	return {
		start: position !== "end" ? markup : "",
		end: position !== "start" ? markup : "",
	};
}
