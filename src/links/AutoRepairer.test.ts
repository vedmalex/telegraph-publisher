import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AutoRepairer } from './AutoRepairer';
import type { BrokenLink, FileScanResult, MarkdownLink } from './types';

describe('AutoRepairer', () => {
  const testDir = join(process.cwd(), 'test-auto-repairer');
  let autoRepairer: AutoRepairer;

  beforeEach(() => {
    // Create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    autoRepairer = new AutoRepairer();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('autoRepair', () => {
    test('should auto-repair broken links with single suggestion', async () => {
      // Setup test files
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, '# Source\n\n[Link to target](./broken-target.md)\n\nSome content.');

      // Mock LinkResolver to return suggestions
      const mockResolver = jest.spyOn(autoRepairer['resolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: sourceFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: sourceFile,
              link: {
                text: 'Link to target',
                href: './broken-target.md',
                lineNumber: 3,
                columnStart: 0,
                columnEnd: 29
              },
              suggestions: ['./target.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        }
      ]);

      // Mock getBestSuggestion to return the first suggestion
      const mockGetBest = jest.spyOn(autoRepairer['resolver'], 'getBestSuggestion');
      mockGetBest.mockReturnValue('./target.md');

      // Run auto-repair
      const result = await autoRepairer.autoRepair(testDir);

      // Verify results
      expect(result.repairedLinksCount).toBe(1);
      expect(result.repairedFilesIn.size).toBe(1);
      expect(result.repairedFilesIn.has(sourceFile)).toBe(true);

      // Verify file was actually modified
      const updatedContent = readFileSync(sourceFile, 'utf-8');
      expect(updatedContent).toContain('[Link to target](./target.md)');
      expect(updatedContent).not.toContain('[Link to target](./broken-target.md)');

      // Clean up mocks
      mockResolver.mockRestore();
      mockGetBest.mockRestore();
    });

    test('should not repair links with multiple suggestions', async () => {
      // Setup test files with ambiguous targets
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, '# Source\n\n[Link to target](./broken-target.md)\n\nSome content.');

      // Mock LinkResolver to return multiple suggestions (ambiguous)
      const mockResolver = jest.spyOn(autoRepairer['resolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: sourceFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: sourceFile,
              link: {
                text: 'Link to target',
                href: './broken-target.md',
                lineNumber: 3,
                columnStart: 0,
                columnEnd: 29
              },
              suggestions: ['./target1.md', './target2.md'], // Multiple suggestions = ambiguous
              canAutoFix: false
            }
          ],
          processingTime: 0
        }
      ]);

      // Run auto-repair
      const result = await autoRepairer.autoRepair(testDir);

      // Should not repair due to ambiguity
      expect(result.repairedLinksCount).toBe(0);
      expect(result.repairedFilesIn.size).toBe(0);
      expect(result.remainingBrokenLinks.length).toBeGreaterThan(0);

      // Verify file was not modified
      const originalContent = readFileSync(sourceFile, 'utf-8');
      expect(originalContent).toContain('./broken-target.md');

      // Clean up mocks
      mockResolver.mockRestore();
    });

    test('should handle files with no broken links', async () => {
      // Setup test files
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, '# Source\n\n[Link to target](./target.md)\n\nSome content.');

      // Mock LinkVerifier to return no broken links
      const mockVerifier = jest.spyOn(autoRepairer['verifier'], 'verifyLinks');
      mockVerifier.mockResolvedValue({
        filePath: sourceFile,
        allLinks: [],
        localLinks: [],
        brokenLinks: [], // No broken links
        processingTime: 0
      });

      // Run auto-repair
      const result = await autoRepairer.autoRepair(testDir);

      // No repairs should be needed
      expect(result.repairedLinksCount).toBe(0);
      expect(result.repairedFilesIn.size).toBe(0);
      expect(result.remainingBrokenLinks.length).toBe(0);

      // Clean up mocks
      mockVerifier.mockRestore();
    });

    test('should handle multiple broken links in same file', async () => {
      // Setup test files
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, `# Source

[Link 1](./broken-target1.md)
[Link 2](./broken-target2.md)

Some content.`);

      // Mock LinkResolver to return suggestions for both links
      const mockResolver = jest.spyOn(autoRepairer['resolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: sourceFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: sourceFile,
              link: {
                text: 'Link 1',
                href: './broken-target1.md',
                lineNumber: 3,
                columnStart: 0,
                columnEnd: 29
              },
              suggestions: ['./target1.md'],
              canAutoFix: true
            },
            {
              filePath: sourceFile,
              link: {
                text: 'Link 2',
                href: './broken-target2.md',
                lineNumber: 4,
                columnStart: 0,
                columnEnd: 29
              },
              suggestions: ['./target2.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        }
      ]);

      // Mock getBestSuggestion to return the appropriate suggestion
      const mockGetBest = jest.spyOn(autoRepairer['resolver'], 'getBestSuggestion');
      mockGetBest
        .mockReturnValueOnce('./target1.md')
        .mockReturnValueOnce('./target2.md');

      // Run auto-repair
      const result = await autoRepairer.autoRepair(testDir);

      // Verify results
      expect(result.repairedLinksCount).toBe(2);
      expect(result.repairedFilesIn.size).toBe(1);
      expect(result.repairedFilesIn.has(sourceFile)).toBe(true);

      // Verify file was modified correctly
      const updatedContent = readFileSync(sourceFile, 'utf-8');
      expect(updatedContent).toContain('[Link 1](./target1.md)');
      expect(updatedContent).toContain('[Link 2](./target2.md)');
      expect(updatedContent).not.toContain('./broken-target1.md');
      expect(updatedContent).not.toContain('./broken-target2.md');

      // Clean up mocks
      mockResolver.mockRestore();
      mockGetBest.mockRestore();
    });

    test('should handle mix of repairable and non-repairable links', async () => {
      // Setup test files
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, `# Source

[Repairable link](./broken-target.md)
[Ambiguous link](./broken-ambiguous.md)

Some content.`);

      // Mock LinkResolver to return mixed suggestions
      const mockResolver = jest.spyOn(autoRepairer['resolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: sourceFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: sourceFile,
              link: {
                text: 'Repairable link',
                href: './broken-target.md',
                lineNumber: 3,
                columnStart: 0,
                columnEnd: 35
              },
              suggestions: ['./target.md'], // Single suggestion - repairable
              canAutoFix: true
            },
            {
              filePath: sourceFile,
              link: {
                text: 'Ambiguous link',
                href: './broken-ambiguous.md',
                lineNumber: 4,
                columnStart: 0,
                columnEnd: 35
              },
              suggestions: ['./ambiguous1.md', './ambiguous2.md'], // Multiple suggestions - not repairable
              canAutoFix: false
            }
          ],
          processingTime: 0
        }
      ]);

      // Mock getBestSuggestion to return suggestion for the repairable link
      const mockGetBest = jest.spyOn(autoRepairer['resolver'], 'getBestSuggestion');
      mockGetBest.mockReturnValue('./target.md');

      // Mock LinkVerifier to return only the remaining broken link after repair
      const mockVerifier = jest.spyOn(autoRepairer['verifier'], 'verifyLinks');
      mockVerifier.mockResolvedValue({
        filePath: sourceFile,
        allLinks: [],
        localLinks: [],
        brokenLinks: [
          {
            filePath: sourceFile,
            link: {
              text: 'Ambiguous link',
              href: './broken-ambiguous.md',
              lineNumber: 4,
              columnStart: 0,
              columnEnd: 35
            },
            suggestions: [],
            canAutoFix: false
          }
        ], // Only one remaining broken link after repair
        processingTime: 0
      });

      // Run auto-repair
      const result = await autoRepairer.autoRepair(testDir);

      // Should repair only the unambiguous link
      expect(result.repairedLinksCount).toBe(1);
      expect(result.repairedFilesIn.size).toBe(1);
      expect(result.remainingBrokenLinks.length).toBe(1);

      // Verify file was partially modified
      const updatedContent = readFileSync(sourceFile, 'utf-8');
      expect(updatedContent).toContain('[Repairable link](./target.md)'); // Fixed
      expect(updatedContent).toContain('./broken-ambiguous.md'); // Still broken
      expect(updatedContent).not.toContain('./broken-target.md'); // Fixed

      // Clean up mocks
      mockResolver.mockRestore();
      mockGetBest.mockRestore();
      mockVerifier.mockRestore();
    });

    test('should handle empty directory', async () => {
      // Run auto-repair on empty directory
      const result = await autoRepairer.autoRepair(testDir);

      // No files to process
      expect(result.repairedLinksCount).toBe(0);
      expect(result.repairedFilesIn.size).toBe(0);
      expect(result.remainingBrokenLinks.length).toBe(0);
    });

    test('should handle nested directory structures', async () => {
      // Create nested structure
      const subDir = join(testDir, 'subdir');
      mkdirSync(subDir, { recursive: true });

      const sourceFile = join(subDir, 'source.md');
      writeFileSync(sourceFile, '# Source\n\n[Link to target](../broken-target.md)\n\nSome content.');

      // Mock LinkResolver to return suggestion
      const mockResolver = jest.spyOn(autoRepairer['resolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: sourceFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: sourceFile,
              link: {
                text: 'Link to target',
                href: '../broken-target.md',
                lineNumber: 3,
                columnStart: 0,
                columnEnd: 35
              },
              suggestions: ['../target.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        }
      ]);

      // Mock getBestSuggestion
      const mockGetBest = jest.spyOn(autoRepairer['resolver'], 'getBestSuggestion');
      mockGetBest.mockReturnValue('../target.md');

      // Run auto-repair
      const result = await autoRepairer.autoRepair(testDir);

      // Should find and repair the link
      expect(result.repairedLinksCount).toBe(1);
      expect(result.repairedFilesIn.has(sourceFile)).toBe(true);

      // Verify file was modified
      const updatedContent = readFileSync(sourceFile, 'utf-8');
      expect(updatedContent).toContain('[Link to target](../target.md)');
      expect(updatedContent).not.toContain('../broken-target.md');

      // Clean up mocks
      mockResolver.mockRestore();
      mockGetBest.mockRestore();
    });
  });

  describe('applyFixesToFile', () => {
    test('should apply fixes to file content correctly', async () => {
      const testFile = join(testDir, 'test.md');
      const originalContent = `# Test

[Broken Link 1](./broken1.md)
[Broken Link 2](./broken2.md)

Some content.`;

      writeFileSync(testFile, originalContent);

      // Create mock broken links with suggestions
      const brokenLinks: BrokenLink[] = [
        {
          filePath: testFile,
          link: {
            text: 'Broken Link 1',
            href: './broken1.md',
            lineNumber: 3,
            columnStart: 0,
            columnEnd: 30
          },
          suggestions: ['./fixed1.md'],
          canAutoFix: true
        },
        {
          filePath: testFile,
          link: {
            text: 'Broken Link 2',
            href: './broken2.md',
            lineNumber: 4,
            columnStart: 0,
            columnEnd: 30
          },
          suggestions: ['./fixed2.md'],
          canAutoFix: true
        }
      ];

      // Apply fixes using private method (accessing via any for testing)
      (autoRepairer as any).applyFixesToFile(testFile, brokenLinks);

      // Verify file was modified correctly
      const updatedContent = readFileSync(testFile, 'utf-8');
      expect(updatedContent).toContain('[Broken Link 1](./fixed1.md)');
      expect(updatedContent).toContain('[Broken Link 2](./fixed2.md)');
      expect(updatedContent).not.toContain('./broken1.md');
      expect(updatedContent).not.toContain('./broken2.md');
    });
  });

  describe('integration with LinkScanner, LinkVerifier, LinkResolver', () => {
    test('should integrate properly with other link management classes', async () => {
      // Setup test scenario
      const sourceFile = join(testDir, 'integration-test.md');
      writeFileSync(sourceFile, `# Integration Test

This file contains a [broken link](./integration-broken.md) that should be fixed.

End of file.`);

      // Mock LinkResolver to return suggestion
      const mockResolver = jest.spyOn(autoRepairer['resolver'], 'resolveBrokenLinks');
      mockResolver.mockResolvedValue([
        {
          filePath: sourceFile,
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: sourceFile,
              link: {
                text: 'broken link',
                href: './integration-broken.md',
                lineNumber: 3,
                columnStart: 23,
                columnEnd: 57
              },
              suggestions: ['./integration-target.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        }
      ]);

      // Mock getBestSuggestion
      const mockGetBest = jest.spyOn(autoRepairer['resolver'], 'getBestSuggestion');
      mockGetBest.mockReturnValue('./integration-target.md');

      // Run auto-repair (this tests full integration)
      const result = await autoRepairer.autoRepair(testDir);

      // Verify integration worked
      expect(result.repairedLinksCount).toBe(1);
      expect(result.repairedFilesIn.size).toBe(1);

      // Verify the link was actually fixed
      const repairedContent = readFileSync(sourceFile, 'utf-8');
      expect(repairedContent).toContain('[broken link](./integration-target.md)');
      expect(repairedContent).not.toContain('./integration-broken.md');

      // Clean up mocks
      mockResolver.mockRestore();
      mockGetBest.mockRestore();
    });
  });
});