import { describe, it, expect } from 'vitest';
import { convertMarkdownToTelegraphNodes } from './markdownConverter';
import type { TelegraphNode } from './telegraphPublisher';

describe('markdownConverter - Link Parsing Fix', () => {
  describe('Problematic content from 02.md', () => {
    it('should parse links correctly without capturing extra text', () => {
      const content = '...следующим образом. [1](02/01.02.01.md)';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tag: 'p',
        children: expect.arrayContaining([
          '...следующим образом. ',
          {
            tag: 'a',
            attrs: { href: '02/01.02.01.md' },
            children: ['1']
          }
        ])
      });
    });

    it('should handle text immediately following link without overflow', () => {
      const content = 'Text [link](url) more text after';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        'Text ',
        {
          tag: 'a',
          attrs: { href: 'url' },
          children: ['link']
        },
        ' more text after'
      ]);
    });
  });

  describe('Links with nested brackets in text portion', () => {
    it('should handle nested brackets in link text correctly', () => {
      const content = 'See [Item [1.1]](section1.md) for details.';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        'See ',
        {
          tag: 'a',
          attrs: { href: 'section1.md' },
          children: ['Item [1.1]']
        },
        ' for details.'
      ]);
    });

    it('should handle regex limitations for deeply nested brackets gracefully', () => {
      // Note: The regex has limitations with multiple levels of nesting (>1 level)
      // This is acceptable as it's extremely rare in real content
      const content = 'Check [Part [A [1.1]]](partA.md) section.';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      // Should treat as plain text since regex can't handle 2+ levels of nesting
      expect(paragraph.children).toEqual([
        'Check [Part [A [1.1]]](partA.md) section.'
      ]);
    });
  });

  describe('Multiple links in same paragraph', () => {
    it('should parse multiple links without interference', () => {
      const content = 'See [link1](url1) and [link2](url2) for more info.';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        'See ',
        {
          tag: 'a',
          attrs: { href: 'url1' },
          children: ['link1']
        },
        ' and ',
        {
          tag: 'a',
          attrs: { href: 'url2' },
          children: ['link2']
        },
        ' for more info.'
      ]);
    });

    it('should handle adjacent links', () => {
      const content = '[First](url1)[Second](url2)';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        {
          tag: 'a',
          attrs: { href: 'url1' },
          children: ['First']
        },
        {
          tag: 'a',
          attrs: { href: 'url2' },
          children: ['Second']
        }
      ]);
    });
  });

  describe('Edge cases and existing functionality preservation', () => {
    it('should preserve parentheses in URLs functionality', () => {
      const content = 'Link to [Wikipedia](https://en.wikipedia.org/wiki/Test_(disambiguation))';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        'Link to ',
        {
          tag: 'a',
          attrs: { href: 'https://en.wikipedia.org/wiki/Test_(disambiguation)' },
          children: ['Wikipedia']
        }
      ]);
    });

    it('should handle malformed links gracefully', () => {
      const content = 'Broken [link without closing paren (url and [another](valid.md)';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      // Should only parse the valid link
      expect(paragraph.children).toEqual([
        'Broken [link without closing paren (url and ',
        {
          tag: 'a',
          attrs: { href: 'valid.md' },
          children: ['another']
        }
      ]);
    });

    it('should handle links at beginning and end of text', () => {
      const content = '[Start](start.md) middle text [End](end.md)';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        {
          tag: 'a',
          attrs: { href: 'start.md' },
          children: ['Start']
        },
        ' middle text ',
        {
          tag: 'a',
          attrs: { href: 'end.md' },
          children: ['End']
        }
      ]);
    });

    it('should handle empty link text and href', () => {
      const content = 'Empty [](empty.md) and [text]() links';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        'Empty ',
        {
          tag: 'a',
          attrs: { href: 'empty.md' },
          children: ['']
        },
        ' and ',
        {
          tag: 'a',
          attrs: { href: '' },
          children: ['text']
        },
        ' links'
      ]);
    });
  });

  describe('Regression prevention', () => {
    it('should not affect other markdown formatting', () => {
      const content = '**Bold** with [link](url) and *italic* text.';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        {
          tag: 'strong',
          children: ['Bold']
        },
        ' with ',
        {
          tag: 'a',
          attrs: { href: 'url' },
          children: ['link']
        },
        ' and ',
        {
          tag: 'em',
          children: ['italic']
        },
        ' text.'
      ]);
    });

    it('should handle complex mixed formatting', () => {
      const content = 'Text with `code` and [**bold link**](url) plus `more code`.';
      const result = convertMarkdownToTelegraphNodes(content);
      
      expect(result).toHaveLength(1);
      const paragraph = result[0] as TelegraphNode;
      expect(paragraph.children).toEqual([
        'Text with ',
        {
          tag: 'code',
          children: ['code']
        },
        ' and ',
        {
          tag: 'a',
          attrs: { href: 'url' },
          children: [{
            tag: 'strong',
            children: ['bold link']
          }]
        },
        ' plus ',
        {
          tag: 'code',
          children: ['more code']
        },
        '.'
      ]);
    });
  });
});
