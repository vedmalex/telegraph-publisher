import { dirname, resolve as resolvePath } from "node:path";
import { AnchorGenerator } from "../utils/AnchorGenerator";
import {
	type AnchorTarget,
	type ChapterPart,
	EpubBuildError,
	type EpubDiagnostic,
	type ParsedSource,
	type ResolvedLink,
	type SourceKey,
	type TargetId,
} from "./EpubTypes";

interface SourceIndex {
	parsed: ParsedSource;
	emitted: Map<string, AnchorTarget>;
	explicit: Map<string, AnchorTarget[]>;
	aliases: Map<string, AnchorTarget[]>;
	transliterated: Map<string, AnchorTarget[]>;
}

function add(
	index: Map<string, AnchorTarget[]>,
	key: string,
	anchor: AnchorTarget,
): void {
	const entries = index.get(key) ?? [];
	if (!entries.some((entry) => entry.targetId === anchor.targetId))
		entries.push(anchor);
	index.set(key, entries);
}

/** Source-relative addresses are independent of the part containing the link. */
export class EpubAnchorRegistry {
	private readonly sources = new Map<SourceKey, SourceIndex>();
	private readonly anchors = new Map<TargetId, AnchorTarget>();
	private readonly addresses = new Map<
		TargetId,
		{ href: string; id: string }
	>();
	private readonly firstParts = new Map<SourceKey, string>();
	private readonly diagnostics: EpubDiagnostic[] = [];

	registerSource(parsed: ParsedSource): void {
		const key = resolvePath(parsed.descriptor.key);
		if (this.sources.has(key)) this.state(`Source already registered: ${key}`);
		const index: SourceIndex = {
			parsed,
			emitted: new Map(),
			explicit: new Map(),
			aliases: new Map(),
			transliterated: new Map(),
		};
		const pending = [...parsed.anchors].sort((a, b) => a.ordinal - b.ordinal);
		const unitIds = new Set(parsed.units.map((unit) => unit.id));
		const targetIds = new Set<string>();
		for (const anchor of pending) {
			if (
				resolvePath(anchor.sourceKey) !== key ||
				!unitIds.has(anchor.unitId)
			) {
				this.state(
					`Anchor ${anchor.targetId} does not belong to source ${key}`,
				);
			}
			if (this.anchors.has(anchor.targetId) || targetIds.has(anchor.targetId))
				this.state(`Duplicate target key: ${anchor.targetId}`);
			targetIds.add(anchor.targetId);
			const id = anchor.id.normalize("NFC");
			if (index.emitted.has(id)) {
				const diagnostic: EpubDiagnostic = {
					code: "E_ANCHOR_DUPLICATE",
					severity: "error",
					source: key,
					unitId: anchor.unitId,
					message: `Duplicate anchor ID: ${anchor.id}`,
				};
				throw new EpubBuildError(diagnostic.message, diagnostic.code, [
					diagnostic,
				]);
			}
			index.emitted.set(id, anchor);
			for (const rawAlias of [anchor.id, ...anchor.aliases]) {
				// Stored aliases are already text, not URI fragments: never decode a literal percent.
				const alias = rawAlias.normalize("NFC");
				add(index.aliases, alias, anchor);
				if (anchor.kind === "explicit") add(index.explicit, alias, anchor);
				add(
					index.transliterated,
					AnchorGenerator.transliterateToAscii(alias),
					anchor,
				);
			}
		}
		this.sources.set(key, index);
		for (const anchor of pending) this.anchors.set(anchor.targetId, anchor);
		const pageLabels = new Set<number>();
		for (const page of parsed.pages) {
			if (pageLabels.has(page.pageNumber))
				this.diagnostics.push({
					code: "W_DUPLICATE_PAGE",
					severity: "warning",
					source: key,
					unitId: page.unitId,
					message: `Repeated page label: ${page.label}`,
				});
			pageLabels.add(page.pageNumber);
		}
		// A source added after layout invalidates all addresses until the next complete assignment.
		this.addresses.clear();
		this.firstParts.clear();
	}

	/** Rebuild after every monotone layout pass; validate before replacing the old assignment. */
	assignParts(parts: readonly ChapterPart[]): void {
		const grouped = new Map<string, ChapterPart[]>();
		const hrefs = new Set<string>();
		for (const part of parts) {
			const key = resolvePath(part.sourceKey);
			if (!this.sources.has(key)) this.state(`Unknown part source: ${key}`);
			if (!part.href || hrefs.has(part.href))
				this.state(`Duplicate or empty part href: ${part.href}`);
			hrefs.add(part.href);
			const sourceParts = grouped.get(key) ?? [];
			sourceParts.push(part);
			grouped.set(key, sourceParts);
		}
		const addresses = new Map<TargetId, { href: string; id: string }>();
		const firstParts = new Map<SourceKey, string>();
		for (const [key, index] of this.sources) {
			const sourceParts = (grouped.get(key) ?? []).sort(
				(a, b) => a.firstUnit - b.firstUnit,
			);
			let cursor = 0;
			const unitParts = new Map<string, string>();
			for (const part of sourceParts) {
				if (
					!Number.isInteger(part.firstUnit) ||
					!Number.isInteger(part.endUnitExclusive) ||
					part.firstUnit !== cursor ||
					part.endUnitExclusive <= cursor ||
					part.endUnitExclusive > index.parsed.units.length
				)
					this.state(`Invalid part partition for ${key}`);
				firstParts.set(key, firstParts.get(key) ?? part.href);
				for (; cursor < part.endUnitExclusive; cursor++) {
					const unit = index.parsed.units[cursor];
					if (!unit) this.state(`Missing unit at ${cursor}`);
					unitParts.set(unit.id, part.href);
				}
			}
			if (cursor !== index.parsed.units.length)
				this.state(`Incomplete part partition for ${key}`);
			for (const anchor of index.parsed.anchors) {
				const href = unitParts.get(anchor.unitId);
				if (!href)
					this.state(`Anchor has no assigned part: ${anchor.targetId}`);
				addresses.set(anchor.targetId, { href, id: anchor.id });
			}
		}
		this.addresses.clear();
		this.firstParts.clear();
		for (const [id, address] of addresses) this.addresses.set(id, address);
		for (const [key, href] of firstParts) this.firstParts.set(key, href);
	}

	resolve(sourceKey: SourceKey, href: string): ResolvedLink {
		if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//"))
			return { kind: "external", href };
		const source = resolvePath(sourceKey);
		const fail = (
			code: string,
			message: string,
			kind: "unresolved" | "ambiguous" = "unresolved",
		): ResolvedLink => ({
			kind,
			href,
			diagnostic: { code, severity: "warning", source, href, message },
		});
		const hash = href.indexOf("#");
		const beforeHash = hash < 0 ? href : href.slice(0, hash);
		if (beforeHash.includes("?"))
			return fail(
				"W_LINK_QUERY",
				`Queries on local links are unsupported: ${href}`,
			);
		let path: string;
		let fragment: string;
		try {
			path = decodeURIComponent(beforeHash);
			fragment = decodeURIComponent(
				hash < 0 ? "" : href.slice(hash + 1),
			).normalize("NFC");
		} catch {
			return fail(
				"W_LINK_ENCODING",
				`Malformed percent encoding in link: ${href}`,
			);
		}
		const key = path ? resolvePath(dirname(source), path) : source;
		const index = this.sources.get(key);
		if (!index)
			return fail(
				"W_LINK_UNRESOLVED",
				`Unknown local source: ${path || source}`,
			);
		if (!fragment) {
			const first = this.firstParts.get(key);
			return first
				? { kind: "resolved", href: first }
				: fail(
						"W_LINK_UNRESOLVED",
						`Source has no assigned content part: ${key}`,
					);
		}
		let anchor = index.emitted.get(fragment);
		if (!anchor) anchor = index.explicit.get(fragment)?.[0];
		if (!anchor) anchor = index.aliases.get(fragment)?.[0];
		if (!anchor) {
			const candidates =
				index.transliterated.get(
					AnchorGenerator.transliterateToAscii(fragment),
				) ?? [];
			if (candidates.length > 1)
				return fail(
					"W_LINK_AMBIGUOUS",
					`Ambiguous local fragment: ${fragment}`,
					"ambiguous",
				);
			anchor = candidates[0];
		}
		if (!anchor)
			return fail("W_LINK_UNRESOLVED", `Unknown local fragment: ${fragment}`);
		const address = this.addresses.get(anchor.targetId);
		if (!address)
			return fail(
				"W_LINK_UNRESOLVED",
				`Target has no assigned content part: ${anchor.targetId}`,
			);
		return {
			kind: "resolved",
			href: `${address.href}#${address.id}`,
			targetId: anchor.targetId,
		};
	}

	target(targetId: TargetId): { href: string; id: string } {
		const address = this.addresses.get(targetId);
		if (!address) this.state(`Unknown or unassigned target: ${targetId}`);
		return { ...address };
	}

	getTargets(): readonly AnchorTarget[] {
		return [...this.anchors.values()];
	}
	getDiagnostics(): readonly EpubDiagnostic[] {
		return [...this.diagnostics];
	}

	private state(message: string): never {
		throw new EpubBuildError(message, "E_STATE");
	}
}
