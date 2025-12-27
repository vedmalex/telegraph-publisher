import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import type { TelegraphNode } from "../telegraphPublisher";
import { ContentProcessor } from "../content/ContentProcessor";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";

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
  /** Output file path */
  outputPath: string;
  /** Paper width in mm (default: 57) */
  width?: number;
  /** Page height in mm (default: 105) */
  pageHeight?: number;
  /** Page orientation: portrait or landscape */
  orientation?: "portrait" | "landscape";
  /** Paper preset: a4, a5, a5-half, thermal-57, custom */
  paper?: string;
  /** Margin from edges in mm (default: 3) */
  margin?: number;
  /** Font size in pt (default: 10) */
  fontSize?: number;
  /** Line height multiplier (default: 1.5) */
  lineHeight?: number;
  /** Show cut marks (default: true) */
  cutMarks?: boolean;
  /** Debug mode */
  debug?: boolean;
}

interface RenderWord {
  text: string;
  fs: number;
  weight: string;
  style: string;
  font: string;
  width: number;
  isSpace: boolean;
  isCode?: boolean;
  textWidth?: number;
}

/**
 * Internal rendering state
 */
interface RenderState {
  y: number;
  x: number;
  page: number;
  elements: string[];
  lineHeight: number;
  weight: string;
  style: string;
  font: string;
  fs: number;
  lineBuffer: RenderWord[];
  justify: boolean; // Control justification globally for current block
}

/**
 * SVG Generator for thermal printer output
 * Converts Markdown to black-and-white SVG with 203 DPI precision
 */
export class SvgGenerator {
  private readonly MM_TO_PX = 8;
  private readonly PT_TO_PX = 8 / 2.83465;

  private outputPath: string;
  private physicalWidthMm: number;
  private physicalPageHeightMm: number;
  private marginPx: number;
  private baseFontSizePx: number;
  private cutMarks: boolean;
  private debug: boolean;
  private orientation: "portrait" | "landscape";
  private lineHeightMultiplier: number;

  private renderWidthPx: number;
  private renderHeightPx: number;
  private contentWidthPx: number;

  private readonly fontFamily = "Georgia, serif";
  private readonly codeFontFamily = "'DejaVu Serif', 'Liberation Serif', Georgia, serif";

  constructor(options: SvgGeneratorOptions) {
    this.outputPath = resolve(options.outputPath);
    this.orientation = options.orientation || "portrait";
    this.debug = options.debug || false;
    this.cutMarks = options.cutMarks !== false;
    this.lineHeightMultiplier = options.lineHeight || 1.5;

    let wMm = options.width || 57;
    let hMm = options.pageHeight || 105;

    if (options.paper && options.paper !== "custom") {
      const preset = PAPER_PRESETS[options.paper];
      if (preset) {
        wMm = preset.width;
        hMm = preset.height;
      }
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
    this.baseFontSizePx = (options.fontSize || 10) * this.PT_TO_PX;
    this.contentWidthPx = this.renderWidthPx - (this.marginPx * 2);
  }

  async generateFromFile(filePath: string): Promise<void> {
    const resolvedPath = resolve(filePath);
    const processedContent = ContentProcessor.processFile(resolvedPath);
    
    let title = ContentProcessor.extractTitle(processedContent) || basename(filePath, ".md");
    
    let markdownContent = processedContent.contentWithoutMetadata;
    const lines = markdownContent.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.replace(/^#+\s*/, '') === title) {
        markdownContent = lines.slice(1).join('\n');
      }
    }

    const nodes = convertMarkdownToTelegraphNodes(markdownContent, {
      generateToc: false,
      inlineToC: false,
      target: "svg",
    });

    const svg = this.generateSvg(title, nodes);
    writeFileSync(this.outputPath, svg, "utf-8");
  }

  generateFromMarkdown(markdown: string, title?: string): string {
    const nodes = convertMarkdownToTelegraphNodes(markdown, {
      generateToc: false,
      inlineToC: false,
      target: "svg",
    });
    return this.generateSvg(title || "Untitled", nodes);
  }

  private generateSvg(title: string, nodes: TelegraphNode[]): string {
    const state: RenderState = {
      y: this.marginPx + this.baseFontSizePx * 0.8,
      x: this.marginPx,
      page: 0,
      elements: [],
      lineHeight: this.baseFontSizePx * this.lineHeightMultiplier,
      weight: "normal",
      style: "normal",
      font: this.fontFamily,
      fs: this.baseFontSizePx,
      lineBuffer: [],
      justify: false,
    };

    state.fs = this.baseFontSizePx * 1.4;
    state.weight = "bold";
    state.justify = false;
    this.renderWrappedText(title, state);
    this.flushLine(state, false);
    state.y += state.lineHeight * 0.5;
    
    state.fs = this.baseFontSizePx;
    state.weight = "normal";
    state.x = this.marginPx;

    for (const node of nodes) {
      this.renderNode(node, state);
    }
    this.flushLine(state, false);

    const totalPages = state.page + 1;
    const totalPhysicalHeightPx = totalPages * (this.physicalPageHeightMm * this.MM_TO_PX);
    const totalPhysicalWidthPx = this.physicalWidthMm * this.MM_TO_PX;

    let content = "";
    for (let p = 0; p < totalPages; p++) {
      const prefix = `<!--P${p}-->`;
      const pageElements = state.elements
        .filter(el => el.startsWith(prefix))
        .map(el => el.substring(prefix.length))
        .join("\n");

      const offsetY = p * (this.physicalPageHeightMm * this.MM_TO_PX);
      if (this.orientation === "landscape") {
        content += `  <g transform="translate(${totalPhysicalWidthPx}, ${offsetY}) rotate(90)">\n${pageElements}\n  </g>\n`;
      } else {
        content += `  <g transform="translate(0, ${offsetY})">\n${pageElements}\n  </g>\n`;
      }
    }

    const cutMarks = this.cutMarks ? this.generateCutMarks(totalPages) : "";
    return this.buildSvgDocument(totalPhysicalWidthPx, totalPhysicalHeightPx, content, cutMarks);
  }

  private renderNode(node: TelegraphNode | string, state: RenderState): void {
    if (typeof node === "string") {
      this.renderWrappedText(node, state);
      return;
    }

    const oldWeight = state.weight;
    const oldStyle = state.style;
    const oldFs = state.fs;
    const oldFont = state.font;
    const oldJustify = state.justify;

    switch (node.tag) {
      case "h3":
        this.flushLine(state, false);
        state.fs = this.baseFontSizePx * 1.25;
        state.weight = "bold";
        state.justify = false;
        state.y += state.lineHeight * 0.3;
        this.renderNodeChildren(node, state);
        this.flushLine(state, false);
        break;
      case "h4":
        this.flushLine(state, false);
        state.fs = this.baseFontSizePx * 1.1;
        state.weight = "bold";
        state.justify = false;
        state.y += state.lineHeight * 0.2;
        this.renderNodeChildren(node, state);
        this.flushLine(state, false);
        break;
      case "p":
        state.justify = true;
        this.renderNodeChildren(node, state);
        this.flushLine(state, false); // Last line of paragraph: NEVER justify
        state.y += state.lineHeight * 0.4;
        break;
      case "strong":
      case "b":
        state.weight = "bold";
        this.renderNodeChildren(node, state);
        break;
      case "em":
      case "i":
        state.style = "italic";
        this.renderNodeChildren(node, state);
        break;
      case "code":
        this.renderCodeInline(node, state);
        break;
      case "br":
        this.flushLine(state, false);
        break;
      case "hr":
        this.flushLine(state, false);
        this.renderHr(state);
        break;
      case "ul":
      case "ol":
        this.flushLine(state, false);
        this.renderList(node, state, node.tag === "ol");
        break;
      case "blockquote":
        this.flushLine(state, false);
        this.renderBlockquote(node, state);
        break;
      case "pre":
        this.flushLine(state, false);
        state.font = this.codeFontFamily;
        state.justify = false;
        this.renderPre(node, state);
        this.flushLine(state, false);
        break;
      default:
        this.renderNodeChildren(node, state);
    }

    state.weight = oldWeight;
    state.style = oldStyle;
    state.fs = oldFs;
    state.font = oldFont;
    state.justify = oldJustify;
  }

  private renderNodeChildren(node: TelegraphNode, state: RenderState): void {
    if (node.children) {
      for (const child of node.children) {
        this.renderNode(child, state);
      }
    }
  }

  private renderCodeInline(node: TelegraphNode, state: RenderState): void {
    const text = this.extractText(node);
    this.addWordToBuffer(text, state, false, true);
  }

  private renderHr(state: RenderState): void {
    this.checkPageBreak(state, 10);
    const y = state.y - (state.page * this.renderHeightPx);
    state.elements.push(
      `<!--P${state.page}-->  <line x1="${this.marginPx}" y1="${y}" x2="${this.renderWidthPx - this.marginPx}" y2="${y}" stroke="black" stroke-width="1"/>`
    );
    state.y += state.lineHeight;
  }

  private renderList(node: TelegraphNode, state: RenderState, ordered: boolean): void {
    if (!node.children) return;
    let idx = 1;
    for (const child of node.children) {
      if (typeof child === "object" && child.tag === "li") {
        state.x = this.marginPx;
        const bullet = ordered ? `${idx++}. ` : "• ";
        this.renderWrappedText(bullet, state);
        this.renderNodeChildren(child, state);
        this.flushLine(state, false); // Last line of list item: NEVER justify
        state.y += state.lineHeight * 0.1;
      }
    }
  }

  private renderBlockquote(node: TelegraphNode, state: RenderState): void {
    const startY = state.y;
    const oldMargin = this.marginPx;
    this.marginPx += 15;
    state.x = this.marginPx;
    this.renderNodeChildren(node, state);
    this.flushLine(state, false); // Last line of blockquote: NEVER justify
    this.marginPx = oldMargin;
    const endY = state.y;
    
    const p = state.page; 
    const y1 = startY - (p * this.renderHeightPx) - state.fs * 0.8;
    const y2 = endY - (p * this.renderHeightPx) - state.lineHeight;
    state.elements.push(
      `<!--P${p}-->  <line x1="${this.marginPx + 6}" y1="${y1}" x2="${this.marginPx + 6}" y2="${y2}" stroke="black" stroke-width="2"/>`
    );
  }

  private renderPre(node: TelegraphNode, state: RenderState): void {
    const text = this.extractText(node);
    const lines = text.split("\n");
    for (const line of lines) {
      state.x = this.marginPx + 8;
      this.renderWrappedText(line, state);
      this.flushLine(state, false);
    }
  }

  private isPunctuation(text: string): boolean {
    return /^[.,;:!?…—–\-()«»"']+$/.test(text);
  }

  private renderWrappedText(text: string, state: RenderState): void {
    const words = text.split(/(\s+)/);
    const maxWidth = this.renderWidthPx - this.marginPx;

    for (let i = 0; i < words.length; i++) {
      let wordText = words[i];
      if (wordText === "") continue;
      if (wordText === "\n") { this.flushLine(state, false); continue; }

      const isSpace = /^\s+$/.test(wordText);
      let w = this.estimateWidth(wordText, state.fs);

      // Rule: punctuation should stay with previous word
      if (!isSpace && this.isPunctuation(wordText) && state.x + w > maxWidth && state.x > this.marginPx) {
        let lastWordIdx = state.lineBuffer.length - 1;
        while (lastWordIdx >= 0 && state.lineBuffer[lastWordIdx].isSpace) lastWordIdx--;
        if (lastWordIdx >= 0) {
          const removed: RenderWord[] = [];
          while (state.lineBuffer.length > lastWordIdx) removed.unshift(state.lineBuffer.pop()!);
          state.x = this.marginPx + state.lineBuffer.reduce((sum, w) => sum + w.width, 0);
          this.flushLine(state, state.justify);
          for (const rw of removed) { state.lineBuffer.push(rw); state.x += rw.width; }
        }
      }

      if (state.x + w > maxWidth && state.x > this.marginPx) {
        // Hyphenation: prefer split at existing hyphen
        const hIdx = wordText.indexOf("-");
        if (hIdx > 1 && hIdx < wordText.length - 2) {
           const pre = wordText.substring(0, hIdx + 1);
           const post = wordText.substring(hIdx + 1);
           if (state.x + this.estimateWidth(pre, state.fs) <= maxWidth) {
              this.addWordToBuffer(pre, state, false);
              this.flushLine(state, state.justify);
              words[i] = post; i--; continue;
           }
        }

        // Rule: at least 2 LETTERS before hyphen and 2 LETTERS after
        if (!isSpace && wordText.length >= 4 && !this.isPunctuation(wordText)) {
          const available = maxWidth - state.x;
          let splitIdx = 0; let currentW = 0;
          for (let k = 0; k < wordText.length; k++) {
              const charW = this.estimateWidth(wordText[k], state.fs);
              if (currentW + charW > available) break;
              currentW += charW; splitIdx = k;
          }
          const p1 = wordText.substring(0, splitIdx); const p2 = wordText.substring(splitIdx);
          const l1 = p1.replace(/[^a-zа-яё]/gi, "").length;
          const l2 = p2.replace(/[^a-zа-яё]/gi, "").length;
          if (l1 >= 2 && l2 >= 2) {
            this.addWordToBuffer(p1 + "-", state, false);
            this.flushLine(state, state.justify);
            words[i] = p2; i--; continue;
          }
        }
        this.flushLine(state, state.justify);
        w = this.estimateWidth(wordText, state.fs);
      }

      this.addWordToBuffer(wordText, state, isSpace);
    }
  }

  private addWordToBuffer(text: string, state: RenderState, isSpace: boolean, isInlineCode = false): void {
    const textWidth = this.estimateWidth(text, state.fs);
    const padding = isInlineCode ? 2 : 0;
    const width = textWidth + padding;
    state.lineBuffer.push({
      text, fs: state.fs, weight: state.weight, style: isInlineCode ? "italic" : state.style,
      font: isInlineCode ? this.codeFontFamily : state.font, width, isSpace, isCode: isInlineCode, textWidth
    });
    state.x += width;
  }

  private flushLine(state: RenderState, justify: boolean): void {
    if (state.lineBuffer.length === 0) { state.x = this.marginPx; return; }
    if (state.lineBuffer[state.lineBuffer.length - 1].isSpace) state.lineBuffer.pop();

    const totalWidth = state.lineBuffer.reduce((sum, w) => sum + w.width, 0);
    const maxWidth = this.renderWidthPx - (this.marginPx * 2);
    const extraSpace = maxWidth - totalWidth;
    
    let spaceBonus = 0;
    const spaceCount = state.lineBuffer.filter(w => w.isSpace).length;
    // Justification only for full lines, within tolerance
    if (justify && spaceCount > 0 && extraSpace > 0 && extraSpace < maxWidth * 0.25) {
      spaceBonus = extraSpace / spaceCount;
    }

    this.checkPageBreak(state, state.lineHeight);
    const y = state.y - (state.page * this.renderHeightPx);
    let currentX = this.marginPx;

    for (const word of state.lineBuffer) {
      if (word.isSpace) { currentX += word.width + spaceBonus; continue; }
      const weightAttr = word.weight === "bold" ? ' font-weight="bold"' : "";
      const styleAttr = word.style === "italic" ? ' font-style="italic"' : "";
      if (word.isCode) {
         const tw = word.textWidth || word.width;
         const p = 1; // 1px padding
         state.elements.push(`<!--P${state.page}-->  <rect x="${currentX}" y="${y - word.fs * 0.72}" width="${tw + p * 2}" height="${word.fs * 0.85}" fill="none" stroke="black" stroke-width="0.5" rx="1"/>`);
         state.elements.push(`<!--P${state.page}-->  <text x="${currentX + p}" y="${y}" font-size="${word.fs}px"${weightAttr}${styleAttr} font-family="${word.font}" fill="black" xml:space="preserve">${this.escapeXml(word.text)}</text>`);
      } else {
        state.elements.push(`<!--P${state.page}-->  <text x="${currentX}" y="${y}" font-size="${word.fs}px"${weightAttr}${styleAttr} font-family="${word.font}" fill="black" xml:space="preserve">${this.escapeXml(word.text)}</text>`);
      }
      currentX += word.width;
    }
    state.lineBuffer = []; state.x = this.marginPx; state.y += state.lineHeight;
  }

  private estimateWidth(text: string, fontSizePx: number): number {
    let width = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code >= 0x0300 && code <= 0x036F || code >= 0x1DC0 && code <= 0x1DFF || code >= 0x20D0 && code <= 0x20FF || code >= 0xFE20 && code <= 0xFE2F) continue;
      if (/[A-ZА-ЯЁ]/.test(char)) width += fontSizePx * 0.85;
      else if (/[a-zа-яё]/.test(char)) width += fontSizePx * 0.65;
      else if (/\s/.test(char)) width += fontSizePx * 0.35;
      else if (/[!.,;:?]/.test(char)) width += fontSizePx * 0.4;
      else width += fontSizePx * 0.65;
    }
    return width;
  }

  private checkPageBreak(state: RenderState, requiredHeight: number): void {
    const curY = state.y - (state.page * this.renderHeightPx);
    if (curY + requiredHeight > this.renderHeightPx - this.marginPx) {
      state.page++; state.y = state.page * this.renderHeightPx + this.marginPx + state.fs * 0.8; state.x = this.marginPx;
    }
  }

  private extractText(node: TelegraphNode | string): string {
    if (typeof node === "string") return node;
    return (node.children || []).map(c => this.extractText(c)).join("");
  }

  private generateCutMarks(totalPages: number): string {
    const marks: string[] = []; const len = 5 * this.MM_TO_PX;
    const w = this.physicalWidthMm * this.MM_TO_PX; const h = this.physicalPageHeightMm * this.MM_TO_PX;
    for (let p = 0; p <= totalPages; p++) {
      const y = p * h; marks.push(`  <line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="black" stroke-width="0.5" stroke-dasharray="4,4"/>`);
      if (p < totalPages) {
        const top = p * h; const bot = (p + 1) * h;
        marks.push(`  <line x1="0" y1="${top}" x2="0" y2="${top + len}" stroke="black" stroke-width="1"/>`);
        marks.push(`  <line x1="${w}" y1="${top}" x2="${w}" y2="${top + len}" stroke="black" stroke-width="1"/>`);
        marks.push(`  <line x1="0" y1="${bot - len}" x2="0" y2="${bot}" stroke="black" stroke-width="1"/>`);
        marks.push(`  <line x1="${w}" y1="${bot - len}" x2="${w}" y2="${bot}" stroke="black" stroke-width="1"/>`);
      }
    }
    return marks.join("\n");
  }

  private buildSvgDocument(wPx: number, hPx: number, content: string, cutMarks: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${this.physicalWidthMm}mm" height="${(hPx / this.MM_TO_PX)}mm" viewBox="0 0 ${wPx} ${hPx}">
  <rect x="0" y="0" width="${wPx}" height="${hPx}" fill="white"/>
${cutMarks}${content}
</svg>`;
  }

  private escapeXml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
