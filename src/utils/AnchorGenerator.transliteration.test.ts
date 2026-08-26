import { describe, expect, test } from "bun:test";
import { AnchorGenerator } from "./AnchorGenerator";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";

const t = (s: string) => AnchorGenerator.transliterateToAscii(s);

describe("AnchorGenerator.transliterateToAscii", () => {
	test("transliterates Cyrillic to Latin (practical GOST 7.79 B)", () => {
		expect(t("Текст-1")).toBe("Tekst-1");
		expect(t("Жизнь-Чайтаньи")).toBe("Zhizn-Chajtani");
		expect(t("Щедрость")).toBe("Shchedrost");
		expect(t("Юная-Ямуна")).toBe("Yunaya-Yamuna");
		expect(t("Ёлка")).toBe("Yolka");
	});

	test("treats х as Sanskrit aspiration (h)", () => {
		expect(t("Бхагавад-гита")).toBe("Bhagavad-gita");
		expect(t("Прабхупада")).toBe("Prabhupada");
		expect(t("Хари")).toBe("Hari");
	});

	test("strips IAST diacritics to base letters", () => {
		expect(t("ṛ-ḷ-ṅ-ñ-ṭ-ḍ-ṇ-ś-ṣ-ṁ-ḥ")).toBe("r-l-n-n-t-d-n-s-s-m-h");
	});

	test("doubles long vowels (macron) to keep pairs distinct", () => {
		expect(t("ā-ī-ū")).toBe("aa-ii-uu");
		expect(t("ṝ")).toBe("rr"); // macron after another combining mark
		expect(t("Шрӣ")).toBe("Shrii");
		expect(t("Шри")).toBe("Shri");
		expect(t("гӣта̄")).toBe("giitaa");
		// The very collision the doubling exists for:
		expect(t("Шри")).not.toBe(t("Шрӣ"));
	});

	test("typographic dashes become hyphens instead of vanishing", () => {
		expect(t("Текст-1–2")).toBe("Tekst-1-2"); // en dash
		expect(t("Текст-1—2")).toBe("Tekst-1-2"); // em dash
		// The real collision met in the library: «Текст 1–2» vs «Текст 12»
		expect(t("Текст-1–2")).not.toBe(t("Текст-12"));
	});

	test("is deterministic and idempotent", () => {
		for (const s of ["Текст-1", "Шрӣла-Прабхупа̄да", "> Глава", "ā-ī"]) {
			const once = t(s);
			expect(t(s)).toBe(once);
			expect(t(once)).toBe(once); // already-ASCII anchors pass through unchanged
		}
	});

	test("never returns an empty or XML-invalid id", () => {
		expect(t("")).toBe("section");
		expect(t("देवनागरी")).toBe("section"); // no ASCII equivalent at all
		expect(t("开始")).toBe("section");
		expect(t("1.-Глава")).toBe("id-1.-Glava"); // XML ID cannot start with a digit
		const anchors = ["Текст-1", "1-Глава", "देव", "> Пять", ">> Шесть"];
		for (const a of anchors) {
			expect(t(a)).toMatch(/^[A-Za-z_][A-Za-z0-9._-]*$/);
		}
	});

	test("keeps the H5/H6 '>' level prefixes distinct as underscores", () => {
		expect(t(">-Текст")).toBe("_-Tekst");
		expect(t(">>-Текст")).toBe("__-Tekst");
		expect(t(">-Текст")).not.toBe(t(">>-Текст"));
		expect(t(">-Текст")).not.toBe(t("Текст"));
	});
});

describe("generateAsciiAnchor", () => {
	test("is the transliteration of the Telegraph anchor", () => {
		const headings = AnchorGenerator.parseHeadingsFromContent("### Текст 1\n\n##### Шрӣ Гуру");
		expect(headings).toHaveLength(2);
		expect(AnchorGenerator.generateAnchor(headings[0]!)).toBe("Текст-1");
		expect(AnchorGenerator.generateAsciiAnchor(headings[0]!)).toBe("Tekst-1");
		expect(AnchorGenerator.generateAnchor(headings[1]!)).toBe(">-Шрӣ-Гуру");
		expect(AnchorGenerator.generateAsciiAnchor(headings[1]!)).toBe("_-Shrii-Guru");
	});
});

describe("target-dependent anchors in convertMarkdownToTelegraphNodes", () => {
	const markdown = "## Глава первая\n\nтекст\n\n### Текст 1\n\nстих\n\n### Текст 2\n\nстих";

	test("telegraph target keeps Cyrillic hrefs and no heading ids (byte-for-byte)", () => {
		const nodes = convertMarkdownToTelegraphNodes(markdown, { target: "telegraph" });
		const json = JSON.stringify(nodes);
		expect(json).toContain('"href":"#Глава-первая"');
		expect(json).toContain('"href":"#Текст-1"');
		expect(json).not.toContain('"id"');
		expect(json).not.toContain("Tekst");
		expect(json).not.toContain("Glava");
	});

	test("epub target produces matching ASCII ids and hrefs", () => {
		const nodes = convertMarkdownToTelegraphNodes(markdown, { target: "epub" });
		const json = JSON.stringify(nodes);
		expect(json).toContain('"id":"Tekst-1"');
		expect(json).toContain('"href":"#Tekst-1"');
		expect(json).toContain('"id":"Glava-pervaya"');
		expect(json).toContain('"href":"#Glava-pervaya"');
		// no Cyrillic ids or hrefs remain
		expect(json).not.toContain('"href":"#Текст-1"');
		expect(json).not.toContain('"id":"Текст-1"');
	});

	test("every epub toc href resolves to a heading id in the same document", () => {
		const nodes = convertMarkdownToTelegraphNodes(markdown, { target: "epub" });
		const ids = new Set<string>();
		const hrefs: string[] = [];
		const walk = (list: any[]) => {
			for (const node of list) {
				if (typeof node === "string") continue;
				if (node.attrs?.id) ids.add(node.attrs.id);
				if (node.attrs?.href?.startsWith("#")) hrefs.push(node.attrs.href.slice(1));
				if (Array.isArray(node.children)) walk(node.children);
			}
		};
		walk(nodes as any[]);
		expect(hrefs.length).toBeGreaterThan(0);
		for (const href of hrefs) {
			expect(ids.has(href)).toBe(true);
			expect(href).toMatch(/^[A-Za-z_][A-Za-z0-9._-]*$/);
		}
	});
});
