import { describe, expect, test } from "bun:test";
import { EpubAnchorRegistry } from "./EpubAnchorRegistry";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import {
	type ChapterPart,
	EpubBuildError,
	type ParsedSource,
} from "./EpubTypes";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Missing test fixture entry");
	return value;
}

function source(
	markdown: string,
	key = "/books/book.md",
	ordinal = 1,
): ParsedSource {
	return parseEpubMarkdown(markdown, key, {
		sourceOrdinal: ordinal,
		pageBreaks: true,
	});
}
function parts(
	parsed: ParsedSource,
	cuts: number[] = [],
	start = 1,
): ChapterPart[] {
	const boundaries = [0, ...cuts, parsed.units.length];
	return boundaries.slice(0, -1).map((first, i) => ({
		id: `part-${start + i}`,
		href: `chapter-${start + i}.html`,
		sourceKey: parsed.descriptor.key,
		firstUnit: first,
		endUnitExclusive: required(boundaries[i + 1]),
		logicalSectionId: "section",
		reason: "size",
		finalBytes: 0,
	}));
}
function registry(
	parsed: ParsedSource,
	cuts: number[] = [],
): EpubAnchorRegistry {
	const index = new EpubAnchorRegistry();
	index.registerSource(parsed);
	index.assignParts(parts(parsed, cuts));
	return index;
}

describe("EpubAnchorRegistry", () => {
	test("pure fragments and cross-file fragments address actual parts in both directions", () => {
		const book = source(
			"# Start\n\n[forward](#End)\n\n## End\n\n[back](#Start)",
		);
		const other = source(
			"# Other\n\n[book](book.md#End)",
			"/books/other.md",
			2,
		);
		const cut = book.units.findIndex((unit) => unit.heading?.text === "End");
		const index = new EpubAnchorRegistry();
		index.registerSource(book);
		index.registerSource(other);
		index.assignParts([...parts(book, [cut]), ...parts(other, [], 3)]);
		expect(index.resolve(book.descriptor.key, "#End")).toMatchObject({
			kind: "resolved",
			href: "chapter-2.html#End",
		});
		expect(index.resolve(book.descriptor.key, "#Start")).toMatchObject({
			kind: "resolved",
			href: "chapter-1.html#Start",
		});
		expect(index.resolve(other.descriptor.key, "book.md#End")).toMatchObject({
			kind: "resolved",
			href: "chapter-2.html#End",
		});
		expect(index.resolve(book.descriptor.key, "other.md#Other")).toMatchObject({
			kind: "resolved",
			href: "chapter-3.html#Other",
		});
		for (const link of book.links)
			expect(index.resolve(link.sourceKey, link.rawHref).kind).toBe("resolved");
	});

	test("file-only, empty fragment and empty href use first part", () => {
		const index = registry(source("# First\n\nbody\n\n## Last"), [2]);
		for (const href of ["book.md", "book.md#", "#", ""])
			expect(index.resolve("/books/book.md", href)).toEqual({
				kind: "resolved",
				href: "chapter-1.html",
			});
		expect(index.resolve("/books/book.md", "#missing")).toMatchObject({
			kind: "unresolved",
			href: "#missing",
			diagnostic: { code: "W_LINK_UNRESOLVED" },
		});
	});

	test("reassignment follows new numbering while preserving target identity", () => {
		const parsed = source("# First\n\nbody\n\n## Last");
		const index = registry(parsed);
		const id = required(parsed.anchors.at(-1)).targetId;
		expect(index.target(id)).toEqual({ href: "chapter-1.html", id: "Last" });
		index.assignParts(parts(parsed, [2], 10));
		expect(index.target(id)).toEqual({ href: "chapter-11.html", id: "Last" });
		expect(index.resolve(parsed.descriptor.key, "#Last")).toMatchObject({
			href: "chapter-11.html#Last",
			targetId: id,
		});
	});

	test("Unicode aliases decode once, normalize NFC and preserve case", () => {
		const parsed = source("# Привет\n\n## Café\n\n## Exact");
		const index = registry(parsed);
		for (const href of ["#Привет", "#%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82"])
			expect(index.resolve(parsed.descriptor.key, href)).toMatchObject({
				href: `chapter-1.html#${required(parsed.anchors[0]).id}`,
			});
		expect(index.resolve(parsed.descriptor.key, "#Cafe\u0301")).toMatchObject({
			href: "chapter-1.html#Cafe",
		});
		expect(index.resolve(parsed.descriptor.key, "#exact").kind).toBe(
			"unresolved",
		);
	});

	test("encoded filenames, hash, question mark and percent are decoded only after URI splitting", () => {
		const parsed = source("# Target", "/books/dir/a #?(100%)%20.md");
		const index = registry(parsed);
		const uri = "dir/a%20%23%3F(100%25)%2520.md#Target";
		expect(index.resolve("/books/index.md", uri)).toMatchObject({
			kind: "resolved",
			href: "chapter-1.html#Target",
		});
		expect(
			index.resolve(
				"/books/dir/index.md",
				"../dir/a%20%23%3F(100%25)%2520.md#Target",
			).kind,
		).toBe("resolved");
		expect(
			index.resolve("/books/index.md", uri.replace("a%20", "A%20")).kind,
		).toBe("unresolved");
	});

	test("literal percent aliases are decoded once", () => {
		const parsed = source("# rate%20");
		const index = registry(parsed);
		expect(index.resolve(parsed.descriptor.key, "#rate%2520")).toMatchObject({
			kind: "resolved",
			href: `chapter-1.html#${required(parsed.anchors[0]).id}`,
		});
		expect(index.resolve(parsed.descriptor.key, "#rate%20").kind).toBe(
			"unresolved",
		);
	});

	test("URI schemes and protocol-relative links remain byte-identical external values", () => {
		const index = registry(source("# A"));
		for (const href of [
			"https://site/book.md#%ZZ",
			"HTTP://x/a?x=1#Русский",
			"mailto:me@example.org",
			"tel:+123",
			"data:text/plain,a#x",
			"urn:example:book",
			"//host/book.md#x",
		])
			expect(index.resolve("/books/book.md", href)).toEqual({
				kind: "external",
				href,
			});
	});

	test("local queries and malformed encodings produce stable diagnostics with raw href", () => {
		const index = registry(source("# A"));
		for (const href of ["book.md?q=1#A", "?x=1"])
			expect(index.resolve("/books/book.md", href)).toMatchObject({
				kind: "unresolved",
				href,
				diagnostic: { code: "W_LINK_QUERY", href },
			});
		for (const href of ["#%ZZ", "%ZZ.md#A", "#%C0%AF", "#%", "#%E2%82"])
			expect(index.resolve("/books/book.md", href)).toMatchObject({
				kind: "unresolved",
				href,
				diagnostic: { code: "W_LINK_ENCODING", href },
			});
		expect(index.resolve("/books/book.md", "#A?literal")).toMatchObject({
			diagnostic: { code: "W_LINK_UNRESOLVED" },
		});
	});

	test("duplicate heading aliases use first occurrence and suffixed ID reaches the later one", () => {
		const parsed = source("# Repeat\n\nbody\n\n## Repeat\n\nbody\n\n## Repeat");
		const index = registry(parsed, [2, 4]);
		expect(index.resolve(parsed.descriptor.key, "#Repeat")).toMatchObject({
			href: "chapter-1.html#Repeat",
		});
		expect(index.resolve(parsed.descriptor.key, "#Repeat-2")).toMatchObject({
			href: "chapter-2.html#Repeat-2",
		});
		expect(index.resolve(parsed.descriptor.key, "#Repeat-3")).toMatchObject({
			href: "chapter-3.html#Repeat-3",
		});
	});

	test("exact Unicode aliases disambiguate transliteration collisions", () => {
		const parsed = source("# 東\n\n## 西");
		const index = registry(parsed, [1]);
		expect(index.resolve(parsed.descriptor.key, "#東")).toMatchObject({
			href: "chapter-1.html#section",
		});
		expect(index.resolve(parsed.descriptor.key, "#西")).toMatchObject({
			href: "chapter-2.html#section-2",
		});
		expect(index.resolve(parsed.descriptor.key, "#section")).toMatchObject({
			href: "chapter-1.html#section",
		});
		expect(index.resolve(parsed.descriptor.key, "#北")).toMatchObject({
			kind: "ambiguous",
			href: "#北",
			diagnostic: { code: "W_LINK_AMBIGUOUS" },
		});
	});

	test("unique transliteration fallback resolves to an existing target", () => {
		const parsed = source("# Dóng");
		const index = registry(parsed);
		// Combining accents differ, but the ASCII candidate is unique.
		expect(index.resolve(parsed.descriptor.key, "#Dông").kind).toBe("resolved");
	});

	test("exact explicit alias wins over a Unicode heading alias", () => {
		const parsed = source("# Русский\n\n## Explicit {#Custom}");
		required(parsed.anchors[1]).aliases.push("Русский");
		const index = registry(parsed);
		expect(index.resolve(parsed.descriptor.key, "#Русский")).toMatchObject({
			targetId: required(parsed.anchors[1]).targetId,
		});
	});

	test("identical IDs in distinct sources do not collide", () => {
		const a = source("# Same", "/books/a.md", 1);
		const b = source("# Same", "/books/b.md", 2);
		const index = new EpubAnchorRegistry();
		index.registerSource(a);
		index.registerSource(b);
		index.assignParts([...parts(a), ...parts(b, [], 2)]);
		expect(index.resolve(a.descriptor.key, "#Same")).toMatchObject({
			href: "chapter-1.html#Same",
		});
		expect(index.resolve(a.descriptor.key, "b.md#Same")).toMatchObject({
			href: "chapter-2.html#Same",
		});
	});

	test("duplicate emitted IDs fail registration atomically", () => {
		const parsed = source("# One\n\n## Two");
		required(parsed.anchors[1]).id = required(parsed.anchors[0]).id;
		const index = new EpubAnchorRegistry();
		try {
			index.registerSource(parsed);
			throw new Error("Expected duplicate failure");
		} catch (error) {
			expect(error).toBeInstanceOf(EpubBuildError);
			expect((error as EpubBuildError).code).toBe("E_ANCHOR_DUPLICATE");
		}
		expect(index.getTargets()).toHaveLength(0);
	});

	test("invalid partitions cannot silently change a valid mapping", () => {
		const parsed = source("# One\n\nbody\n\n## Two");
		const index = registry(parsed);
		const valid = parts(parsed, [2]);
		for (const bad of [
			[],
			[required(valid[1])],
			[{ ...required(valid[0]), endUnitExclusive: 3 }, required(valid[1])],
			[{ ...required(valid[0]), firstUnit: -1 }, required(valid[1])],
			[
				required(valid[0]),
				{ ...required(valid[1]), href: required(valid[0]).href },
			],
		])
			expect(() => index.assignParts(bad)).toThrow();
		expect(index.resolve(parsed.descriptor.key, "#Two")).toMatchObject({
			href: "chapter-1.html#Two",
		});
	});

	test("page targets keep occurrence IDs and source-local labels", () => {
		const parsed = source(
			"<!-- Page 12 -->\n\nfirst\n\n<!-- Page 12 -->\n\nsecond",
		);
		const index = registry(parsed);
		expect(parsed.pages).toHaveLength(2);
		expect(index.resolve(parsed.descriptor.key, "#12")).toMatchObject({
			targetId: required(parsed.pages[0]).targetId,
		});
		expect(
			index.resolve(parsed.descriptor.key, `#${required(parsed.pages[1]).id}`),
		).toMatchObject({ targetId: required(parsed.pages[1]).targetId });
		expect(index.getDiagnostics()).toMatchObject([
			{ code: "W_DUPLICATE_PAGE" },
		]);
	});

	test("unknown targets and unresolved assignments cannot produce fabricated hrefs", () => {
		const parsed = source("# One");
		const index = new EpubAnchorRegistry();
		index.registerSource(parsed);
		expect(() => index.target(required(parsed.anchors[0]).targetId)).toThrow();
		expect(() => index.target("nonexistent")).toThrow();
		expect(index.resolve(parsed.descriptor.key, "#One").kind).toBe(
			"unresolved",
		);
		expect(index.resolve(parsed.descriptor.key, "missing.md#One").kind).toBe(
			"unresolved",
		);
	});
});
