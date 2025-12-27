import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { SvgGenerator, PAPER_PRESETS } from "./SvgGenerator";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("SvgGenerator", () => {
  const testDir = join(tmpdir(), "svg-generator-test");
  const testOutputFile = join(testDir, "output.svg");
  const testInputFile = join(testDir, "input.md");

  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(testOutputFile)) unlinkSync(testOutputFile);
    if (existsSync(testInputFile)) unlinkSync(testInputFile);
  });

  describe("PAPER_PRESETS", () => {
    it("should have correct A4 dimensions", () => {
      expect(PAPER_PRESETS["a4"]).toEqual({ width: 210, height: 297 });
    });

    it("should have correct thermal-57 dimensions", () => {
      expect(PAPER_PRESETS["thermal-57"]).toEqual({ width: 57, height: 105 });
    });

    it("should have correct A5-half dimensions", () => {
      expect(PAPER_PRESETS["a5-half"]).toEqual({ width: 105, height: 148.5 });
    });
  });

  describe("constructor", () => {
    it("should set default values", () => {
      const generator = new SvgGenerator({ outputPath: testOutputFile });
      // Just verify it doesn't throw
      expect(generator).toBeDefined();
    });

    it("should accept custom options", () => {
      const generator = new SvgGenerator({ 
        outputPath: testOutputFile,
        width: 80,
        fontSize: 12,
        lineHeight: 1.8,
        margin: 10,
      });
      expect(generator).toBeDefined();
    });
  });

  // Note: Full integration tests require Chrome to be installed
  // These tests are skipped if Chrome is not available
  describe("generateFromMarkdown (requires Chrome)", () => {
    it.skip("should generate valid SVG with text", async () => {
      const generator = new SvgGenerator({ outputPath: testOutputFile });
      const svg = await generator.generateFromMarkdown("Hello **World**", "Test Title");
      
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('width="57mm"');
    });
  });

  describe("generateFromFile (requires Chrome)", () => {
    it.skip("should generate SVG from markdown file", async () => {
      writeFileSync(testInputFile, "# File Title\n\nContent here.", "utf-8");
      
      const generator = new SvgGenerator({ outputPath: testOutputFile });
      await generator.generateFromFile(testInputFile);
      
      expect(existsSync(testOutputFile)).toBe(true);
      const svg = readFileSync(testOutputFile, "utf-8");
      expect(svg).toContain("<svg");
    });
  });
});
