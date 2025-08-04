import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { LinkVerifier } from './LinkVerifier';
import { PathResolver } from '../utils/PathResolver';
import type { FileScanResult, MarkdownLink } from './types';

describe('Research Validation - Telegra.ph Anchor Generation Rules', () => {
  let verifier: LinkVerifier;
  let pathResolver: PathResolver;
  let testDir: string;

  beforeEach(() => {
    pathResolver = new PathResolver(__dirname);
    verifier = new LinkVerifier(pathResolver);
    testDir = join(__dirname, 'test-research-validation');
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('Basic Rules Validation', () => {
    test('Rule 1: Spaces replaced with hyphens', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Simple Title\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#Simple-Title)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#Simple-Title',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 30
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

    test('Rule 1 (Cyrillic): Spaces replaced with hyphens for Cyrillic text', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Заголовок с пробелами\n\nСодержимое');
      writeFileSync(sourceFile, '[Ссылка](./target.md#Заголовок-с-пробелами)');

      const link: MarkdownLink = {
        text: 'Ссылка',
        href: './target.md#Заголовок-с-пробелами',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 44
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

    test('Rule 2: Numbered headings preserve all symbols including dots', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# 1. Numbered Heading\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#1.-Numbered-Heading)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#1.-Numbered-Heading',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 37
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

    test('Rule 2: Punctuation marks are preserved', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Title with comma,\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#Title-with-comma,)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#Title-with-comma,',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 35
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

    test('Rule 3: Only < and > characters are removed', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Title with <tags> and >arrows<\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#Title-with-tags-and-arrows)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#Title-with-tags-and-arrows',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 44
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

  describe('Markdown Formatting Preservation', () => {
    test('Rule 4: Bold formatting symbols are preserved', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# **Bold Title**\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#**Bold-Title**)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#**Bold-Title**',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 33
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

    test('Rule 4: Italic formatting symbols are preserved', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# *Italic Title*\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#*Italic-Title*)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#*Italic-Title*',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 31
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

    test('Rule 4: Link formatting symbols are preserved', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# [Link Title](url)\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#[Link-Title](url))');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#[Link-Title](url)',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 35
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

  describe('Complex Cases from Research', () => {
    test('Cyrillic with complex formatting and punctuation', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)\n\nСодержимое');
      writeFileSync(sourceFile, '[Ссылка](./target.md#Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4))');

      const link: MarkdownLink = {
        text: 'Ссылка',
        href: './target.md#Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 82
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

    test('Special symbols preservation', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Title with @#$%^&*()+-=[]{}|;\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#Title-with-@#$%^&*()+-=[]{}|;)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#Title-with-@#$%^&*()+-=[]{}|;',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 46
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

    test('Mixed formatting preservation', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# **Bold** and *Italic* with [Link](url)\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#**Bold**-and-*Italic*-with-[Link](url))');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#**Bold**-and-*Italic*-with-[Link](url)',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 56
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

  describe('Edge Cases', () => {
    test('Empty string handling', () => {
      const result = (verifier as any).generateSlug('');
      expect(result).toBe('');
    });

    test('Only spaces string handling', () => {
      const result = (verifier as any).generateSlug('   ');
      expect(result).toBe('');
    });

    test('String with only < and > characters', () => {
      const result = (verifier as any).generateSlug('<>');
      expect(result).toBe('');
    });

    test('String with spaces and < > characters', () => {
      const result = (verifier as any).generateSlug('Title <with> spaces');
      expect(result).toBe('Title-with-spaces');
    });

    test('Multiple consecutive spaces', () => {
      const result = (verifier as any).generateSlug('Title   with    multiple     spaces');
      expect(result).toBe('Title---with----multiple-----spaces');
    });
  });

  describe('Regression Prevention', () => {
    test('Should reject old anchor format (cleaned markdown)', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      // Target has bold formatting
      writeFileSync(targetFile, '# **Bold Title**\n\nContent here');
      // Source uses old format (without asterisks) - should be broken
      writeFileSync(sourceFile, '[Link](./target.md#Bold-Title)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#Bold-Title',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 29
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
      expect(result.brokenLinks[0].link.href).toBe('./target.md#Bold-Title');
    });

    test('Case sensitivity should be preserved', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Mixed CaSe Title\n\nContent here');
      writeFileSync(sourceFile, '[Link](./target.md#Mixed-CaSe-Title)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#Mixed-CaSe-Title',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 34
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

    test('Wrong case should be broken', async () => {
      const targetFile = join(testDir, 'target.md');
      const sourceFile = join(testDir, 'source.md');

      writeFileSync(targetFile, '# Mixed CaSe Title\n\nContent here');
      // Wrong case in link
      writeFileSync(sourceFile, '[Link](./target.md#mixed-case-title)');

      const link: MarkdownLink = {
        text: 'Link',
        href: './target.md#mixed-case-title',
        lineNumber: 1,
        columnStart: 0,
        columnEnd: 34
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
    });
  });
});