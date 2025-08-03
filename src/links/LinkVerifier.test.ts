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
});