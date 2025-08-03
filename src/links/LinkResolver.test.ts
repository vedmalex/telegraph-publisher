import { beforeEach, describe, expect, test } from 'bun:test';
import { LinkResolver } from './LinkResolver';
import type { BrokenLink, FileScanResult, MarkdownLink } from './types';

describe('LinkResolver', () => {
  let resolver: LinkResolver;

  beforeEach(() => {
    resolver = new LinkResolver();
  });

  describe('resolveBrokenLinks', () => {
    test('should find suggestions for broken links', async () => {
      const scanResults: FileScanResult[] = [
        {
          filePath: '/project/docs/guide.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: '/project/docs/guide.md',
              link: {
                text: 'API Reference',
                href: './api.md',
                lineNumber: 5,
                columnStart: 0,
                columnEnd: 20
              },
              suggestions: [],
              canAutoFix: false
            }
          ],
          processingTime: 0
        },
        {
          filePath: '/project/reference/api.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [],
          processingTime: 0
        }
      ];

      const resolved = await resolver.resolveBrokenLinks(scanResults);

      expect(resolved[0]?.brokenLinks[0]?.suggestions).toHaveLength(1);
      expect(resolved[0]?.brokenLinks[0]?.suggestions[0]).toBe('../reference/api.md');
      expect(resolved[0]?.brokenLinks[0]?.canAutoFix).toBe(true);
    });

    test('should handle multiple files with same name', async () => {
      const scanResults: FileScanResult[] = [
        {
          filePath: '/project/docs/guide.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: '/project/docs/guide.md',
              link: {
                text: 'Config',
                href: './config.md',
                lineNumber: 5,
                columnStart: 0,
                columnEnd: 20
              },
              suggestions: [],
              canAutoFix: false
            }
          ],
          processingTime: 0
        },
        {
          filePath: '/project/config/config.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [],
          processingTime: 0
        },
        {
          filePath: '/project/examples/config.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [],
          processingTime: 0
        }
      ];

      const resolved = await resolver.resolveBrokenLinks(scanResults);

      expect(resolved[0]?.brokenLinks[0]?.suggestions).toHaveLength(2);
      expect(resolved[0]?.brokenLinks[0]?.suggestions).toContain('../config/config.md');
      expect(resolved[0]?.brokenLinks[0]?.suggestions).toContain('../examples/config.md');
    });

    test('should not find suggestions for non-existent files', async () => {
      const scanResults: FileScanResult[] = [
        {
          filePath: '/project/docs/guide.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: '/project/docs/guide.md',
              link: {
                text: 'Non-existent',
                href: './nonexistent.md',
                lineNumber: 5,
                columnStart: 0,
                columnEnd: 20
              },
              suggestions: [],
              canAutoFix: false
            }
          ],
          processingTime: 0
        }
      ];

      const resolved = await resolver.resolveBrokenLinks(scanResults);

      expect(resolved[0]?.brokenLinks[0]?.suggestions).toHaveLength(0);
      expect(resolved[0]?.brokenLinks[0]?.canAutoFix).toBe(false);
    });

    test('should sort suggestions by preference', async () => {
      const scanResults: FileScanResult[] = [
        {
          filePath: '/project/docs/guide.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: '/project/docs/guide.md',
              link: {
                text: 'File',
                href: './file.md',
                lineNumber: 5,
                columnStart: 0,
                columnEnd: 20
              },
              suggestions: [],
              canAutoFix: false
            }
          ],
          processingTime: 0
        },
        {
          filePath: '/project/docs/file.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [],
          processingTime: 0
        },
        {
          filePath: '/project/deep/nested/path/file.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [],
          processingTime: 0
        }
      ];

      const resolved = await resolver.resolveBrokenLinks(scanResults);
      const suggestions = resolved[0]?.brokenLinks[0]?.suggestions || [];

      // Shorter path should come first
      expect(suggestions[0]).toBe('./file.md');
      expect(suggestions[1]).toBe('../deep/nested/path/file.md');
    });
  });

  describe('getBestSuggestion', () => {
    test('should return the first suggestion', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Link',
          href: './target.md',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: ['./suggestion1.md', './suggestion2.md'],
        canAutoFix: true
      };

      const best = resolver.getBestSuggestion(brokenLink);
      expect(best).toBe('./suggestion1.md');
    });

    test('should return null for no suggestions', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Link',
          href: './target.md',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: [],
        canAutoFix: false
      };

      const best = resolver.getBestSuggestion(brokenLink);
      expect(best).toBeNull();
    });
  });

  describe('hasMultipleSuggestions', () => {
    test('should return true for multiple suggestions', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Link',
          href: './target.md',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: ['./suggestion1.md', './suggestion2.md'],
        canAutoFix: true
      };

      expect(resolver.hasMultipleSuggestions(brokenLink)).toBe(true);
    });

    test('should return false for single suggestion', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Link',
          href: './target.md',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: ['./suggestion1.md'],
        canAutoFix: true
      };

      expect(resolver.hasMultipleSuggestions(brokenLink)).toBe(false);
    });
  });

  describe('groupByTargetFilename', () => {
    test('should group broken links by target filename', () => {
      const brokenLinks: BrokenLink[] = [
        {
          filePath: '/project/file1.md',
          link: {
            text: 'Config',
            href: './config.md',
            lineNumber: 1,
            columnStart: 0,
            columnEnd: 10
          },
          suggestions: [],
          canAutoFix: false
        },
        {
          filePath: '/project/file2.md',
          link: {
            text: 'Config',
            href: '../config.md',
            lineNumber: 1,
            columnStart: 0,
            columnEnd: 10
          },
          suggestions: [],
          canAutoFix: false
        },
        {
          filePath: '/project/file3.md',
          link: {
            text: 'API',
            href: './api.md',
            lineNumber: 1,
            columnStart: 0,
            columnEnd: 10
          },
          suggestions: [],
          canAutoFix: false
        }
      ];

      const groups = resolver.groupByTargetFilename(brokenLinks);

      expect(groups.size).toBe(2);
      expect(groups.get('config.md')).toHaveLength(2);
      expect(groups.get('api.md')).toHaveLength(1);
    });
  });

  describe('calculateFixConfidence', () => {
    test('should return high confidence for exact filename match', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Config',
          href: './config.md',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: [],
        canAutoFix: false
      };

      const confidence = resolver.calculateFixConfidence(brokenLink, '../other/config.md');
      expect(confidence).toBeGreaterThanOrEqual(0.8);
    });

    test('should return lower confidence for partial match', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Config',
          href: './config.md',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: [],
        canAutoFix: false
      };

      const confidence = resolver.calculateFixConfidence(brokenLink, '../other/configuration.md');
      expect(confidence).toBeLessThan(0.6);
    });

    test('should return zero confidence for no filename', () => {
      const brokenLink: BrokenLink = {
        filePath: '/project/file.md',
        link: {
          text: 'Directory',
          href: './some-directory/',
          lineNumber: 1,
          columnStart: 0,
          columnEnd: 10
        },
        suggestions: [],
        canAutoFix: false
      };

      const confidence = resolver.calculateFixConfidence(brokenLink, '../other/config.md');
      expect(confidence).toBe(0);
    });
  });

  describe('getResolutionStats', () => {
    test('should calculate correct resolution statistics', () => {
      const scanResults: FileScanResult[] = [
        {
          filePath: '/project/file1.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: '/project/file1.md',
              link: {
                text: 'Link 1',
                href: './target1.md',
                lineNumber: 1,
                columnStart: 0,
                columnEnd: 10
              },
              suggestions: ['./suggestion1.md'],
              canAutoFix: true
            },
            {
              filePath: '/project/file1.md',
              link: {
                text: 'Link 2',
                href: './target2.md',
                lineNumber: 2,
                columnStart: 0,
                columnEnd: 10
              },
              suggestions: [],
              canAutoFix: false
            }
          ],
          processingTime: 0
        },
        {
          filePath: '/project/file2.md',
          allLinks: [],
          localLinks: [],
          brokenLinks: [
            {
              filePath: '/project/file2.md',
              link: {
                text: 'Link 3',
                href: './target3.md',
                lineNumber: 1,
                columnStart: 0,
                columnEnd: 10
              },
              suggestions: ['./suggestion3a.md', './suggestion3b.md'],
              canAutoFix: true
            }
          ],
          processingTime: 0
        }
      ];

      const stats = resolver.getResolutionStats(scanResults);

      expect(stats.totalBrokenLinks).toBe(3);
      expect(stats.linksWithSuggestions).toBe(2);
      expect(stats.resolutionRate).toBeCloseTo(66.67, 2); // 2/3 * 100
      expect(stats.averageSuggestionsPerLink).toBe(1.5); // (1 + 2) / 2
      expect(stats.filesWithAutoFixableLinks).toBe(2);
    });

    test('should handle empty results', () => {
      const stats = resolver.getResolutionStats([]);

      expect(stats.totalBrokenLinks).toBe(0);
      expect(stats.linksWithSuggestions).toBe(0);
      expect(stats.resolutionRate).toBe(0);
      expect(stats.averageSuggestionsPerLink).toBe(0);
      expect(stats.filesWithAutoFixableLinks).toBe(0);
    });
  });

  describe('extractFilename', () => {
    test('should extract filename from various paths', () => {
      // Access private method for testing through type assertion
      const extractFilename = (resolver as any).extractFilename.bind(resolver);

      expect(extractFilename('./config.md')).toBe('config.md');
      expect(extractFilename('../path/to/file.md')).toBe('file.md');
      expect(extractFilename('/absolute/path/file.md')).toBe('file.md');
      expect(extractFilename('file.md')).toBe('file.md');
    });

    test('should handle query parameters and fragments', () => {
      const extractFilename = (resolver as any).extractFilename.bind(resolver);

      expect(extractFilename('./file.md?param=value')).toBe('file.md');
      expect(extractFilename('./file.md#section')).toBe('file.md');
      expect(extractFilename('./file.md?param=value#section')).toBe('file.md');
    });

    test('should return null for invalid filenames', () => {
      const extractFilename = (resolver as any).extractFilename.bind(resolver);

      expect(extractFilename('./directory/')).toBeNull();
      expect(extractFilename('./no-extension')).toBeNull();
      expect(extractFilename('')).toBeNull();
    });
  });
});