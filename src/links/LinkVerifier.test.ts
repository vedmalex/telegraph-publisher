import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PathResolver } from '../utils/PathResolver';
import { LinkVerifier } from './LinkVerifier';
import type { FileScanResult, MarkdownLink } from './types';

describe('LinkVerifier', () => {
  const testDir = join(process.cwd(), 'test-link-verifier');
  let verifier: LinkVerifier;
  let pathResolver: PathResolver;

  beforeEach(() => {
    // Create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    pathResolver = PathResolver.getInstance();
    verifier = new LinkVerifier(pathResolver);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('verifyLinks', () => {
    test('should identify broken relative links', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      // Don't create target.md - it should be broken

      const link: MarkdownLink = {
        text: 'Target',
        href: './target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.link.href).toBe('./target.md');
    });

    test('should identify working relative links', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target'); // Create target - should work

      const link: MarkdownLink = {
        text: 'Target',
        href: './target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle parent directory links', async () => {
      const subDir = join(testDir, 'subdir');
      mkdirSync(subDir);

      const sourceFile = join(subDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const link: MarkdownLink = {
        text: 'Target',
        href: '../target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle absolute paths relative to project root', async () => {
      // Create package.json to establish project root
      writeFileSync(join(testDir, 'package.json'), '{}');

      const sourceFile = join(testDir, 'docs', 'source.md');
      const targetFile = join(testDir, 'target.md');

      mkdirSync(join(testDir, 'docs'));
      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const link: MarkdownLink = {
        text: 'Target',
        href: '/target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle multiple links in one file', async () => {
      const sourceFile = join(testDir, 'source.md');
      const target1 = join(testDir, 'target1.md');
      // Don't create target2.md - should be broken

      writeFileSync(sourceFile, '# Source');
      writeFileSync(target1, '# Target 1');

      const link1: MarkdownLink = {
        text: 'Target 1',
        href: './target1.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const link2: MarkdownLink = {
        text: 'Target 2',
        href: './target2.md',
        lineNumber: 2,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link1, link2],
        localLinks: [link1, link2],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.link.href).toBe('./target2.md');
    });
  });

  describe('verifyMultipleFiles', () => {
    test('should verify multiple files correctly', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const target = join(testDir, 'target.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');
      writeFileSync(target, '# Target');

      const goodLink: MarkdownLink = {
        text: 'Target',
        href: './target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const brokenLink: MarkdownLink = {
        text: 'Broken',
        href: './broken.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResults: FileScanResult[] = [
        {
          filePath: file1,
          allLinks: [goodLink],
          localLinks: [goodLink],
          brokenLinks: [],
          processingTime: 0
        },
        {
          filePath: file2,
          allLinks: [brokenLink],
          localLinks: [brokenLink],
          brokenLinks: [],
          processingTime: 0
        }
      ];

      const results = await verifier.verifyMultipleFiles(scanResults);

      expect(results).toHaveLength(2);
      expect(results[0]?.brokenLinks).toHaveLength(0);
      expect(results[1]?.brokenLinks).toHaveLength(1);
    });
  });

  describe('linkExists', () => {
    test('should return true for existing files', () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const exists = verifier.linkExists('./target.md', sourceFile);
      expect(exists).toBe(true);
    });

    test('should return false for non-existing files', () => {
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, '# Source');

      const exists = verifier.linkExists('./nonexistent.md', sourceFile);
      expect(exists).toBe(false);
    });

    test('should handle external links gracefully', () => {
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, '# Source');

      const exists = verifier.linkExists('https://example.com', sourceFile);
      expect(exists).toBe(false);
    });
  });

  describe('resolveLinkPath', () => {
    test('should resolve relative paths correctly', () => {
      const sourceFile = join(testDir, 'source.md');
      const expectedPath = join(testDir, 'target.md');

      const resolvedPath = verifier.resolveLinkPath('./target.md', sourceFile);
      expect(resolvedPath).toBe(expectedPath);
    });

    test('should resolve parent directory paths', () => {
      const subDir = join(testDir, 'subdir');
      mkdirSync(subDir);

      const sourceFile = join(subDir, 'source.md');
      const expectedPath = join(testDir, 'target.md');

      const resolvedPath = verifier.resolveLinkPath('../target.md', sourceFile);
      expect(resolvedPath).toBe(expectedPath);
    });

    test('should resolve absolute paths relative to project root', () => {
      writeFileSync(join(testDir, 'package.json'), '{}');

      const sourceFile = join(testDir, 'docs', 'source.md');
      const expectedPath = join(testDir, 'target.md');

      const resolvedPath = verifier.resolveLinkPath('/target.md', sourceFile);
      expect(resolvedPath).toBe(expectedPath);
    });

    test('should throw error for external links', () => {
      const sourceFile = join(testDir, 'source.md');

      expect(() => {
        verifier.resolveLinkPath('https://example.com', sourceFile);
      }).toThrow();
    });

    test('should throw error for fragment links', () => {
      const sourceFile = join(testDir, 'source.md');

      expect(() => {
        verifier.resolveLinkPath('#section', sourceFile);
      }).toThrow();
    });
  });

  describe('getVerificationDetails', () => {
    test('should provide detailed information for existing links', () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const link: MarkdownLink = {
        text: 'Target',
        href: './target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const details = verifier.getVerificationDetails(link, sourceFile);

      expect(details.exists).toBe(true);
      expect(details.resolvedPath).toBe(targetFile);
      expect(details.error).toBeUndefined();
    });

    test('should provide error information for broken links', () => {
      const sourceFile = join(testDir, 'source.md');
      writeFileSync(sourceFile, '# Source');

      const link: MarkdownLink = {
        text: 'External',
        href: 'https://example.com',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const details = verifier.getVerificationDetails(link, sourceFile);

      expect(details.exists).toBe(false);
      expect(details.resolvedPath).toBeUndefined();
      expect(details.error).toBeDefined();
    });
  });

  describe('isLinkSafe', () => {
    test('should return true for safe relative links', () => {
      const sourceFile = join(testDir, 'source.md');

      const isSafe = verifier.isLinkSafe('./target.md', sourceFile);
      expect(isSafe).toBe(true);
    });

    test('should return false for external links', () => {
      const sourceFile = join(testDir, 'source.md');

      const isSafe = verifier.isLinkSafe('https://example.com', sourceFile);
      expect(isSafe).toBe(false);
    });

    test('should handle complex relative paths safely', () => {
      const sourceFile = join(testDir, 'docs', 'source.md');
      mkdirSync(join(testDir, 'docs'));

      const isSafe = verifier.isLinkSafe('../other.md', sourceFile);
      expect(isSafe).toBe(true);
    });
  });

  describe('getVerificationStats', () => {
    test('should calculate correct statistics', () => {
      const scanResults: FileScanResult[] = [
        {
          filePath: 'file1.md',
          allLinks: [
            { text: 'Link 1', href: 'http://example.com', lineNumber: 1, columnStart: 0, columnEnd: 10 },
            { text: 'Link 2', href: './local.md', lineNumber: 2, columnStart: 0, columnEnd: 10 }
          ],
          localLinks: [
            { text: 'Link 2', href: './local.md', lineNumber: 2, columnStart: 0, columnEnd: 10 }
          ],
          brokenLinks: [
            {
              filePath: 'file1.md',
              link: { text: 'Link 2', href: './local.md', lineNumber: 2, columnStart: 0, columnEnd: 10 },
              suggestions: [],
              canAutoFix: false
            }
          ],
          processingTime: 10
        },
        {
          filePath: 'file2.md',
          allLinks: [
            { text: 'Link 3', href: './another.md', lineNumber: 1, columnStart: 0, columnEnd: 10 }
          ],
          localLinks: [
            { text: 'Link 3', href: './another.md', lineNumber: 1, columnStart: 0, columnEnd: 10 }
          ],
          brokenLinks: [],
          processingTime: 5
        }
      ];

      const stats = verifier.getVerificationStats(scanResults);

      expect(stats.totalFiles).toBe(2);
      expect(stats.totalLinks).toBe(3);
      expect(stats.totalLocalLinks).toBe(2);
      expect(stats.totalBrokenLinks).toBe(1);
      expect(stats.brokenLinkPercentage).toBe(50);
      expect(stats.filesByBrokenLinks).toBe(1);
    });

    test('should handle empty results', () => {
      const stats = verifier.getVerificationStats([]);

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalLinks).toBe(0);
      expect(stats.totalLocalLinks).toBe(0);
      expect(stats.totalBrokenLinks).toBe(0);
      expect(stats.brokenLinkPercentage).toBe(0);
      expect(stats.filesByBrokenLinks).toBe(0);
    });
  });

  describe('Fragment Link Handling', () => {
    test('should handle valid file with fragment as valid link', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Section One'); // Create target with matching heading

      const link: MarkdownLink = {
        text: 'Target Section',
        href: './target.md#Section-One',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle invalid file with fragment as broken link', async () => {
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(sourceFile, '# Source');
      // Don't create target.md - should be broken

      const link: MarkdownLink = {
        text: 'Broken Target',
        href: './non-existent.md#section',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 35
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.link.href).toBe('./non-existent.md#section');
    });

    test('should maintain existing behavior for fragment-only links', async () => {
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(sourceFile, '# Source');

      const link: MarkdownLink = {
        text: 'Fragment Only',
        href: '#section',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      // Fragment-only links should be skipped (pathWithoutFragment is empty)
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle multiple fragments correctly', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Section1#Section2'); // Create matching heading with fragments

      const link: MarkdownLink = {
        text: 'Multiple Fragments',
        href: './target.md#Section1#Section2',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 40
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      // Should work - fragment rejoined correctly
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle empty fragment correctly', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const link: MarkdownLink = {
        text: 'Empty Fragment',
        href: './target.md#',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 25
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      // Should work - treated as normal file link after fragment removal
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle Cyrillic fragment links correctly', async () => {
      const sourceFile = join(testDir, 'index.md');
      const targetFile = join(testDir, 'class004.structured.md');

      writeFileSync(sourceFile, '# Index');
      writeFileSync(targetFile, '# Занятие 4 Глава 1 Вопросы мудрецов'); // Create matching Cyrillic heading

      const link: MarkdownLink = {
        text: 'Занятие 4',
        href: './class004.structured.md#Занятие-4-Глава-1-Вопросы-мудрецов',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 80
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      // Should work - this is the exact user's use case
      expect(result.brokenLinks).toHaveLength(0);
    });
  });

  describe('Anchor Validation', () => {
    test('should validate simple heading anchors as VALID', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target-with-anchors.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Simple Heading');

      const link: MarkdownLink = {
        text: 'simple heading',
        href: './target-with-anchors.md#Simple-Heading',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should validate heading with spaces anchors as VALID', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target-with-anchors.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '## Heading With Spaces');

      const link: MarkdownLink = {
        text: 'heading with spaces',
        href: './target-with-anchors.md#Heading-With-Spaces',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should validate Cyrillic heading anchors as VALID', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target-with-anchors.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '### Заголовок на кириллице');

      const link: MarkdownLink = {
        text: 'Cyrillic heading',
        href: './target-with-anchors.md#Заголовок-на-кириллице',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should mark links with invalid anchors as BROKEN', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target-with-anchors.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, `# Existing Heading`);

      const link: MarkdownLink = {
        text: 'Non-existent anchor',
        href: './target-with-anchors.md#this-does-not-exist',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 50
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.link.href).toBe('./target-with-anchors.md#this-does-not-exist');
    });

    test('should handle URI-encoded anchors correctly', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target-with-anchors.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, `# Занятие 4 Глава 1 Вопросы мудрецов`);

      const link: MarkdownLink = {
        text: 'Encoded Cyrillic',
        href: './target-with-anchors.md#%D0%97%D0%B0%D0%BD%D1%8F%D1%82%D0%B8%D0%B5-4-%D0%93%D0%BB%D0%B0%D0%B2%D0%B0-1-%D0%92%D0%BE%D0%BF%D1%80%D0%BE%D1%81%D1%8B-%D0%BC%D1%83%D0%B4%D1%80%D0%B5%D1%86%D0%BE%D0%B2',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 80
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle files that cannot be read gracefully', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'unreadable.md');

      writeFileSync(sourceFile, '# Source');
      // Don't create the target file to simulate read error

      const link: MarkdownLink = {
        text: 'Unreadable file',
        href: './unreadable.md#some-anchor',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      // Should be marked as broken because file doesn't exist
      expect(result.brokenLinks).toHaveLength(1);
    });

    test('should maintain existing behavior for links without anchors', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const link: MarkdownLink = {
        text: 'No anchor',
        href: './target.md',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 20
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle empty anchors correctly', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');

      const link: MarkdownLink = {
        text: 'Empty anchor',
        href: './target.md#',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 25
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      // Empty fragment should be treated as no anchor
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should handle multiple fragments in URL correctly', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Section1#Section2');

      const link: MarkdownLink = {
        text: 'Multiple fragments',
        href: './target.md#Section1#Section2',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 40
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });
  });

  describe('Enhanced Anchor Suggestions', () => {
    test('should provide suggestion for broken anchor with close match', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Valid Section\n## Introduction\n### Conclusion');

      const link: MarkdownLink = {
        text: 'Invalid Section',
        href: './target.md#Valid-Sektion',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 35
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.suggestions).toContain('./target.md#Valid-Section');
    });

    test('should not provide suggestions when no close match exists', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Completely Different\n## Unrelated Content');

      const link: MarkdownLink = {
        text: 'Invalid Section',
        href: './target.md#xyz-abc-nothing',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 35
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      // New behavior includes available anchors list even when no close match exists
      expect(result.brokenLinks[0]?.suggestions.length).toBeGreaterThanOrEqual(1);
      // Should contain "Available anchors" message with actual anchors
      const suggestions = result.brokenLinks[0]?.suggestions || [];
      expect(suggestions.some(s => s.includes('Available anchors in target.md:'))).toBe(true);
    });

    test('should handle Cyrillic anchors in suggestions', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Занятие 4 Глава 1 Вопросы мудрецов');

      const link: MarkdownLink = {
        text: 'Misspelled Cyrillic',
        href: './target.md#занятие-4-глава-1-вопросы-мудрeцов', // note the 'e' instead of 'е'
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 50
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.suggestions).toContain('./target.md#Занятие-4-Глава-1-Вопросы-мудрецов');
    });

    test('should handle multiple potential matches and return best one', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Section One\n## Section Two\n### Section Three');

      const link: MarkdownLink = {
        text: 'Typo Section',
        href: './target.md#sektion-one', // closest to "section-one"
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        brokenLinks: [],
        localLinks: [link],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0]?.suggestions).toContain('./target.md#Section-One');
    });

    test('should handle empty target file gracefully', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, 'No headings in this file');

      const link: MarkdownLink = {
        text: 'Any Section',
        href: './target.md#any-section',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        processingTime: 0
      };

      const result = await verifier.verifyLinks(scanResult);

      expect(result.brokenLinks).toHaveLength(1);
      // New behavior includes informative message even for files with no anchors
      expect(result.brokenLinks[0]?.suggestions.length).toBeGreaterThanOrEqual(1);
      const suggestions = result.brokenLinks[0]?.suggestions || [];
      expect(suggestions.some(s => s.includes('No anchors found in target.md'))).toBe(true);
    });
  });

  describe('String Similarity Algorithm', () => {
    test('should return 1.0 for identical strings', () => {
      // Access private method via type assertion for testing
      const similarity = (verifier as any).calculateSimilarity('test', 'test');
      expect(similarity).toBe(1.0);
    });

    test('should return 0.0 for completely different strings', () => {
      const similarity = (verifier as any).calculateSimilarity('abc', 'xyz');
      expect(similarity).toBe(0.0);
    });

    test('should return 1.0 for empty strings', () => {
      const similarity = (verifier as any).calculateSimilarity('', '');
      expect(similarity).toBe(1.0);
    });

    test('should return 0.0 when one string is empty', () => {
      const similarity1 = (verifier as any).calculateSimilarity('test', '');
      const similarity2 = (verifier as any).calculateSimilarity('', 'test');
      expect(similarity1).toBe(0.0);
      expect(similarity2).toBe(0.0);
    });

    test('should handle typos correctly', () => {
      const similarity = (verifier as any).calculateSimilarity('sektion', 'section');
      expect(similarity).toBeGreaterThan(0.7);
    });

    test('should handle Cyrillic text', () => {
      const similarity = (verifier as any).calculateSimilarity('заголовок', 'заголовки');
      expect(similarity).toBeGreaterThan(0.7);
    });

    test('should handle partial matches', () => {
      const similarity = (verifier as any).calculateSimilarity('intro', 'introduction');
      expect(similarity).toBeGreaterThan(0.0);
      expect(similarity).toBeLessThan(0.7); // Should not exceed threshold
    });
  });

  describe('Closest Anchor Finding', () => {
    test('should return best match above threshold', () => {
      const anchors = new Set(['section-one', 'section-two', 'introduction']);
      const closest = (verifier as any).findClosestAnchor('sektion-one', anchors);
      expect(closest).toBe('section-one');
    });

    test('should return null when no match above threshold', () => {
      const anchors = new Set(['completely-different', 'unrelated-content']);
      const closest = (verifier as any).findClosestAnchor('my-section', anchors);
      expect(closest).toBeNull();
    });

    test('should return null for empty anchor set', () => {
      const anchors = new Set<string>();
      const closest = (verifier as any).findClosestAnchor('any-section', anchors);
      expect(closest).toBeNull();
    });

    test('should handle ties by returning first match', () => {
      const anchors = new Set(['section-a', 'section-b']); // Equal similarity to 'section-x'
      const closest = (verifier as any).findClosestAnchor('section-x', anchors);
      expect(closest).toBe('section-a'); // First in iteration order
    });

    test('should handle Unicode anchors correctly', () => {
      const anchors = new Set(['занятие-1', 'занятие-2', 'заключение']);
      const closest = (verifier as any).findClosestAnchor('занятиe-1', anchors); // Latin 'e' instead of Cyrillic 'е'
      expect(closest).toBe('занятие-1');
    });
  });

  describe('generateSlug - Anchor Specification Compliance', () => {
    test('preserves case: "Section Title" → "Section-Title"', () => {
      const result = (verifier as any).generateSlug('Section Title');
      expect(result).toBe('Section-Title');
    });

    test('preserves special chars: "Пример №1" → "Пример-№1"', () => {
      const result = (verifier as any).generateSlug('Пример №1');
      expect(result).toBe('Пример-№1');
    });

    test('only replaces spaces: "Мой якорь" → "Мой-якорь"', () => {
      const result = (verifier as any).generateSlug('Мой якорь');
      expect(result).toBe('Мой-якорь');
    });

    test('handles Unicode correctly', () => {
      const result = (verifier as any).generateSlug('Тест заголовка с символами!@#');
      expect(result).toBe('Тест-заголовка-с-символами!@#');
    });

    test('backwards compatibility with common anchors', () => {
      // Test that simple English text still works
      const result = (verifier as any).generateSlug('simple test');
      expect(result).toBe('simple-test');
    });

    test('handles multiple spaces correctly', () => {
      const result = (verifier as any).generateSlug('Multiple   spaces   here');
      expect(result).toBe('Multiple---spaces---here');
    });

    test('trims leading and trailing spaces', () => {
      const result = (verifier as any).generateSlug('  Leading and trailing  ');
      expect(result).toBe('Leading-and-trailing');
    });

    test('handles empty string', () => {
      const result = (verifier as any).generateSlug('');
      expect(result).toBe('');
    });

    test('handles string with only spaces', () => {
      const result = (verifier as any).generateSlug('   ');
      expect(result).toBe('');
    });

    test('preserves hyphens and other punctuation', () => {
      const result = (verifier as any).generateSlug('Pre-existing hyphens & symbols!');
      expect(result).toBe('Pre-existing-hyphens-&-symbols!');
    });

    test('removes only < and > characters as per Telegra.ph rules', () => {
      const result = (verifier as any).generateSlug('Title with <tags> and >arrows<');
      expect(result).toBe('Title-with-tags-and-arrows');
    });

    test('preserves Markdown formatting as per research findings', () => {
      const result = (verifier as any).generateSlug('**Bold Title**');
      expect(result).toBe('**Bold-Title**');
    });

    test('preserves complex punctuation from research', () => {
      const result = (verifier as any).generateSlug('Title with @#$%^&*()-+=[]{}|;\'"');
      expect(result).toBe('Title-with-@#$%^&*()-+=[]{}|;\'\"');
    });
  });

  describe('anchor generation with Markdown formatting', () => {
    test('should preserve bold formatting in anchors according to Telegra.ph rules', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with bold heading
      writeFileSync(targetFile, '# **Bold Title**\n\nContent here');
      // Updated: anchor should include asterisks as per Telegra.ph behavior
      writeFileSync(sourceFile, '[Link to bold](./target.md#**Bold-Title**)');

      const link: MarkdownLink = {
        text: 'Link to bold',
        href: './target.md#**Bold-Title**',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 41
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should preserve italic formatting in anchors according to Telegra.ph rules', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with italic heading
      writeFileSync(targetFile, '## *Italic Title*\n\nContent here');
      // Updated: anchor should include asterisks as per Telegra.ph behavior
      writeFileSync(sourceFile, '[Link to italic](./target.md#*Italic-Title*)');

      const link: MarkdownLink = {
        text: 'Link to italic',
        href: './target.md#*Italic-Title*',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 39
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should preserve link formatting in anchors according to Telegra.ph rules', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with link in heading
      writeFileSync(targetFile, '### [Link Title](https://example.com)\n\nContent here');
      // Updated: new behavior extracts text from links in headings (correct TOC behavior)
      writeFileSync(sourceFile, '[Link to link heading](./target.md#Link-Title)');

      const link: MarkdownLink = {
        text: 'Link to link heading',
        href: './target.md#Link-Title',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 50
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should preserve mixed formatting in anchors according to Telegra.ph rules', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with mixed formatting
      writeFileSync(targetFile, '#### **Bold** and *Italic* Text\n\nContent here');
      // Updated: anchor should preserve all Markdown formatting
      writeFileSync(sourceFile, '[Link to mixed](./target.md#**Bold**-and-*Italic*-Text)');

      const link: MarkdownLink = {
        text: 'Link to mixed',
        href: './target.md#**Bold**-and-*Italic*-Text',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 52
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should preserve complex nested formatting in anchors according to Telegra.ph rules', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with complex nested formatting
      writeFileSync(targetFile, '##### **Bold _nested_ text** with `code`\n\nContent here');
      // Updated: H5 heading gets prefix and preserves all Markdown formatting
      writeFileSync(sourceFile, '[Link to complex](./target.md#>-**Bold-_nested_-text**-with-`code`)');

      const link: MarkdownLink = {
        text: 'Link to complex',
        href: './target.md#>-**Bold-_nested_-text**-with-`code`',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 64
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });

    test('should still detect broken links with incorrect anchor format', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with bold heading (generates anchor: **Bold-Title**)
      writeFileSync(targetFile, '# **Bold Title**\n\nContent here');
      // Link to wrong anchor (missing asterisks and has typo)
      writeFileSync(sourceFile, '[Link with typo](./target.md#Bold-Titel)');

      const link: MarkdownLink = {
        text: 'Link with typo',
        href: './target.md#Bold-Titel',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 38
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0].link.href).toBe('./target.md#Bold-Titel');
    });

    test('should work with cyrillic headings with formatting stripped', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Create target file with cyrillic bold heading
      writeFileSync(targetFile, '# **Тема 1: Введение: Практические наставления и сиддханта**\n\nСодержимое');
      // Anchor should have formatting stripped (textForAnchor removes ** for clean anchors)
      writeFileSync(sourceFile, '[Ссылка](./target.md#Тема-1:-Введение:-Практические-наставления-и-сиддханта)');

      const link: MarkdownLink = {
        text: 'Ссылка',
        href: './target.md#Тема-1:-Введение:-Практические-наставления-и-сиддханта',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 83
      };

      const scanResult: FileScanResult = {
        filePath: sourceFile,
        allLinks: [link],
        localLinks: [link],
        brokenLinks: [],
        headings: []
      };

      const result = await verifier.verifyLinks(scanResult);
      expect(result.brokenLinks).toHaveLength(0);
    });
  });
});