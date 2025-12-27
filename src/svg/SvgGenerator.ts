import { writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import puppeteer, { Browser } from "puppeteer-core";
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
};

/**
 * SVG Generator options
 */
export interface SvgGeneratorOptions {
  outputPath: string;
  width?: number;
  pageHeight?: number;
  orientation?: "portrait" | "landscape";
  paper?: string;
  margin?: number;
  fontSize?: number;
  lineHeight?: number;
  cutMarks?: boolean;
  debug?: boolean;
  chromePath?: string;
}

/**
 * SVG Generator using Puppeteer for accurate HTML to SVG rendering
 */
export class SvgGenerator {
  private readonly MM_TO_PX = 8; // 203 DPI
  
  private outputPath: string;
  private physicalWidthMm: number;
  private physicalPageHeightMm: number;
  private marginPx: number;
  private fontSizePt: number;
  private cutMarks: boolean;
  private orientation: "portrait" | "landscape";
  private lineHeight: number;
  private chromePath?: string;
  private debug: boolean;
  
  private renderWidthPx: number;
  private renderHeightPx: number;

  constructor(options: SvgGeneratorOptions) {
    this.outputPath = resolve(options.outputPath);
    this.orientation = options.orientation || "portrait";
    this.cutMarks = options.cutMarks !== false;
    this.lineHeight = options.lineHeight || 1.5;
    this.chromePath = options.chromePath;
    this.debug = options.debug || false;

    let wMm = options.width || 57;
    let hMm = options.pageHeight || 105;

    if (options.paper && options.paper !== "custom") {
      const preset = PAPER_PRESETS[options.paper];
      if (preset) { wMm = preset.width; hMm = preset.height; }
    }

    this.physicalWidthMm = wMm;
    this.physicalPageHeightMm = hMm;

    if (this.orientation === "landscape") {
      this.renderWidthPx = hMm * this.MM_TO_PX;
      this.renderHeightPx = wMm * this.MM_TO_PX;
    } else {
      this.renderWidthPx = wMm * this.MM_TO_PX;
      this.renderHeightPx = hMm * this.MM_TO_PX;
    }

    this.marginPx = (options.margin ?? 5) * this.MM_TO_PX;
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

    const svg = await this.generateSvg(title, markdownContent);
    writeFileSync(this.outputPath, svg, "utf-8");
  }

  async generateFromMarkdown(markdown: string, title?: string): Promise<string> {
    return this.generateSvg(title || "Untitled", markdown);
  }

  private async generateSvg(title: string, markdownContent: string): Promise<string> {
    // Convert markdown to HTML
    const htmlBody = convertMarkdownToHtml(markdownContent);
    
    // Build complete HTML document with styles
    const html = this.buildHtmlDocument(title, htmlBody);
    
    if (this.debug) {
      writeFileSync(this.outputPath.replace(/\.svg$/, ".debug.html"), html, "utf-8");
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

    // Launch browser and render
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      
      // Get actual content height (runs in browser context)
      const bodyHeight = (await page.evaluate("document.body.scrollHeight")) as number;
      
      // Calculate pages
      const totalPages = Math.ceil(bodyHeight / this.renderHeightPx);
      const totalHeight = Math.max(totalPages * this.renderHeightPx, bodyHeight) as number;
      
      // Set viewport and get screenshot as SVG-compatible data
      await page.setViewport({
        width: this.renderWidthPx,
        height: totalHeight,
        deviceScaleFactor: 1,
      });

      // Take screenshot as PNG and embed in SVG
      const screenshot = await page.screenshot({
        type: "png",
        fullPage: true,
        omitBackground: false,
      });

      // Build SVG with embedded image
      let svg = this.buildSvgDocument(screenshot as Buffer, totalHeight, totalPages);

      return svg;
    } finally {
      await browser.close();
    }
  }

  private buildHtmlDocument(title: string, bodyHtml: string): string {
    const contentWidth = this.renderWidthPx - (this.marginPx * 2);
    // Cut margin - safe zone for cutting (5mm on top and bottom of each page)
    const cutMarginPx = 5 * this.MM_TO_PX;
    // Effective page height for content (minus top and bottom cut margins)
    const effectivePageHeight = this.renderHeightPx - (cutMarginPx * 2);
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: ${this.renderWidthPx}px ${this.renderHeightPx}px;
      margin: ${cutMarginPx}px ${this.marginPx}px;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    html, body {
      width: ${this.renderWidthPx}px;
      background: white;
      font-family: "Georgia", "DejaVu Serif", "Liberation Serif", serif;
      font-size: ${this.fontSizePt}pt;
      line-height: ${this.lineHeight};
      color: black;
      -webkit-font-smoothing: antialiased;
    }
    
    body {
      padding: ${cutMarginPx}px ${this.marginPx}px;
    }
    
    /* Page break simulation - create visual pages with margins */
    .page {
      width: ${this.renderWidthPx - (this.marginPx * 2)}px;
      min-height: ${effectivePageHeight}px;
      padding-bottom: ${cutMarginPx}px;
      page-break-after: always;
      page-break-inside: avoid;
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
    
    pre {
      font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
      font-style: italic;
      margin-left: 8px;
      margin-bottom: 0.5em;
      white-space: pre-wrap;
      word-wrap: break-word;
      page-break-inside: avoid;
    }
    
    blockquote {
      border-left: 2px solid black;
      padding-left: 10px;
      margin-left: 5px;
      margin-bottom: 0.5em;
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

  private buildSvgDocument(pngBuffer: Buffer, totalHeight: number, totalPages: number): string {
    const base64 = pngBuffer.toString("base64");
    
    if (this.orientation === "landscape") {
      // In landscape mode:
      // - Physical tape width stays the same (57mm)
      // - Content is rendered with swapped dimensions (width=pageHeight, height=tapeWidth per page)
      // - Each page is rotated 90 degrees
      // - Pages stack vertically on the tape
      
      // Content was rendered with:
      // - renderWidthPx = pageHeight * MM_TO_PX (e.g., 105mm * 8 = 840px)
      // - renderHeightPx = tapeWidth * MM_TO_PX (e.g., 57mm * 8 = 456px) per page
      const pageContentWidth = this.renderWidthPx;  // 840px for 105mm
      const pageContentHeight = this.renderHeightPx; // 456px for 57mm per page
      
      // Output dimensions after rotation:
      // - Output width = tape width = 57mm = 456px
      // - Each rotated page height = content width = 105mm = 840px
      const outputWidth = this.physicalWidthMm * this.MM_TO_PX; // 456px
      const outputPageHeight = this.physicalPageHeightMm * this.MM_TO_PX; // 840px (the rotated content width)
      const outputTotalHeight = totalPages * outputPageHeight;
      const physicalHeightMm = outputTotalHeight / this.MM_TO_PX;
      
      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${this.physicalWidthMm}mm" 
     height="${physicalHeightMm}mm" 
     viewBox="0 0 ${outputWidth} ${outputTotalHeight}">
  <defs>
    <image id="fullContent" width="${pageContentWidth}" height="${totalHeight}" 
           xlink:href="data:image/png;base64,${base64}"/>
  </defs>`;
      
      // Render each page rotated
      for (let p = 0; p < totalPages; p++) {
        const sourceY = p * pageContentHeight;
        const destY = p * outputPageHeight;
        
        // For each page:
        // 1. Translate to destination position on tape
        // 2. Rotate 90 degrees (pivot at top-left, then translate to correct position)
        // 3. Clip to show only current page from source content
        svg += `
  <g transform="translate(0, ${destY})">
    <g transform="translate(${outputWidth}, 0) rotate(90)">
      <g transform="translate(0, ${-sourceY})">
        <use xlink:href="#fullContent"/>
      </g>
    </g>
  </g>`;
      }
      
      // Add cut marks for landscape
      if (this.cutMarks && totalPages > 1) {
        svg += this.generateCutMarksLandscape(totalPages, outputWidth, outputPageHeight);
      }
      
      svg += "\n</svg>";
      return svg;
      
    } else {
      // Portrait mode - simple case
      const physicalHeightMm = totalHeight / this.MM_TO_PX;
      
      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${this.physicalWidthMm}mm" 
     height="${physicalHeightMm}mm" 
     viewBox="0 0 ${this.renderWidthPx} ${totalHeight}">
  <image width="${this.renderWidthPx}" height="${totalHeight}" 
         xlink:href="data:image/png;base64,${base64}"/>`;
      
      // Add cut marks
      if (this.cutMarks && totalPages > 1) {
        svg += this.generateCutMarks(totalPages);
      }
      
      svg += "\n</svg>";
      return svg;
    }
  }
  
  private generateCutMarksLandscape(totalPages: number, pageWidth: number, pageHeight: number): string {
    const len = 5 * this.MM_TO_PX;
    
    const marks: string[] = [];
    for (let p = 0; p < totalPages; p++) {
      const y = p * pageHeight;
      // Corner marks only (no dashed lines)
      // Top-left and top-right of page
      marks.push(`<line x1="0" y1="${y}" x2="0" y2="${y + len}" stroke="black" stroke-width="1"/>`);
      marks.push(`<line x1="${pageWidth}" y1="${y}" x2="${pageWidth}" y2="${y + len}" stroke="black" stroke-width="1"/>`);
      // Bottom-left and bottom-right of page
      marks.push(`<line x1="0" y1="${(p + 1) * pageHeight - len}" x2="0" y2="${(p + 1) * pageHeight}" stroke="black" stroke-width="1"/>`);
      marks.push(`<line x1="${pageWidth}" y1="${(p + 1) * pageHeight - len}" x2="${pageWidth}" y2="${(p + 1) * pageHeight}" stroke="black" stroke-width="1"/>`);
    }
    
    return "\n  " + marks.join("\n  ");
  }

  private generateCutMarks(totalPages: number): string {
    const len = 5 * this.MM_TO_PX;
    const w = this.renderWidthPx;
    const h = this.renderHeightPx;
    
    const marks: string[] = [];
    for (let p = 0; p < totalPages; p++) {
      const y = p * h;
      // Corner marks only (no dashed lines)
      // Top-left and top-right of page
      marks.push(`<line x1="0" y1="${y}" x2="0" y2="${y + len}" stroke="black" stroke-width="1"/>`);
      marks.push(`<line x1="${w}" y1="${y}" x2="${w}" y2="${y + len}" stroke="black" stroke-width="1"/>`);
      // Bottom-left and bottom-right of page
      marks.push(`<line x1="0" y1="${(p + 1) * h - len}" x2="0" y2="${(p + 1) * h}" stroke="black" stroke-width="1"/>`);
      marks.push(`<line x1="${w}" y1="${(p + 1) * h - len}" x2="${w}" y2="${(p + 1) * h}" stroke="black" stroke-width="1"/>`);
    }
    
    return "\n  " + marks.join("\n  ");
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
