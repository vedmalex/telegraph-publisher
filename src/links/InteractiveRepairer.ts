import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ReportGenerator } from './ReportGenerator';
import {
  type BrokenLink,
  type FixResult,
  LinkVerificationError,
  LinkVerificationException,
  type RepairSummary,
  type UserAction
} from './types';

/**
 * InteractiveRepairer handles user interaction for fixing broken links
 */
export class InteractiveRepairer {
  private reportGenerator: ReportGenerator;

  constructor(reportGenerator: ReportGenerator) {
    this.reportGenerator = reportGenerator;
  }

  /**
   * Perform interactive repair session for broken links
   * @param brokenLinks Array of broken links to repair
   * @returns Repair summary
   */
  async performInteractiveRepair(brokenLinks: BrokenLink[]): Promise<RepairSummary> {
    const fixableLinks = brokenLinks.filter(link => link.canAutoFix && link.suggestions.length > 0);

    if (fixableLinks.length === 0) {
      this.reportGenerator.showInfo('No links with available fixes found.');
      return this.createEmptySummary();
    }

    const totalFiles = new Set(fixableLinks.map(link => link.filePath)).size;
    this.showInteractiveHeader(fixableLinks.length, totalFiles);

    const summary: RepairSummary = {
      totalProcessed: 0,
      fixesApplied: 0,
      linksSkipped: 0,
      filesModified: 0,
      errors: []
    };

    const modifiedFiles = new Set<string>();
    let applyAll = false;

    for (const brokenLink of fixableLinks) {
      if (applyAll) {
        // Auto-apply remaining fixes
        const result = await this.applyBestFix(brokenLink);
        this.processBatchFixResult(result, summary, modifiedFiles);
      } else {
        // Show file context before each interactive prompt
        this.showFileContext(brokenLink, summary.totalProcessed + 1, fixableLinks.length);
        const action = await this.promptUserForAction(brokenLink);

        if (action === 'quit') {
          break;
        } else if (action === 'all') {
          applyAll = true;
          const result = await this.applyBestFix(brokenLink);
          this.processBatchFixResult(result, summary, modifiedFiles);
        } else if (action === 'yes') {
          const selectedFix = await this.selectFix(brokenLink);
          if (selectedFix) {
            const result = await this.applyFix(brokenLink, selectedFix);
            this.processFixResult(result, summary, modifiedFiles);
          } else {
            summary.linksSkipped++;
          }
        } else {
          summary.linksSkipped++;
          this.reportGenerator.showInfo(`❌ Fix skipped: ${this.formatBrokenLink(brokenLink)}`);
        }
      }

      summary.totalProcessed++;
    }

    summary.filesModified = modifiedFiles.size;
    this.showRepairSummary(summary);

    return summary;
  }

  /**
   * Show interactive mode header
   * @param fixableCount Number of fixable links
   * @param totalFiles Number of files with issues
   */
  private showInteractiveHeader(fixableCount: number, totalFiles: number): void {
    console.log('🔧 INTERACTIVE REPAIR MODE');
    console.log('═'.repeat(63));
    console.log();
    console.log(`Found ${fixableCount} broken links with suggested fixes in ${totalFiles} files.`);
    console.log('For each link, choose an action:');
    console.log('  y - apply fix');
    console.log('  n - skip');
    console.log('  a - apply all remaining fixes');
    console.log('  q - quit');
    console.log();
  }

  /**
   * Prompt user for action on a broken link
   * @param brokenLink The broken link to handle
   * @returns User's chosen action
   */
  private async promptUserForAction(brokenLink: BrokenLink): Promise<UserAction> {
    this.showBrokenLinkDetails(brokenLink);

    while (true) {
      const answer = await this.askQuestion('Apply this fix? (y/n/a/q): ');
      const action = answer.toLowerCase().trim();

      if (['y', 'yes'].includes(action)) {
        return 'yes';
      } else if (['n', 'no'].includes(action)) {
        return 'no';
      } else if (['a', 'all'].includes(action)) {
        return 'all';
      } else if (['q', 'quit'].includes(action)) {
        return 'quit';
      } else {
        console.log('Please enter y/n/a/q');
      }
    }
  }

  /**
 * Show file context for the current repair item
 * @param brokenLink The broken link
 * @param current Current item number
 * @param total Total items to process
 */
  private showFileContext(brokenLink: BrokenLink, current: number, total: number): void {
    const displayPath = this.formatFilePath(brokenLink.filePath);
    console.log(`\n🔧 Repairing [${current}/${total}] in file: ${displayPath}`);
    console.log('═'.repeat(62));
  }

  /**
   * Show broken link details for user decision
   * @param brokenLink The broken link to display
   */
  private showBrokenLinkDetails(brokenLink: BrokenLink): void {
    const link = brokenLink.link;

    console.log(`🔗 Broken link: [${link.text}](${link.href}) (line ${link.lineNumber})`);

    if (brokenLink.suggestions.length === 1) {
      console.log(`💡 Suggested fix: ${brokenLink.suggestions[0]}`);
    } else {
      console.log('💡 Multiple possible fixes found:');
      brokenLink.suggestions.forEach((suggestion, index) => {
        console.log(`  ${index + 1}) ${suggestion}`);
      });
    }

    console.log();
  }

  /**
   * Let user select a fix from multiple suggestions
   * @param brokenLink The broken link with multiple suggestions
   * @returns Selected fix or null if cancelled
   */
  private async selectFix(brokenLink: BrokenLink): Promise<string | null> {
    if (brokenLink.suggestions.length === 1) {
      return brokenLink.suggestions[0] || null;
    }

    while (true) {
      const answer = await this.askQuestion(`Choose option (1-${brokenLink.suggestions.length}) or action (n/a/q): `);
      const input = answer.trim().toLowerCase();

      if (['n', 'no'].includes(input)) {
        return null;
      } else if (['a', 'all'].includes(input)) {
        return brokenLink.suggestions[0] || null;
      } else if (['q', 'quit'].includes(input)) {
        return null;
      }

      const choice = parseInt(input);
      if (!isNaN(choice) && choice >= 1 && choice <= brokenLink.suggestions.length) {
        return brokenLink.suggestions[choice - 1] || null;
      }

      console.log(`Please enter a number from 1 to ${brokenLink.suggestions.length}, or n/a/q`);
    }
  }

  /**
   * Apply the best available fix for a broken link
   * @param brokenLink The broken link to fix
   * @returns Fix result
   */
  private async applyBestFix(brokenLink: BrokenLink): Promise<FixResult> {
    const bestFix = brokenLink.suggestions[0];
    if (!bestFix) {
      return {
        success: false,
        brokenLink,
        error: 'No available fixes'
      };
    }

    return this.applyFix(brokenLink, bestFix);
  }

  /**
   * Apply a specific fix to a broken link
   * @param brokenLink The broken link to fix
   * @param fixPath The fix path to apply
   * @returns Fix result
   */
  private async applyFix(brokenLink: BrokenLink, fixPath: string): Promise<FixResult> {
    try {
      // Read current file content
      const content = readFileSync(brokenLink.filePath, 'utf-8');

      // Create the original link markdown
      const originalLinkText = `[${brokenLink.link.text}](${brokenLink.link.href})`;
      const newLinkText = `[${brokenLink.link.text}](${fixPath})`;

      // Replace the specific link
      const updatedContent = this.replaceLink(content, originalLinkText, newLinkText, brokenLink.link.lineNumber);

      if (updatedContent === content) {
        return {
          success: false,
          brokenLink,
          error: 'Could not find link to replace'
        };
      }

      // Write updated content back to file
      writeFileSync(brokenLink.filePath, updatedContent, 'utf-8');

      return {
        success: true,
        brokenLink,
        appliedFix: fixPath
      };

    } catch (error) {
      return {
        success: false,
        brokenLink,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Replace a specific link in content
   * @param content File content
   * @param originalLink Original link text
   * @param newLink New link text
   * @param lineNumber Line number where link should be found
   * @returns Updated content
   */
  private replaceLink(content: string, originalLink: string, newLink: string, lineNumber: number): string {
    const lines = content.split('\n');

    if (lineNumber <= 0 || lineNumber > lines.length) {
      return content;
    }

    const targetLine = lines[lineNumber - 1]; // Convert to 0-based index
    if (!targetLine || !targetLine.includes(originalLink)) {
      // Try to find the link in nearby lines (in case line numbers are slightly off)
      for (let i = Math.max(0, lineNumber - 3); i < Math.min(lines.length, lineNumber + 2); i++) {
        if (lines[i]?.includes(originalLink)) {
          lines[i] = lines[i]!.replace(originalLink, newLink);
          return lines.join('\n');
        }
      }
      return content;
    }

    lines[lineNumber - 1] = targetLine.replace(originalLink, newLink);
    return lines.join('\n');
  }

  /**
   * Process fix result and update summary
   * @param result Fix result
   * @param summary Repair summary to update
   * @param modifiedFiles Set of modified files
   */
  private processFixResult(result: FixResult, summary: RepairSummary, modifiedFiles: Set<string>): void {
    if (result.success) {
      summary.fixesApplied++;
      modifiedFiles.add(result.brokenLink.filePath);

      const displayPath = this.formatFilePath(result.brokenLink.filePath);
      console.log(`✅ Fix applied: ${displayPath}`);
      console.log(`   [${result.brokenLink.link.text}](${result.brokenLink.link.href}) → [${result.brokenLink.link.text}](${result.appliedFix})`);
      console.log();
    } else {
      summary.errors.push(`${result.brokenLink.filePath}: ${result.error || 'Unknown error'}`);
      this.reportGenerator.showError(`Failed to apply fix: ${result.error}`, result.brokenLink.filePath);
    }
  }

  /**
   * Process fix result for batch operations
   * @param result Fix result
   * @param summary Repair summary to update
   * @param modifiedFiles Set of modified files
   */
  private processBatchFixResult(result: FixResult, summary: RepairSummary, modifiedFiles: Set<string>): void {
    if (result.success) {
      summary.fixesApplied++;
      modifiedFiles.add(result.brokenLink.filePath);
    } else {
      summary.errors.push(`${result.brokenLink.filePath}: ${result.error || 'Unknown error'}`);
    }
  }

  /**
 * Show repair session summary
 * @param summary Repair summary
 */
  private showRepairSummary(summary: RepairSummary): void {
    console.log('🎉 INTERACTIVE REPAIR COMPLETED');
    console.log('═'.repeat(63));
    console.log();
    console.log('📊 Results:');
    console.log(`   • Processed: ${summary.totalProcessed} links`);
    console.log(`   • Fixed: ${summary.fixesApplied} links`);
    console.log(`   • Skipped: ${summary.linksSkipped} links`);
    console.log(`   • Files modified: ${summary.filesModified}`);

    if (summary.errors.length > 0) {
      console.log(`   • Errors: ${summary.errors.length}`);
      console.log();
      console.log('❌ Errors:');
      summary.errors.forEach(error => {
        console.log(`   ${error}`);
      });
    }

    console.log();

    if (summary.fixesApplied > 0) {
      console.log('✅ Fixes applied successfully!');
    } else {
      console.log('ℹ️  No changes were made.');
    }

    console.log();
  }

  /**
   * Ask user a question and wait for input
   * @param question Question to ask
   * @returns User's answer
   */
  private async askQuestion(question: string): Promise<string> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Format a broken link for display
   * @param brokenLink The broken link
   * @returns Formatted string
   */
  private formatBrokenLink(brokenLink: BrokenLink): string {
    const displayPath = this.formatFilePath(brokenLink.filePath);
    return `[${brokenLink.link.text}](${brokenLink.link.href}) in ${displayPath}`;
  }

  /**
   * Format file path for display
   * @param filePath File path to format
   * @returns Formatted path
   */
  private formatFilePath(filePath: string): string {
    // Delegate to ReportGenerator for consistent formatting
    return (this.reportGenerator as any).formatFilePath(filePath);
  }

  /**
   * Create empty repair summary
   * @returns Empty summary
   */
  private createEmptySummary(): RepairSummary {
    return {
      totalProcessed: 0,
      fixesApplied: 0,
      linksSkipped: 0,
      filesModified: 0,
      errors: []
    };
  }
}