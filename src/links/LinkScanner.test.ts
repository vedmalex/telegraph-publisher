import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LinkScanner } from './LinkScanner';
import { LinkVerificationException } from './types';

describe('LinkScanner', () => {
  const testDir = join(process.cwd(), 'test-link-scanner');
  let scanner: LinkScanner;

  beforeEach(() => {
    // Create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    scanner = new LinkScanner();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    test('should use default configuration', () => {
      const defaultScanner = new LinkScanner();
      const config = defaultScanner.getConfig();

      expect(config.extensions).toEqual(['.md', '.markdown']);
      expect(config.ignoreDirs).toEqual(['.git', 'node_modules', 'dist', '.specstory']);
      expect(config.maxDepth).toBe(-1);
      expect(config.followSymlinks).toBe(false);
    });

    test('should accept custom configuration', () => {
      const customScanner = new LinkScanner({
        extensions: ['.txt'],
        ignoreDirs: ['custom'],
        maxDepth: 2,
        followSymlinks: true
      });
      const config = customScanner.getConfig();

      expect(config.extensions).toEqual(['.txt']);
      expect(config.ignoreDirs).toEqual(['custom']);
      expect(config.maxDepth).toBe(2);
      expect(config.followSymlinks).toBe(true);
    });
  });

  describe('findMarkdownFiles', () => {
    test('should find single markdown file', async () => {
      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, '# Test');

      const files = await scanner.findMarkdownFiles(filePath);
      expect(files).toEqual([filePath]);
    });

    test('should return empty array for non-markdown file', async () => {
      const filePath = join(testDir, 'test.txt');
      writeFileSync(filePath, 'test');

      const files = await scanner.findMarkdownFiles(filePath);
      expect(files).toEqual([]);
    });

    test('should find markdown files in directory', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.markdown');
      const file3 = join(testDir, 'file3.txt');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');
      writeFileSync(file3, 'Not markdown');

      const files = await scanner.findMarkdownFiles(testDir);
      expect(files.sort()).toEqual([file1, file2].sort());
    });

    test('should find files recursively', async () => {
      const subDir = join(testDir, 'subdir');
      mkdirSync(subDir);

      const file1 = join(testDir, 'root.md');
      const file2 = join(subDir, 'sub.md');

      writeFileSync(file1, '# Root');
      writeFileSync(file2, '# Sub');

      const files = await scanner.findMarkdownFiles(testDir);
      expect(files.sort()).toEqual([file1, file2].sort());
    });

    test('should ignore specified directories', async () => {
      const nodeModules = join(testDir, 'node_modules');
      const gitDir = join(testDir, '.git');
      mkdirSync(nodeModules);
      mkdirSync(gitDir);

      writeFileSync(join(nodeModules, 'package.md'), '# Package');
      writeFileSync(join(gitDir, 'config.md'), '# Git');
      writeFileSync(join(testDir, 'readme.md'), '# Readme');

      const files = await scanner.findMarkdownFiles(testDir);
      expect(files).toEqual([join(testDir, 'readme.md')]);
    });

    test('should throw error for non-existent path', async () => {
      const nonExistentPath = join(testDir, 'non-existent');

      await expect(scanner.findMarkdownFiles(nonExistentPath))
        .rejects.toThrow(LinkVerificationException);
    });
  });

  describe('scanFile', () => {
    test('should extract markdown links from file', async () => {
      const content = `# Test Document

Here is a [local link](./local.md) and an [external link](https://example.com).
Also a [relative link](../parent.md) and [email](mailto:test@example.com).
Fragment link: [section](#section)
`;

      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, content);

      const result = await scanner.scanFile(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.allLinks).toHaveLength(5);
      expect(result.localLinks).toHaveLength(2); // Only ./local.md and ../parent.md
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    test('should capture correct line numbers and positions', async () => {
      const content = `Line 1
[Link on line 2](./file.md)
Line 3
[Another link](./other.md) on line 4`;

      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, content);

      const result = await scanner.scanFile(filePath);

      expect(result.allLinks).toHaveLength(2);
      expect(result.allLinks[0]?.lineNumber).toBe(2);
      expect(result.allLinks[1]?.lineNumber).toBe(4);
      expect(result.allLinks[0]?.columnStart).toBe(0);
    });

    test('should handle files with no links', async () => {
      const content = '# Simple document\n\nNo links here.';
      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, content);

      const result = await scanner.scanFile(filePath);

      expect(result.allLinks).toHaveLength(0);
      expect(result.localLinks).toHaveLength(0);
    });

    test('should throw error for unreadable file', async () => {
      const nonExistentFile = join(testDir, 'non-existent.md');

      await expect(scanner.scanFile(nonExistentFile))
        .rejects.toThrow(LinkVerificationException);
    });
  });

  describe('link extraction', () => {
    test('should correctly identify local vs external links', async () => {
      const content = `
[Local relative](./local.md)
[Local absolute](/absolute.md)
[HTTP link](http://example.com)
[HTTPS link](https://example.com)
[Email](mailto:test@example.com)
[FTP](ftp://files.example.com)
[Protocol relative](//example.com)
[Fragment](#section)
[Parent relative](../parent.md)
`;

      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, content);

      const result = await scanner.scanFile(filePath);

      // Should extract all links
      expect(result.allLinks).toHaveLength(9);

      // Only local file links (not external URLs or fragments)
      expect(result.localLinks).toHaveLength(3);
      expect(result.localLinks.map(l => l.href)).toEqual([
        './local.md',
        '/absolute.md',
        '../parent.md'
      ]);
    });

    test('should handle complex link formats', async () => {
      const content = `
[Simple link](file.md)
[Link with spaces]( file with spaces.md )
[Empty text](empty.md)
[](no-text.md)
[Nested [brackets]](nested.md)
[Special chars](file-with_special.chars.md)
`;

      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, content);

      const result = await scanner.scanFile(filePath);

      expect(result.allLinks).toHaveLength(6);
      expect(result.localLinks.map(l => l.href.trim())).toEqual([
        'file.md',
        'file with spaces.md',
        'empty.md',
        'no-text.md',
        'nested.md',
        'file-with_special.chars.md'
      ]);
    });
  });

  describe('configuration', () => {
    test('should update configuration', () => {
      scanner.updateConfig({
        extensions: ['.txt'],
        maxDepth: 5
      });

      const config = scanner.getConfig();
      expect(config.extensions).toEqual(['.txt']);
      expect(config.maxDepth).toBe(5);
      // Other settings should remain unchanged
      expect(config.ignoreDirs).toEqual(['.git', 'node_modules', 'dist', '.specstory']);
    });

    test('should respect maxDepth setting', async () => {
      // Create nested directory structure
      const level1 = join(testDir, 'level1');
      const level2 = join(level1, 'level2');
      const level3 = join(level2, 'level3');

      mkdirSync(level1);
      mkdirSync(level2);
      mkdirSync(level3);

      writeFileSync(join(testDir, 'root.md'), '# Root');
      writeFileSync(join(level1, 'level1.md'), '# Level 1');
      writeFileSync(join(level2, 'level2.md'), '# Level 2');
      writeFileSync(join(level3, 'level3.md'), '# Level 3');

      // Set max depth to 2
      scanner.updateConfig({ maxDepth: 2 });

      const files = await scanner.findMarkdownFiles(testDir);

      // Should find root and level1 but not level2 and level3 (maxDepth=2 means depths 0,1)
      expect(files).toHaveLength(2);
      expect(files.some(f => f.includes('level2'))).toBe(false);
      expect(files.some(f => f.includes('level3'))).toBe(false);
    });

    test('should respect custom file extensions', async () => {
      writeFileSync(join(testDir, 'file.md'), '# Markdown');
      writeFileSync(join(testDir, 'file.txt'), '# Text');
      writeFileSync(join(testDir, 'file.doc'), '# Document');

      scanner.updateConfig({ extensions: ['.txt', '.doc'] });

      const files = await scanner.findMarkdownFiles(testDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('.md'))).toBe(false);
      expect(files.some(f => f.endsWith('.txt'))).toBe(true);
      expect(files.some(f => f.endsWith('.doc'))).toBe(true);
    });
  });
});