import { writeFileSync, readFileSync } from 'node:fs';
import { PathResolver } from '../utils/PathResolver';
import { LinkResolver } from './LinkResolver';
import { LinkScanner } from './LinkScanner';
import { LinkVerifier } from './LinkVerifier';
import type { BrokenLink, FileScanResult } from './types';

export class AutoRepairer {
  private scanner = new LinkScanner();
  private verifier = new LinkVerifier(PathResolver.getInstance());
  private resolver = new LinkResolver();

  /**
   * Scans a file or directory, attempts to auto-repair high-confidence broken links,
   * and reports any remaining broken links.
   * @param targetPath The file or directory path to process.
   * @returns An object detailing the operation results.
   */
  public async autoRepair(targetPath: string): Promise<{
    repairedLinksCount: number;
    repairedFilesIn: Set<string>;
    remainingBrokenLinks: BrokenLink[];
  }> {
    const filesToScan = await this.scanner.findMarkdownFiles(targetPath);
    let repairedLinksCount = 0;
    const repairedFilesIn = new Set<string>();
    let allBrokenLinks: BrokenLink[] = [];

    for (const file of filesToScan) {
      const scanResult = await this.scanner.scanFile(file);
      const verifiedResult = await this.verifier.verifyLinks(scanResult);
      if (verifiedResult.brokenLinks.length === 0) continue;

      const resolvedResult = await this.resolver.resolveBrokenLinks([verifiedResult]);
      const fixableLinks = resolvedResult[0]?.brokenLinks.filter(l => l.suggestions.length === 1) || [];

      if (fixableLinks.length > 0) {
        this.applyFixesToFile(file, fixableLinks);
        repairedLinksCount += fixableLinks.length;
        repairedFilesIn.add(file);
        console.log(`🔧 Auto-repaired ${fixableLinks.length} link(s) in ${file}`);
      }
    }

    // Re-verify all files to find remaining broken links
    const finalResults: FileScanResult[] = [];
    for (const file of filesToScan) {
      const scanResult = await this.scanner.scanFile(file);
      const verifiedResult = await this.verifier.verifyLinks(scanResult);
      finalResults.push(verifiedResult);
    }
    allBrokenLinks = finalResults.flatMap(r => r.brokenLinks);

    return {
      repairedLinksCount,
      repairedFilesIn,
      remainingBrokenLinks: allBrokenLinks
    };
  }

  private applyFixesToFile(filePath: string, linksToFix: BrokenLink[]): void {
    let content = readFileSync(filePath, 'utf-8');
    for (const brokenLink of linksToFix) {
      const bestFix = this.resolver.getBestSuggestion(brokenLink);
      if (bestFix) {
        const originalLinkText = `[${brokenLink.link.text}](${brokenLink.link.href})`;
        const newLinkText = `[${brokenLink.link.text}](${bestFix})`;
        content = content.replace(originalLinkText, newLinkText);
      }
    }
    writeFileSync(filePath, content, 'utf-8');
  }
}