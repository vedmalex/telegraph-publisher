import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SvgGenerator, PAPER_PRESETS } from "./SvgGenerator";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("SvgGenerator", () => {
  const testDir = join(__dirname, "../../test-svg-output");
  const testMdFile = join(testDir, "test-input.md");
  const testOutputFile = join(testDir, "test-output.svg");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("PAPER_PRESETS", () => {
    test("should have a4 preset", () => {
      expect(PAPER_PRESETS["a4"]).toEqual({ width: 210, height: 297 });
    });
  });

  describe("generateFromMarkdown", () => {
    test("should generate SVG from simple markdown", () => {
      const generator = new SvgGenerator({ outputPath: testOutputFile });
      const markdown = "# Hello World\n\nThis is a test paragraph.";
      const svg = generator.generateFromMarkdown(markdown, "Test Title");
      
      expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg).toContain("<svg");
      expect(svg).toContain(">Test</text>");
      expect(svg).toContain(">Title</text>");
    });

    test("should apply landscape orientation with rotation", () => {
      const generator = new SvgGenerator({ 
        outputPath: testOutputFile,
        paper: "thermal-57",
        orientation: "landscape" 
      });
      const svg = generator.generateFromMarkdown("# Test", "Test");
      
      // Physical width should stay 57mm
      expect(svg).toContain('width="57mm"');
      // But content should be rotated
      expect(svg).toContain('rotate(90)');
    });

    test("should handle lists", () => {
      const generator = new SvgGenerator({ outputPath: testOutputFile });
      const markdown = "- Item 1\n- Item 2";
      const svg = generator.generateFromMarkdown(markdown, "Test");
      expect(svg).toContain("•");
    });

    test("should handle code blocks with code font", () => {
      const generator = new SvgGenerator({ outputPath: testOutputFile });
      const markdown = "```\ncode block\n```";
      const svg = generator.generateFromMarkdown(markdown, "Test");
      expect(svg).toContain('DejaVu Serif');
    });
  });

  describe("generateFromFile", () => {
    test("should generate SVG from file and use physical width", async () => {
      writeFileSync(testMdFile, "# Heading\n\nContent", "utf-8");
      const generator = new SvgGenerator({ 
        outputPath: testOutputFile,
        width: 80 
      });
      await generator.generateFromFile(testMdFile);

      const svg = readFileSync(testOutputFile, "utf-8");
      expect(svg).toContain('width="80mm"');
    });
  });

  describe("DPI and units", () => {
    test("should use 203 DPI (8 px/mm)", () => {
      const generator = new SvgGenerator({ outputPath: testOutputFile, width: 10 });
      const svg = generator.generateFromMarkdown("# T", "T");
      // 10mm should be exactly 80px in viewBox
      expect(svg).toContain('viewBox="0 0 80');
    });
  });
});
