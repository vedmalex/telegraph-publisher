import { writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import puppeteer from "puppeteer-core";
import { ContentProcessor } from "../content/ContentProcessor";
import { convertMarkdownToHtml } from "../markdownHtmlConverter";

/**
 * Paper size presets in millimeters
 */
export const PAPER_PRESETS: Record<string, { width: number; height: number }> = {
  "a4": { width: 210, height: 297 },
  "a5": { width: 148.5, height: 210 },
  "a5-half": { width: 105, height: 148.5 },
  "thermal-57": { width: 57, height: 105 },
  "thermal-80": { width: 80, height: 105 },
};

/**
 * PDF Generator options
 */
export interface PdfGeneratorOptions {
  outputPath: string;
  width?: number;
  pageHeight?: number;
  orientation?: "portrait" | "landscape";
  paper?: string;
  margin?: number;
  fontSize?: number;
  lineHeight?: number;
  debug?: boolean;
  chromePath?: string;
}

/**
 * PDF Generator using Puppeteer for proper page-break handling
 * This is the recommended format for thermal printers as it:
 * - Properly handles page breaks (never cuts text)
 * - Supports orphans/widows control
 * - Has accurate page sizing
 */
export class PdfGenerator {
  private outputPath: string;
  private widthMm: number;
  private pageHeightMm: number;
  private marginMm: number;
  private fontSizePt: number;
  private orientation: "portrait" | "landscape";
  private lineHeight: number;
  private chromePath?: string;
  private debug: boolean;

  constructor(options: PdfGeneratorOptions) {
    this.outputPath = resolve(options.outputPath);
    this.orientation = options.orientation || "portrait";
    this.lineHeight = options.lineHeight || 1.5;
    this.chromePath = options.chromePath;
    this.debug = options.debug || false;

    let wMm = options.width || 57;
    let hMm = options.pageHeight || 105;

    if (options.paper && options.paper !== "custom") {
      const preset = PAPER_PRESETS[options.paper];
      if (preset) { wMm = preset.width; hMm = preset.height; }
    }

    // For landscape, swap dimensions
    if (this.orientation === "landscape") {
      this.widthMm = hMm;
      this.pageHeightMm = wMm;
    } else {
      this.widthMm = wMm;
      this.pageHeightMm = hMm;
    }

    this.marginMm = options.margin ?? 5;
    this.fontSizePt = options.fontSize || 10;
  }

  async generateFromFile(filePath: string): Promise<void> {
    const resolvedPath = resolve(filePath);
    const processedContent = ContentProcessor.processFile(resolvedPath);
    
    let title = ContentProcessor.extractTitle(processedContent) || basename(filePath, ".md");
    let markdownContent = processedContent.contentWithoutMetadata;
    
    // Remove duplicate title if first line matches
    const lines = markdownContent.split('\n');
    const firstLine = lines[0];
    if (firstLine && firstLine.trim().replace(/^#+\s*/, '') === title) {
      markdownContent = lines.slice(1).join('\n');
    }

    await this.generatePdf(title, markdownContent);
  }

  async generateFromMarkdown(markdown: string, title?: string): Promise<void> {
    const pdfBuffer = await this.generatePdfBuffer(title || "Untitled", markdown);
    writeFileSync(this.outputPath, pdfBuffer);
  }

  async generateFromMarkdownBuffer(markdown: string, title?: string): Promise<Buffer> {
    return this.generatePdfBuffer(title || "Untitled", markdown);
  }

  private async generatePdf(title: string, markdownContent: string): Promise<void> {
    const pdfBuffer = await this.generatePdfBuffer(title, markdownContent);
    writeFileSync(this.outputPath, pdfBuffer);
  }

  private async generatePdfBuffer(title: string, markdownContent: string): Promise<Buffer> {
    // Convert markdown to HTML
    const htmlBody = convertMarkdownToHtml(markdownContent);
    
    // Build complete HTML document with styles
    const html = this.buildHtmlDocument(title, htmlBody);
    
    if (this.debug) {
      writeFileSync(this.outputPath.replace(/\.pdf$/, ".debug.html"), html, "utf-8");
    }

    // Find Chrome/Chromium path
    const executablePath = this.chromePath || await this.findChromePath();
    
    if (!executablePath) {
      throw new Error(
        "Chrome/Chromium not found. Please install Chrome or specify path with --chrome-path option.\n" +
        "On macOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n" +
        "On Linux: /usr/bin/google-chrome or /usr/bin/chromium-browser"
      );
    }

    // Launch browser and generate PDF
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      
      // Generate PDF with proper page settings
      const pdfBuffer = await page.pdf({
        width: `${this.widthMm}mm`,
        height: `${this.pageHeightMm}mm`,
        margin: {
          top: `${this.marginMm}mm`,
          bottom: `${this.marginMm}mm`,
          left: `${this.marginMm}mm`,
          right: `${this.marginMm}mm`,
        },
        printBackground: true,
        preferCSSPageSize: false,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private buildHtmlDocument(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: ${this.widthMm}mm ${this.pageHeightMm}mm;
      margin: ${this.marginMm}mm;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    html, body {
      background: white;
      font-family: "Georgia", "DejaVu Serif", "Liberation Serif", serif;
      font-size: ${this.fontSizePt}pt;
      line-height: ${this.lineHeight};
      color: black;
      -webkit-font-smoothing: antialiased;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-weight: bold;
      margin-top: 0.5em;
      margin-bottom: 0.3em;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.25em; }
    h3 { font-size: 1.1em; }
    h4 { font-size: 1em; }
    
    p {
      margin-bottom: 0.6em;
      text-align: justify;
      hyphens: auto;
      -webkit-hyphens: auto;
      word-wrap: break-word;
      overflow-wrap: break-word;
      page-break-inside: avoid;
      orphans: 3;
      widows: 3;
    }
    
    ul, ol {
      margin-left: 1.5em;
      margin-bottom: 0.5em;
      page-break-inside: avoid;
    }
    
    li {
      margin-bottom: 0.2em;
      page-break-inside: avoid;
    }
    
    code {
      font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
      font-style: italic;
      border: 1px solid black;
      border-radius: 2px;
      padding: 0 2px;
    }
    
    /* Remove border from code inside pre (block has its own border) */
    pre code {
      border: none;
      padding: 0;
      border-radius: 0;
    }
    
    pre {
      font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
      font-style: italic;
      margin-bottom: 0.5em;
      padding: 8px;
      border: 1px solid black;
      border-radius: 3px;
      white-space: pre-wrap;
      word-wrap: break-word;
      page-break-inside: avoid;
    }
    
    blockquote {
      border-left: 2px solid black;
      padding-left: 10px;
      margin-left: 5px;
      margin-bottom: 0.5em;
      page-break-inside: avoid;
    }
    
    hr {
      border: none;
      border-bottom: 1px solid black;
      margin: 0.5em 0;
    }
    
    strong, b {
      font-weight: bold;
    }
    
    em, i {
      font-style: italic;
    }
    
    table {
      border-collapse: collapse;
      margin-bottom: 0.5em;
      width: 100%;
      page-break-inside: avoid;
    }
    
    th, td {
      border: 1px solid black;
      padding: 4px;
      text-align: left;
    }
    
    th {
      font-weight: bold;
    }
    
    .title {
      font-size: 1.4em;
      font-weight: bold;
      margin-bottom: 1em;
    }
  </style>
</head>
<body>
  <div class="title">${this.escapeHtml(title)}</div>
  ${bodyHtml}
</body>
</html>`;
  }

  private async findChromePath(): Promise<string | undefined> {
    const possiblePaths = [
      // macOS
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      // Linux
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      // Windows
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];

    const { existsSync } = await import("node:fs");
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return undefined;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

