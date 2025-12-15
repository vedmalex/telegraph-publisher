
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";

describe("Markdown Converter - Nested Formatting Reproduction", () => {
    it("should correctly parse a link inside bold text in a list item", () => {
        const markdown = "- **[Часть 1](https://telegra.ph/part1)**";
        const nodes = convertMarkdownToTelegraphNodes(markdown);

        // Expected structure:
        // ul -> li -> strong -> a
        
        expect(nodes).toHaveLength(1);
        expect(nodes[0].tag).toBe("ul");
        const li = nodes[0].children[0];
        // @ts-ignore
        expect(li.tag).toBe("li");
        // @ts-ignore
        const strong = li.children[0];
        // @ts-ignore
        expect(strong.tag).toBe("strong");
        
        // This is failing currently, it returns string "[Часть 1](...)"
        // @ts-ignore
        const link = strong.children[0];
        
        // We expect an object (TelegraphNode), not a string
        expect(typeof link).not.toBe("string");
        // @ts-ignore
        expect(link.tag).toBe("a");
        // @ts-ignore
        expect(link.children[0]).toBe("Часть 1");
        // @ts-ignore
        expect(link.attrs.href).toBe("https://telegra.ph/part1");
    });

    it("should correctly parse a link inside bold text (not in list)", () => {
        const markdown = "**[Link](https://example.com)**";
        const nodes = convertMarkdownToTelegraphNodes(markdown);

        expect(nodes).toHaveLength(1);
        expect(nodes[0].tag).toBe("p");
        
        const strong = nodes[0].children[0];
        // @ts-ignore
        expect(strong.tag).toBe("strong");
        
        // @ts-ignore
        const link = strong.children[0];
        expect(typeof link).not.toBe("string");
        // @ts-ignore
        expect(link.tag).toBe("a");
    });
});

