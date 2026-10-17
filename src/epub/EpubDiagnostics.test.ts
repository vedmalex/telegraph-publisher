import { expect, test } from "bun:test";
import { createBuildState, finalizeReport } from "./EpubDiagnostics";
import { normalizeEpubOptions } from "./EpubOptions";

const options = normalizeEpubOptions({
	outputPath: "book.epub",
	title: "Book",
	author: "Author",
	maxChapterBytes: 4096,
});
test("report is deterministic, relative and independent of completion order", () => {
	const state = createBuildState(options, "/books");
	state.sources.push(
		{
			descriptor: {
				key: "/books/b.md",
				ordinal: 1,
				title: "B",
				originalBytes: 10,
				sha256: "b",
				metadata: {},
			},
			units: 2,
		},
		{
			descriptor: {
				key: "/books/a.md",
				ordinal: 0,
				title: "A",
				originalBytes: 30,
				sha256: "a",
				metadata: {},
			},
			units: 3,
		},
	);
	state.documents.push(
		{
			href: "chapter-2.html",
			kind: "content",
			bytes: 5000,
			oversized: false,
			splittable: false,
		},
		{
			href: "chapter-1.html",
			kind: "content",
			bytes: 100,
			oversized: false,
			splittable: true,
		},
	);
	state.diagnostics.push(
		{
			code: "W_LINK_UNRESOLVED",
			severity: "warning",
			source: "/books/b.md",
			message: "B",
		},
		{
			code: "W_OVERSIZE",
			severity: "warning",
			source: "/books/a.md",
			message: "A",
		},
	);
	state.counters.localLinks = 4;
	state.counters.resolvedLinks = 3;
	state.counters.unresolvedLinks = 1;
	const result = finalizeReport(state);
	expect(result.sources.map((source) => source.path)).toEqual(["a.md", "b.md"]);
	expect(result.diagnostics.map((diagnostic) => diagnostic.source)).toEqual([
		"a.md",
		"b.md",
	]);
	expect(result.counters).toMatchObject({
		sourceBytes: 40,
		atomicUnits: 5,
		contentParts: 2,
		oversizedDocuments: 1,
		maxXhtmlBytes: 5000,
		localLinks: 4,
	});
	state.sources.reverse();
	state.documents.reverse();
	state.diagnostics.reverse();
	expect(finalizeReport(state)).toEqual(result);
	expect(JSON.stringify(result)).not.toContain("/books");
	const document = result.documents[0];
	if (!document) throw new Error("Expected a report document");
	document.bytes = 1;
	expect(finalizeReport(state).documents[0]?.bytes).toBe(100);
});
test("disabled size policy and dry-run retain exact measured bytes", () => {
	const state = createBuildState(
		{ ...options, maxChapterBytes: null, dryRun: true },
		"/books",
	);
	state.documents.push({
		href: "nav.xhtml",
		kind: "navigation",
		bytes: 999999,
		oversized: true,
		splittable: false,
	});
	expect(finalizeReport(state)).toMatchObject({
		mode: "dry-run",
		outputCommitted: false,
		counters: { oversizedDocuments: 0, maxXhtmlBytes: 999999 },
	});
});
