import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpubGenerator } from "./epub/EpubGenerator";
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";
import type { TelegraphNode } from "./telegraphPublisher";

const convert = (source: string, target: "telegraph" | "epub" = "telegraph") =>
	convertMarkdownToTelegraphNodes(source, { generateToc: false, target });
const descendants = (nodes: (string | TelegraphNode)[], tag: string): TelegraphNode[] =>
	nodes.flatMap(node => typeof node === "string" ? [] : [
		...(node.tag === tag ? [node] : []), ...descendants(node.children ?? [], tag),
	]);
const text = (nodes: (string | TelegraphNode)[]): string =>
	nodes.map(node => typeof node === "string" ? node : text(node.children ?? [])).join("");

for (const target of ["telegraph", "epub"] as const) {
	describe(`${target} list ownership`, () => {
		test("23 adjacent inventory entries form distinct items for both ordered delimiters and CRLF", () => {
			for (const delimiter of [")", "."]) {
				const source = Array.from({ length: 23 }, (_, i) => `${i + 1}${delimiter} ${i < 9 ? " " : ""}Предмет ${i + 1};`).join("\r\n");
				const result = convert(source, target);
				expect(result).toHaveLength(1);
				expect(result[0]?.tag).toBe("ol");
				const items = descendants(result, "li");
				expect(items).toHaveLength(23);
				items.forEach((item, i) => expect(text(item.children ?? [])).toBe(`Предмет ${i + 1};`));
			}
		});

		test("ritual steps retain indented paragraphs, bold labels, image and mantra hard breaks", () => {
			const result = convert("7) **Пунар-ачамана**\n    Предложите воду;\n\n8) **Снана**\n    Очистите Божество;\n\n    **Омовение**\n\n    `идам̇ сна̄нӣйам`  \n    `клӣм̇ кр̣ш̣н̣а̄йа намах̣`  \n\n    ![Снания-мудра](./mudras/snaniya.png)\n\n    Затем омойте Господа;\n\n9) **Вастра**\n    Предложите одежду;", target);
			expect(descendants(result, "img")).toHaveLength(1);
			expect(descendants(result, "br")).toHaveLength(1);
			expect(descendants(result, "code")).toHaveLength(2);
			if (target === "epub") {
				const items = result[0]!.children as TelegraphNode[];
				expect(result[0]!.attrs).toEqual({ start: "7" });
				expect(items).toHaveLength(3);
				expect(descendants([items[1]!], "img")).toHaveLength(1);
				expect(text(items[1]!.children ?? [])).toContain("Затем омойте Господа;");
				expect(text(items[2]!.children ?? [])).not.toContain("омойте");
			} else {
				expect(descendants(result, "ol")).toHaveLength(0);
				expect(text(result)).toContain("7. Пунар-ачамана");
				expect(text(result)).toContain("8. Снана");
				expect(text(result)).toContain("9. Вастра");
			}
		});

		test("nested mixed list and dedented continuation return to the correct parent", () => {
			const result = convert("1) Первый\n  + Вложенный\n    1) Глубокий\n  * Второй вложенный\n  Продолжение первого\n2) Второй\n\nСнаружи\n\n![Отдельно](image.png)", target);
			const root = result[0]!;
			expect(root.tag).toBe("ol");
			expect(root.children).toHaveLength(2);
			const first = root.children![0] as TelegraphNode;
			expect(descendants([first], "ul")[0]!.children).toHaveLength(2);
			expect(text(descendants([first], "ul")[0]!.children ?? [])).not.toContain("Продолжение первого");
			expect(text(first.children ?? [])).toContain("Продолжение первого");
			expect(descendants([root], "img")).toHaveLength(0);
			expect(text(result.slice(1))).toContain("Снаружи");
		});

		test("fences, numeric headings, horizontal rules and outside paragraphs are block boundaries", () => {
			const source = "```md\n1) example\n```\n\n~~~md\n2) example\n~~~\n\n## 7) Heading\n\n1) Real\n\n---\n\nOutside";
			const result = convert(source, target);
			expect(descendants(result, "pre")).toHaveLength(2);
			expect(descendants(result, "li")).toHaveLength(1);
			expect(descendants(result, "hr")).toHaveLength(1);
			expect(text(result)).toContain("7) Heading");
			expect(text(result.slice(-1))).toBe("Outside");
		});

		test("indented fenced examples remain literal inside the item", () => {
			const result = convert("1) Instruction\n\n   ```md\n   7) Literal\n   ```\n2) Next", target);
			expect(descendants(result, "li")).toHaveLength(2);
			expect(descendants(result, "pre")).toHaveLength(1);
			expect(text(descendants(result, "pre"))).toBe("7) Literal");
		});
	});
}

test("EPUB preserves starts, gaps and repeats through semantic numbering attributes", () => {
	const result = convert("7) Seven\n9) Nine\n9) Repeat\n10) Ten", "epub");
	expect(result[0]?.attrs).toEqual({ start: "7" });
	const items = result[0]!.children as TelegraphNode[];
	expect(items.map(item => item.attrs)).toEqual([undefined, { value: "9" }, { value: "9" }, undefined]);
	expect(items.map(item => text(item.children ?? []))).toEqual(["Seven", "Nine", "Repeat", "Ten"]);
});

test("Telegraph explicit numbering uses paragraphs with no automatic numbering or unsupported attributes", () => {
	const result = convert("7) Seven\n9) Nine\n9) Repeat\n10) Ten");
	expect(result.map(node => node.tag)).toEqual(["p", "p", "p", "p"]);
	expect(result.map(node => text(node.children ?? []))).toEqual(["7. Seven", "9. Nine", "9. Repeat", "10. Ten"]);
	expect(result.every(node => !node.attrs)).toBe(true);
});


test("Telegraph natural sequence retains multiline bodies and media inside li", () => {
	const result = convert("1) First\n   Continue first\n\n   **Label**\n\n   `one`  \n   `two`  \n\n   ![Gesture](gesture.png)\n2) Second\n   Continue second");
	expect(result).toHaveLength(1);
	expect(result[0]!.tag).toBe("ol");
	const items = result[0]!.children as TelegraphNode[];
	expect(items).toHaveLength(2);
	expect(text(items[0]!.children ?? [])).toContain("Continue first");
	expect(text(items[0]!.children ?? [])).not.toContain("Continue second");
	expect(descendants([items[0]!], "p")).toHaveLength(3);
	expect(descendants([items[0]!], "img")).toHaveLength(1);
	expect(descendants([items[0]!], "br")).toHaveLength(1);
	expect(descendants([items[1]!], "img")).toHaveLength(0);
});

test("EPUB archive serializes numbered list attributes and multiple item blocks", async () => {
	const directory = mkdtempSync(join(tmpdir(), "publisher-list-"));
	try {
		const source = join(directory, "chapter.md");
		const outputPath = join(directory, "book.epub");
		writeFileSync(source, "# Ritual\n\n7) **First**\n    Initial paragraph\n\n    Second paragraph\n\n    `mantra one`  \n    `mantra two`  \n\n9) **Next**\n    Final instruction");
		const generator = new EpubGenerator({ outputPath, title: "List integration", author: "Test" });
		await generator.addChapterFromFile(source, { generateToc: false });
		await generator.generate();
		const chapter = execFileSync("unzip", ["-p", outputPath, "OEBPS/chapter-1.html"], { encoding: "utf8" });
		expect(chapter).toContain('<ol start="7">');
		expect(chapter).toContain('<li value="9">');
		expect(chapter).toMatch(/<li>[\s\S]*Initial paragraph[\s\S]*<p>Second paragraph<\/p>[\s\S]*<code>mantra one<\/code><br\s*\/?>[\s\S]*<code>mantra two<\/code>[\s\S]*<\/li>\s*<li value="9">/);
		expect(chapter).toContain("Final instruction");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
