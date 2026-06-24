import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PdfGenerator } from "./PdfGenerator";

describe("PdfGenerator", () => {
  describe("base href handling", () => {
    it("injects base href when basePath is provided", () => {
      const sourceFilePath = resolve("/tmp/docs/guides/user-manual.md");
      const generator = new PdfGenerator({
        outputPath: "/tmp/output.pdf",
        basePath: sourceFilePath,
      });

      const html = (generator as any).buildHtmlDocument("Test", "<p>Body</p>");
      const expectedBaseHref = pathToFileURL(sourceFilePath).href;

      expect(html).toContain(`<base href="${expectedBaseHref}">`);
    });

    it("does not inject base href when basePath is omitted", () => {
      const generator = new PdfGenerator({
        outputPath: "/tmp/output.pdf",
      });

      const html = (generator as any).buildHtmlDocument("Test", "<p>Body</p>");

      expect(html).not.toContain("<base href=");
    });
  });

  describe("image fit styles", () => {
    it("adds fit rules so images are scaled without cropping", () => {
      const generator = new PdfGenerator({
        outputPath: "/tmp/output.pdf",
        width: 210,
        pageHeight: 297,
        margin: 15,
      });

      const html = (generator as any).buildHtmlDocument("Test", "<p><img src=\"x.png\" alt=\"x\"></p>");

      expect(html).toContain("img {");
      expect(html).toContain("max-width: 100%;");
      expect(html).toContain("object-fit: contain;");
      expect(html).toContain("max-height: 267mm;");
    });
  });
});
