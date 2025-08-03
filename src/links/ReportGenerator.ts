import { writeFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import type {
  BrokenLink,
  FileScanResult,
  LinkStatistics,
  ScanResult
} from './types';

/**
 * ReportGenerator handles formatting and displaying link verification results
 */
export class ReportGenerator {
  private verbose: boolean;
  private reportLines: string[] = [];
  private captureReport: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
 * Generate and display the main scan report
 * @param scanResult Complete scan results
 * @param outputFile Optional file path to save the report
 */
  generateReport(scanResult: ScanResult, outputFile?: string): void {
    let originalConsoleLog: typeof console.log | null = null;

    // Start capturing report if output file is specified
    if (outputFile) {
      this.startCapture();
      originalConsoleLog = console.log;
      console.log = (...args: any[]) => {
        originalConsoleLog?.(...args);
        this.reportLines.push(args.join(' '));
      };
    }

    try {
      this.showScanProgress(scanResult);
      this.showStatistics(scanResult);

      if (scanResult.brokenLinks.length > 0) {
        this.showBrokenLinksReport(scanResult);
      } else {
        this.showSuccessMessage();
      }

      this.showFinalSummary(scanResult);
    } finally {
      // Restore original console.log and save report if needed
      if (outputFile && originalConsoleLog) {
        console.log = originalConsoleLog;
        this.saveReport(outputFile);
      }
    }
  }

  /**
 * Show initial scan progress and completion
 * @param scanResult Scan results
 */
  private showScanProgress(scanResult: ScanResult): void {
    const stats = this.calculateStatistics(scanResult);

    console.log(`🔎 Link scanning completed...`);
    console.log(`📁 Found ${stats.totalFiles} markdown files`);
    console.log(`🔍 Analyzed ${stats.totalLinks} links in ${(scanResult.processingTime / 1000).toFixed(1)}s`);
    console.log();
  }

  /**
 * Display detailed statistics
 * @param scanResult Scan results
 */
  private showStatistics(scanResult: ScanResult): void {
    const stats = this.calculateStatistics(scanResult);

    console.log('📊 LINK ANALYSIS RESULTS');
    console.log('═'.repeat(63));
    console.log();
    console.log('📈 Statistics:');
    console.log(`   • Total files: ${stats.totalFiles}`);
    console.log(`   • Total links: ${stats.totalLinks}`);
    console.log(`   • Local links: ${stats.localLinks}`);
    console.log(`   • Broken links: ${stats.brokenLinks}`);
    console.log(`   • Scan time: ${stats.scanTime}s`);
    console.log();
  }

  /**
   * Show detailed broken links report
   * @param scanResult Scan results
   */
  private showBrokenLinksReport(scanResult: ScanResult): void {
    console.log('❌ ISSUES FOUND');
    console.log();

    // Group broken links by file
    const linksByFile = this.groupLinksByFile(scanResult.brokenLinks);

    for (const [filePath, brokenLinks] of linksByFile.entries()) {
      this.showFileProblems(filePath, brokenLinks);
    }
  }

  /**
   * Show problems for a specific file
   * @param filePath Path to the file
   * @param brokenLinks Broken links in the file
   */
  private showFileProblems(filePath: string, brokenLinks: BrokenLink[]): void {
    const displayPath = this.formatFilePath(filePath);

    console.log(`📄 ${displayPath}`);
    console.log('─'.repeat(62));

    for (const brokenLink of brokenLinks) {
      this.showBrokenLink(brokenLink);
    }

    console.log();
  }

  /**
 * Show details for a single broken link
 * @param brokenLink The broken link to display
 */
  private showBrokenLink(brokenLink: BrokenLink): void {
    const link = brokenLink.link;

    console.log(`  🔗 Broken link: [${link.text}](${link.href})`);
    console.log(`     📍 Line: ${link.lineNumber}`);

    if (brokenLink.suggestions.length > 0) {
      if (brokenLink.suggestions.length === 1) {
        console.log(`     💡 Suggested fix: ${brokenLink.suggestions[0]}`);
      } else {
        console.log(`     💡 Multiple possible fixes found:`);
        brokenLink.suggestions.forEach((suggestion, index) => {
          console.log(`        ${index + 1}) ${suggestion}`);
        });
      }
    } else {
      const filename = this.extractFilename(link.href);
      console.log(`     ❌ File '${filename}' not found in project`);
    }

    console.log();
  }

  /**
   * Show success message when no problems found
   */
  private showSuccessMessage(): void {
    console.log('✅ GREAT NEWS!');
    console.log('═'.repeat(63));
    console.log();
    console.log('🎉 All local links are working correctly!');
    console.log('📋 No issues found.');
    console.log();
  }

  /**
 * Show final summary and next steps
 * @param scanResult Scan results
 */
  private showFinalSummary(scanResult: ScanResult): void {
    const stats = this.calculateStatistics(scanResult);

    console.log('📊 FINAL REPORT');
    console.log('═'.repeat(63));
    console.log();

    if (stats.brokenLinks > 0) {
      const brokenFilesCount = new Set(scanResult.brokenLinks.map(link => link.filePath)).size;
      const withSuggestions = scanResult.brokenLinks.filter(link => link.suggestions.length > 0).length;
      const fixablePercentage = stats.brokenLinks > 0 ? Math.round((withSuggestions / stats.brokenLinks) * 100) : 0;

      console.log(`✅ Result: Found ${stats.brokenLinks} broken links in ${brokenFilesCount} files`);
      console.log(`💡 Available fixes: ${withSuggestions} (for ${fixablePercentage}% of issues)`);

      if (withSuggestions < stats.brokenLinks) {
        console.log(`⚠️  Without suggestions: ${stats.brokenLinks - withSuggestions} links`);
      }

      console.log();
      console.log('🛠️  To apply fixes, run:');
      console.log('    telegraph-publisher check-links --apply-fixes');
    } else {
      console.log('✅ Result: All links are working correctly!');
      console.log('🎯 No action required.');
    }

    console.log();
  }

  /**
 * Show verbose scanning details
 * @param filePath Current file being processed
 * @param current Current file number
 * @param total Total files to process
 */
  showVerboseProgress(filePath: string, current: number, total: number): void {
    if (!this.verbose) return;

    const displayPath = this.formatFilePath(filePath);
    console.log(`🔍 [${current}/${total}] Analyzing: ${displayPath}`);
  }

  /**
 * Show verbose link details for a file
 * @param scanResult File scan result
 */
  showVerboseFileDetails(scanResult: FileScanResult): void {
    if (!this.verbose) return;

    const displayPath = this.formatFilePath(scanResult.filePath);
    const localCount = scanResult.localLinks.length;
    const totalCount = scanResult.allLinks.length;
    const brokenCount = scanResult.brokenLinks.length;

    if (brokenCount > 0) {
      console.log(`   ❌ ${displayPath} - found ${totalCount} links (${localCount} local, ${brokenCount} broken)`);
    } else if (localCount > 0) {
      console.log(`   ✅ ${displayPath} - found ${totalCount} links (${localCount} local)`);
    } else {
      console.log(`   📄 ${displayPath} - no local links found`);
    }
  }

  /**
   * Show error message
   * @param message Error message
   * @param filePath Optional file path where error occurred
   */
  showError(message: string, filePath?: string): void {
    if (filePath) {
      const displayPath = this.formatFilePath(filePath);
      console.log(`❌ ERROR in ${displayPath}: ${message}`);
    } else {
      console.log(`❌ ERROR: ${message}`);
    }
  }

  /**
   * Show warning message
   * @param message Warning message
   * @param filePath Optional file path where warning occurred
   */
  showWarning(message: string, filePath?: string): void {
    if (filePath) {
      const displayPath = this.formatFilePath(filePath);
      console.log(`⚠️  WARNING in ${displayPath}: ${message}`);
    } else {
      console.log(`⚠️  WARNING: ${message}`);
    }
  }

  /**
   * Show info message
   * @param message Info message
   */
  showInfo(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  /**
   * Format file path for display (relative and shortened if needed)
   * @param filePath Absolute file path
   * @returns Formatted display path
   */
  private formatFilePath(filePath: string): string {
    const cwd = process.cwd();
    let displayPath = filePath;

    try {
      // Try to make it relative to current working directory
      const relativePath = relative(cwd, filePath);
      if (relativePath.length < filePath.length && !relativePath.startsWith('..')) {
        displayPath = relativePath;
      }
    } catch (error) {
      // If relative path calculation fails, use basename
      displayPath = basename(filePath);
    }

    // Truncate very long paths
    const maxLength = 80;
    if (displayPath.length > maxLength) {
      const parts = displayPath.split('/');
      if (parts.length > 2) {
        displayPath = `.../${parts.slice(-2).join('/')}`;
      } else {
        displayPath = `...${displayPath.slice(-maxLength + 3)}`;
      }
    }

    return displayPath;
  }

  /**
   * Group broken links by file path
   * @param brokenLinks Array of broken links
   * @returns Map of file paths to broken links
   */
  private groupLinksByFile(brokenLinks: BrokenLink[]): Map<string, BrokenLink[]> {
    const groups = new Map<string, BrokenLink[]>();

    for (const brokenLink of brokenLinks) {
      const filePath = brokenLink.filePath;

      if (!groups.has(filePath)) {
        groups.set(filePath, []);
      }

      groups.get(filePath)?.push(brokenLink);
    }

    return groups;
  }

  /**
   * Calculate statistics from scan results
   * @param scanResult Scan results
   * @returns Calculated statistics
   */
  private calculateStatistics(scanResult: ScanResult): LinkStatistics {
    const totalFiles = scanResult.totalFiles;
    const totalLinks = scanResult.totalLinks;
    const localLinks = scanResult.totalLocalLinks;
    const brokenLinks = scanResult.brokenLinks.length;
    const linksWithSuggestions = scanResult.brokenLinks.filter(link => link.suggestions.length > 0).length;

    return {
      totalFiles,
      totalLinks,
      localLinks,
      brokenLinks,
      linksWithSuggestions,
      brokenLinkPercentage: localLinks > 0 ? (brokenLinks / localLinks) * 100 : 0,
      fixablePercentage: brokenLinks > 0 ? (linksWithSuggestions / brokenLinks) * 100 : 0,
      scanTime: scanResult.processingTime / 1000
    };
  }

  /**
   * Extract filename from a path
   * @param path File path
   * @returns Filename
   */
  private extractFilename(path: string): string {
    // Remove query parameters and fragments
    const cleanPath = path.split('?')[0]?.split('#')[0] || path;
    return basename(cleanPath);
  }

  /**
   * Enable or disable verbose output
   * @param verbose Verbose flag
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Start capturing console output for report saving
   */
  private startCapture(): void {
    this.captureReport = true;
    this.reportLines = [];
  }

  /**
   * Save captured report to file
   * @param outputFile Path to save the report
   */
  private saveReport(outputFile: string): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportContent = [
        `# Link Verification Report`,
        `Generated: ${new Date().toLocaleString()}`,
        ``,
        ...this.reportLines,
        ``,
        `---`,
        `Report generated by telegraph-publisher check-links`
      ].join('\n');

      writeFileSync(outputFile, reportContent, 'utf-8');
      console.log(`\n📄 Report saved to: ${outputFile}`);
    } catch (error) {
      console.error(`❌ Failed to save report: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.captureReport = false;
      this.reportLines = [];
    }
  }

  /**
   * Enhanced console.log that captures output when needed
   * @param message Message to log
   */
  private log(message: string): void {
    console.log(message);
    if (this.captureReport) {
      this.reportLines.push(message);
    }
  }
}