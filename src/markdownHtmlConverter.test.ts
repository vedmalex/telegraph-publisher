import { describe, expect, test } from "bun:test";
import { convertMarkdownToHtml } from "./markdownHtmlConverter";

describe("HTML export emphasis", () => {
	test("indented mantra lines keep both italic spans and drop the asterisks", () => {
		const html = convertMarkdownToHtml([
			"8)  **Снана**",
			"    произносите следующие мантры:",
			"    *идам̇ кш̣ӣра-сна̄нӣйам* и *мӯла-мантру клӣм̇ кр̣ш̣н̣а̄йа намах̣*",
			"    *идам̇ сита-сна̄нӣйам* и *мӯла-мантру клӣм̇ кр̣ш̣н̣а̄йа намах̣*",
		].join("\n"));
		expect(html).not.toContain("<pre>");
		expect(html).not.toContain("*");
		expect(html.match(/<em>/g)).toHaveLength(4);
		expect(html).toContain("<em>идам̇ кш̣ӣра-сна̄нӣйам</em> и <em>мӯла-мантру клӣм̇ кр̣ш̣н̣а̄йа намах̣</em>");
		expect(html).toContain("<em>идам̇ сита-сна̄нӣйам</em>");
	});
});
