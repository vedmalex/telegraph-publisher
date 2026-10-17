import { describe, expect, test } from "bun:test";
import { EpubBlockFramer, type FramedBlock } from "./EpubBlockFramer";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import { EpubBuildError } from "./EpubTypes";

describe("EpubBlockFramer", () => {
	const diverseSamples = [
		{
			name: "shlokas with single and double dandas",
			markdown: `# Invocation

nama oṁ viṣṇu-pādāya kṛṣṇa-preṣṭhāya bhū-tale |
śrīmate bhaktivedānta-svāmin iti nāmine || 1 ||

namas te sārasvate deve gaura-vāṇī-pracāriṇe |
nirviśeṣa-śūnyavādi-pāścātya-deśa-tāriṇe || 2 ||
`,
		},
		{
			name: "fences with nested backticks and tildes",
			markdown: `## Outer Section

\`\`\`\`markdown
\`\`\`js
const a = 1;
\`\`\`
## False Inner Heading
\`\`\`\`

~~~~
\`\`\`
Inside Tilde
\`\`\`
~~~~

Paragraph after code.
`,
		},
		{
			name: "GFM tables with align and escaped pipes",
			markdown: `# Table Test

| Header 1 | Header 2 \\| Escaped | Header 3 |
| :------- | :------------------: | -------: |
| Left     | Center               | Right    |
| Cell A   | Cell B               | Cell C   |

Paragraph following table.
`,
		},
		{
			name: "nested and loose lists with blank lines",
			markdown: `1. First item
   Continued paragraph in first item.

2. Second item
   * Sub-item A
   * Sub-item B
     1. Deep item i
     2. Deep item ii

3. Third item
`,
		},
		{
			name: "blockquotes with lazy continuation and inner markup",
			markdown: `> Line 1 of blockquote
lazy continuation line 2
> line 3 with **bold**

Regular paragraph after blockquote.
`,
		},
		{
			name: "reference links and definitions",
			markdown: `Check out [first link][ref1] and [second link][ref2].

[ref1]: https://example.com/one "Title 1"
[ref2]: https://example.com/two "Title 2"

Final text.
`,
		},
		{
			name: "headings with custom IDs and levels 1 to 8",
			markdown: `# H1 Title {#main-title}

## H2 Subtitle {#sub-title}

####### H7 Extended Heading

Paragraph under extended heading.
`,
		},
	];

	describe("Chunk boundary invariance", () => {
		for (const sample of diverseSamples) {
			test(`sample "${sample.name}" produces identical FramedBlock[] across chunk sizes (1, 3, 7, 31, full)`, () => {
				const framerFull = new EpubBlockFramer();
				const fullBlocks = [
					...framerFull.push(sample.markdown),
					...framerFull.finish(),
				];

				for (const chunkSize of [1, 3, 7, 31]) {
					const framerChunked = new EpubBlockFramer();
					const chunkedBlocks: FramedBlock[] = [];
					for (let i = 0; i < sample.markdown.length; i += chunkSize) {
						chunkedBlocks.push(
							...framerChunked.push(sample.markdown.slice(i, i + chunkSize)),
						);
					}
					chunkedBlocks.push(...framerChunked.finish());

					expect(chunkedBlocks).toEqual(fullBlocks);
				}

				// Check that concatenated blocks reproduce original text
				const reconstructed = fullBlocks.map((b) => b.raw).join("");
				expect(reconstructed).toBe(sample.markdown);

				// Check contiguous range ledger without gaps or overlaps
				let expectedByte = 0;
				let expectedLine = 1;
				for (const b of fullBlocks) {
					expect(b.range.startByte).toBe(expectedByte);
					expect(b.range.startLine).toBe(expectedLine);
					expect(b.range.endByte).toBe(
						expectedByte + Buffer.byteLength(b.raw, "utf8"),
					);
					expect(b.range.endLine).toBe(
						expectedLine + (b.raw.match(/\n/g)?.length ?? 0),
					);
					expectedByte = b.range.endByte;
					expectedLine = b.range.endLine;
				}
				expect(expectedByte).toBe(Buffer.byteLength(sample.markdown, "utf8"));
			});
		}
	});

	describe("Differential oracle with parseEpubMarkdown", () => {
		for (const sample of diverseSamples) {
			test(`framed blocks match AST token semantics of parseEpubMarkdown for "${sample.name}"`, () => {
				const parsed = parseEpubMarkdown(sample.markdown, "test.md");
				const framer = new EpubBlockFramer();
				const blocks = [...framer.push(sample.markdown), ...framer.finish()];

				// Filter out pure whitespace blocks
				const contentBlocks = blocks.filter(
					(b) => b.raw.trim().length > 0 && b.type !== "def",
				);

				expect(contentBlocks.length).toBe(parsed.units.length);

				for (let i = 0; i < parsed.units.length; i++) {
					const unit = parsed.units[i];
					const block = contentBlocks[i];
					expect(unit).toBeDefined();
					expect(block).toBeDefined();
					if (!unit || !block) continue;

					// Verify kind alignment
					const expectedKind =
						block.type === "hr"
							? "rule"
							: [
										"heading",
										"code",
										"list",
										"blockquote",
										"table",
										"html",
									].includes(block.type ?? "")
								? block.type
								: "paragraph";
					expect(unit.kind).toBe(expectedKind as typeof unit.kind);

					// Verify exact range alignment
					expect(unit.range).toEqual(block.range);

					// Verify payload token parity
					const payload = parsed.payloadStore.get(unit.payloadRef);
					expect(payload).toBeDefined();
					expect(payload?.tokens[0]?.raw.trim()).toBe(block.raw.trim());
				}

				// Verify definition parity
				const defBlocks = blocks.filter((b) => b.type === "def");
				expect(defBlocks.length).toBe(parsed.definitions.size);

				// Verify coverage range parity
				expect(blocks.map((b) => b.range)).toEqual(parsed.coverage.ranges);
			});
		}
	});

	describe("Buffering of incomplete blocks", () => {
		test("unclosed fenced code block is held in buffer until closing fence arrives", () => {
			const framer = new EpubBlockFramer();
			const part1 = "```js\nconst x = 1;\n";
			const blocks1 = framer.push(part1);
			expect(blocks1).toHaveLength(0);

			const part2 = "console.log(x);\n";
			const blocks2 = framer.push(part2);
			expect(blocks2).toHaveLength(0);

			const part3 = "```\n\n# Next Section\n";
			const blocks3 = framer.push(part3);
			// Now code block and space are complete because Next Section started
			expect(blocks3.length).toBeGreaterThanOrEqual(1);
			expect(blocks3[0]?.type).toBe("code");
			expect(blocks3[0]?.raw).toContain("const x = 1;");
		});

		test("table header with delimiter row is buffered until trailing boundary", () => {
			const framer = new EpubBlockFramer();
			const p1 = "| Col A | Col B |\n";
			expect(framer.push(p1)).toHaveLength(0);

			const p2 = "| :---- | :---- |\n";
			expect(framer.push(p2)).toHaveLength(0);

			const p3 = "| 1     | 2     |\n";
			expect(framer.push(p3)).toHaveLength(0);

			const p4 = "\nParagraph after table.\n";
			const blocks = framer.push(p4);
			expect(blocks.length).toBeGreaterThanOrEqual(1);
			expect(blocks[0]?.type).toBe("table");
		});

		test("list with loose blank line is held until non-list block boundary", () => {
			const framer = new EpubBlockFramer();
			expect(framer.push("1. First item\n\n")).toHaveLength(0);
			expect(
				framer.push("   Indented continuation of first item\n\n"),
			).toHaveLength(0);
			expect(framer.push("2. Second item\n\n")).toHaveLength(0);

			const blocks = framer.push("# Next Chapter\n");
			expect(blocks.length).toBeGreaterThanOrEqual(1);
			expect(blocks[0]?.type).toBe("list");
			expect(blocks[0]?.raw).toContain("Second item");
		});
	});

	describe("finish() handling and error cases", () => {
		test("finish() flushes trailing paragraph without trailing newline", () => {
			const framer = new EpubBlockFramer();
			expect(framer.push("Some trailing text without newline")).toHaveLength(0);
			const finished = framer.finish();
			expect(finished).toHaveLength(1);
			expect(finished[0]?.raw).toBe("Some trailing text without newline");
			expect(finished[0]?.complete).toBe(true);
		});

		test("finish() on empty framer returns empty array", () => {
			const framer = new EpubBlockFramer();
			expect(framer.finish()).toEqual([]);
		});

		test("finish() throws E_PARSE if unconsumed non-whitespace text cannot form a valid block", () => {
			const framer = new EpubBlockFramer();
			// Simulate corrupted input where lexer cannot produce tokens
			(framer as unknown as { marked: { lexer: () => never[] } }).marked = {
				lexer: () => [],
			};
			framer.push("unparseable content");
			expect(() => framer.finish()).toThrow(EpubBuildError);
			try {
				framer.finish();
			} catch (e) {
				expect((e as EpubBuildError).code).toBe("E_PARSE");
			}
		});
	});
});
