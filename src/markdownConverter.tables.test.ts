import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpubGenerator } from "./epub/EpubGenerator";
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";
import type { TelegraphNode } from "./telegraphPublisher";

type Target = "telegraph" | "epub";
const convert = (source: string, target: Target) =>
	convertMarkdownToTelegraphNodes(source, { generateToc: false, target });
const descendants = (nodes: (string | TelegraphNode)[], tag: string): TelegraphNode[] =>
	nodes.flatMap(node => typeof node === "string" ? [] : [
		...(node.tag === tag ? [node] : []), ...descendants(node.children ?? [], tag),
	]);
const text = (nodes: (string | TelegraphNode)[]): string =>
	nodes.map(node => typeof node === "string" ? node : text(node.children ?? [])).join("");
const renderedRows = (nodes: TelegraphNode[], target: Target): string[][] => target === "epub"
	? descendants(nodes, "tbody").flatMap(body => (body.children as TelegraphNode[]).map(row =>
		(row.children as TelegraphNode[]).map(cell => text(cell.children ?? []))))
	: descendants(nodes, "ul").map(row => (row.children as TelegraphNode[]).map(cell => text(cell.children ?? [])));

for (const target of ["telegraph", "epub"] as const) {
	describe(`${target} table column integrity`, () => {
		test("all empty headers preserve every row value and explicit empty cells", () => {
			const nodes = convert("| | |\n| --- | --- |\n| first | last |\n| | empty neighbour |", target);
			expect(renderedRows(nodes, target)).toEqual(target === "epub"
				? [["first", "last"], ["", "empty neighbour"]]
				: [["—: first", "—: last"], ["—: ", "—: empty neighbour"]]);
			if (target === "epub") expect(descendants(nodes, "th").map(cell => cell.children)).toEqual([[""], [""]]);
		});

		test("blank leading and interior headers do not shift seven columns", () => {
			const nodes = convert("| | Second | Third | | Fifth | Sixth | Seventh |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 | 6 | LAST7 |", target);
			expect(renderedRows(nodes, target)).toEqual([target === "epub"
				? ["1", "2", "3", "4", "5", "6", "LAST7"]
				: ["—: 1", "Second: 2", "Third: 3", "—: 4", "Fifth: 5", "Sixth: 6", "Seventh: LAST7"]]);
		});

		test("leading and trailing borders are independent for every row", () => {
			for (const headerBorders of [[false, false], [true, false], [false, true], [true, true]]) {
				for (const rowBorders of [[false, false], [true, false], [false, true], [true, true]]) {
					const wrap = (value: string, borders: boolean[]) => `${borders[0] ? "|" : ""}${value}${borders[1] ? "|" : ""}`;
					const nodes = convert([wrap("A | B", headerBorders), wrap("--- | :---:", rowBorders), wrap("left | right", rowBorders)].join("\n"), target);
					expect(renderedRows(nodes, target)).toEqual([target === "epub" ? ["left", "right"] : ["A: left", "B: right"]]);
				}
			}
		});

		test("odd pipe escapes remain literal and even backslashes permit separators", () => {
			for (const count of [1, 2, 3, 4]) {
				const escape = "\\".repeat(count);
				const nodes = convert(`| A | B | C |\n| --- | --- | --- |\n| left${escape}|middle | end |`, target);
				const rows = renderedRows(nodes, target);
				const value = (i: number) => target === "epub" ? rows[0]![i] : rows[0]![i]!.split(": ").slice(1).join(": ");
				if (count % 2 === 1) {
					expect(value(0)).toBe(`left${"\\".repeat(count - 1)}|middle`);
					expect(value(1)).toBe("end");
				} else {
					expect(value(0)).toBe(`left${escape}`);
					expect(value(1)).toBe("middle");
					expect(value(2)).toBe("end");
				}
			}
		});

		test("escaped header pipe stays one heading and invalid escaped delimiter is rejected", () => {
			const nodes = convert("| Left\\|right | B |\n| --- | --- |\n| x | y |", target);
			expect(target === "epub" ? text(descendants(nodes, "th")[0]!.children ?? []) : renderedRows(nodes, target)[0]![0]).toBe(target === "epub" ? "Left|right" : "Left|right: x");
			expect(descendants(convert("A | B\n---\\|---\nx | y", target), target === "epub" ? "table" : "ol")).toHaveLength(0);
		});

		test("short and long rows and wider delimiter retain data with padding", () => {
			const nodes = convert("A | B\n--- | --- | ---\nx | y\n1 | 2 | 3 | EXTRA", target);
			expect(renderedRows(nodes, target)).toEqual(target === "epub"
				? [["x", "y", "", ""], ["1", "2", "3", "EXTRA"]]
				: [["A: x", "B: y", "—: ", "—: "], ["A: 1", "B: 2", "—: 3", "—: EXTRA"]]);
			if (target === "epub") expect(descendants(nodes, "th")).toHaveLength(4);
		});

		test("delimiter width alone contributes columns and header-only tables remain tables", () => {
			const nodes = convert("A | B\n--- | --- | ---\nx | y", target);
			expect(renderedRows(nodes, target)[0]).toHaveLength(3);
			expect(convert("| A | B |\n| --- | --- |", target)[0]!.tag).toBe(target === "epub" ? "table" : "ol");
		});

		test("inline bold and links survive, and backtick pipes are still separators", () => {
			const nodes = convert("A | B\n--- | ---\n**bold** | [link](https://example.com)", target);
			expect(descendants(nodes, "strong")).toHaveLength(1);
			expect(descendants(nodes, "a")[0]!.attrs?.href).toBe("https://example.com");
			expect(renderedRows(convert("A | B\n--- | ---\n`left|right` | tail", target), target)[0]).toHaveLength(3);
		});

		test("Sanskrit pipe lines and standalone delimiters are not tables", () => {
			const nodes = convert("*śrī kṛṣṇa* |\n*hare rāma* ||\n\n| --- | --- |", target);
			expect(descendants(nodes, target === "epub" ? "table" : "ol")).toHaveLength(0);
			expect(descendants(nodes, "em")).toHaveLength(2);
			for (const verse of ["*verse |*", "verse |", "verse ||"]) {
				const result = convert(`${verse}\n---`, target);
				expect(descendants(result, target === "epub" ? "table" : "ol")).toHaveLength(0);
				expect(descendants(result, "hr")).toHaveLength(1);
			}
		});
	});
}

test("EPUB archive serializes empty header cells without losing trailing values", async () => {
	const directory = mkdtempSync(join(tmpdir(), "publisher-table-"));
	try {
		const source = join(directory, "chapter.md");
		const outputPath = join(directory, "book.epub");
		writeFileSync(source, "# Tables\n\n| | Second |\n| --- | --- |\n| first | last |\n\n| | |\n| --- | --- |\n| allblankfirst | allblanklast |");
		const generator = new EpubGenerator({ outputPath, title: "Table integration", author: "Test" });
		await generator.addChapterFromFile(source, { generateToc: false });
		await generator.generate();
		const chapter = execFileSync("unzip", ["-p", outputPath, "OEBPS/chapter-1.html"], { encoding: "utf8" });
		expect(chapter).toContain("<th></th>");
		expect(chapter).toContain("<td>last</td>");
		expect(chapter).toContain("<td>allblankfirst</td>");
		expect(chapter).toContain("<td>allblanklast</td>");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
