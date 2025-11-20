import { describe, it, expect, test } from 'bun:test';
import { convertMarkdownToTelegraphNodes } from './markdownConverter';
import { AnchorGenerator } from './utils/AnchorGenerator';

const findTocList = (nodes: any[]) => {
	const aside = nodes.find((node) => typeof node === "object" && node.tag === "aside");
	if (aside && typeof aside === "object" && aside.children) {
		const ul = aside.children.find((child: any) => child && typeof child === "object" && child.tag === "ul");
		if (ul) return ul;
	}
	return nodes.find((node) => typeof node === "object" && node.tag === "ul");
};

/** 
 * Test suite for ToC generation with heading-links
 * Validates fix for nested link bug discovered in user report
 */
describe('MarkdownConverter - ToC Heading Links', () => {
  
  it('should generate ToC with plain text for heading-links (user bug fix)', () => {
    // Test case based on user's bug report: BUG/index.md
    const testMarkdown = `## [Аналогии](./аналогии.md)

Some content here.

## [Домашнее задание](./задание.md)

More content.`;

    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: true });

    const tocList = findTocList(nodes);
    expect(tocList).toBeDefined();
    if (!tocList || !tocList.children) return;

    const listItems = tocList.children;
    expect(listItems).toHaveLength(2);
    
    const firstItem = listItems[0];
    if (typeof firstItem === 'object' && firstItem.children) {
      const firstLink = firstItem.children[0];
      if (typeof firstLink === 'object' && firstLink.tag === 'a') {
        expect(firstLink.attrs?.href).toBe('#Аналогии');
        expect(firstLink.children).toHaveLength(1);
        expect(firstLink.children[0]).toBe('Аналогии');
        expect(typeof firstLink.children[0]).toBe('string');
      }
    }
    
    const secondItem = listItems[1];
    if (typeof secondItem === 'object' && secondItem.children) {
      const secondLink = secondItem.children[0];
      if (typeof secondLink === 'object' && secondLink.tag === 'a') {
        expect(secondLink.attrs?.href).toBe('#Домашнее-задание');
        expect(secondLink.children).toHaveLength(1);
        expect(secondLink.children[0]).toBe('Домашнее задание');
        expect(typeof secondLink.children[0]).toBe('string');
      }
    }
  });

  it('should handle mixed heading types correctly', () => {
    const testMarkdown = `## Normal Heading

Content here.

## [Link Heading](./file.md)

More content.

## **Bold Heading**

    Final content.`;

    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: true });
    
    const tocList = findTocList(nodes);
    expect(tocList).toBeDefined();
    if (!tocList || !tocList.children) return;

    const listItems = tocList.children;
    expect(listItems).toHaveLength(3);
    
    const normalItem = listItems[0];
    if (typeof normalItem === 'object' && normalItem.children) {
      const normalLink = normalItem.children[0];
      if (typeof normalLink === 'object' && normalLink.children) {
        expect(normalLink.children[0]).toBe('Normal Heading');
        expect(typeof normalLink.children[0]).toBe('string');
      }
    }
    
    const linkItem = listItems[1];
    if (typeof linkItem === 'object' && linkItem.children) {
      const linkLink = linkItem.children[0];
      if (typeof linkLink === 'object' && linkLink.children) {
        expect(linkLink.children[0]).toBe('Link Heading');
        expect(typeof linkLink.children[0]).toBe('string');
      }
    }
    
    const boldItem = listItems[2];
    if (typeof boldItem === 'object' && boldItem.children) {
      const boldLink = boldItem.children[0];
      if (typeof boldLink === 'object' && boldLink.children) {
        expect(boldLink.children).toHaveLength(1);
        const strongTag = boldLink.children[0];
        expect(typeof strongTag).toBe('object');
        if (typeof strongTag === 'object' && strongTag !== null) {
          expect(strongTag.tag).toBe('strong');
          expect(strongTag.children).toEqual(['Bold Heading']);
        }
      }
    }
  });

  it('should prevent nested links for external URLs in headings', () => {
    const testMarkdown = `## [External Link](https://example.com)

Content here.

## [Another External](https://test.com)

More content.`;

    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: true });
    
    const tocAside = nodes.find(node => typeof node === 'object' && node.tag === 'aside');
    expect(tocAside).toBeDefined();
    
    if (tocAside && typeof tocAside === 'object' && tocAside.children) {
      const ul = tocAside.children[0];
      if (typeof ul === 'object' && ul.tag === 'ul' && ul.children) {
        const listItems = ul.children;
        expect(listItems).toHaveLength(2);
        
        // Verify both items have plain text only
        for (let i = 0; i < listItems.length; i++) {
          const item = listItems[i];
          if (typeof item === 'object' && item.children) {
            const link = item.children[0];
            if (typeof link === 'object' && link.children) {
              // Must be plain text, no nested link objects
              expect(link.children).toHaveLength(1);
              expect(typeof link.children[0]).toBe('string');
              
              // Should not contain any nested objects (links)
              const hasNestedObjects = link.children.some(child => typeof child === 'object');
              expect(hasNestedObjects).toBe(false);
            }
          }
        }
      }
    }
  });

  it('should handle complex link headings with formatting', () => {
    const testMarkdown = `## [**Bold Text** in Link](./file.md)

Content.

## [Text with *italic*](./other.md)

More content.`;

    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: true });
    
    const tocAside = nodes.find(node => typeof node === 'object' && node.tag === 'aside');
    expect(tocAside).toBeDefined();
    
    if (tocAside && typeof tocAside === 'object' && tocAside.children) {
      const ul = tocAside.children[0];
      if (typeof ul === 'object' && ul.tag === 'ul' && ul.children) {
        const listItems = ul.children;
        expect(listItems).toHaveLength(2);
        
        // Test bold text in link heading
        const boldItem = listItems[0];
        if (typeof boldItem === 'object' && boldItem.children) {
          const boldLink = boldItem.children[0];
          if (typeof boldLink === 'object' && boldLink.children) {
            expect(boldLink.children[0]).toBe('**Bold Text** in Link');
            expect(typeof boldLink.children[0]).toBe('string');
          }
        }
        
        // Test italic text in link heading
        const italicItem = listItems[1];
        if (typeof italicItem === 'object' && italicItem.children) {
          const italicLink = italicItem.children[0];
          if (typeof italicLink === 'object' && italicLink.children) {
            expect(italicLink.children[0]).toBe('Text with *italic*');
            expect(typeof italicLink.children[0]).toBe('string');
          }
        }
      }
    }
  });

  it('should work correctly when ToC is disabled', () => {
    const testMarkdown = `## [Link Heading](./file.md)

Content here.`;

    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: false });
    
    // Should not contain any aside elements
    const tocAside = nodes.find(node => typeof node === 'object' && node.tag === 'aside');
    expect(tocAside).toBeUndefined();
    
    // Should still contain the heading content
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('should reproduce exact user bug scenario', () => {
    // Exact content from user's BUG/index.md
    const userMarkdown = `## [Аналогии](./аналогии.md)

- [Анализ аналогий из Шримад-Бхагаватам 1.1](./аналогии.md#Анализ-аналогий-из-Шримад-Бхагаватам-1.1)
- [1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)](./аналогии.md#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4))

## [Домашнее задание](./задание.md)

- [Практическое домашнее задание: Искусство задавать вопросы](./задание.md#Практическое-домашнее-задание:-Искусство-задавать-вопросы)`;

    const nodes = convertMarkdownToTelegraphNodes(userMarkdown, { generateToc: true });
    
    // Find ToC
    const tocAside = nodes.find(node => typeof node === 'object' && node.tag === 'aside');
    expect(tocAside).toBeDefined();
    
    if (tocAside && typeof tocAside === 'object' && tocAside.children) {
      const ul = tocAside.children[0];
      if (typeof ul === 'object' && ul.tag === 'ul' && ul.children) {
        const listItems = ul.children;
        expect(listItems).toHaveLength(2);
        
        // Validate first item: Аналогии
        const firstItem = listItems[0];
        if (typeof firstItem === 'object' && firstItem.children) {
          const firstLink = firstItem.children[0];
          if (typeof firstLink === 'object') {
            // This was the bug: nested link structure
            expect(firstLink.attrs?.href).toBe('#Аналогии');
            expect(firstLink.children).toHaveLength(1);
            expect(firstLink.children[0]).toBe('Аналогии');
            expect(typeof firstLink.children[0]).toBe('string');
          }
        }
        
        // Validate second item: Домашнее задание
        const secondItem = listItems[1];
        if (typeof secondItem === 'object' && secondItem.children) {
          const secondLink = secondItem.children[0];
          if (typeof secondLink === 'object') {
            expect(secondLink.attrs?.href).toBe('#Домашнее-задание');
            expect(secondLink.children).toHaveLength(1);
            expect(secondLink.children[0]).toBe('Домашнее задание');
            expect(typeof secondLink.children[0]).toBe('string');
          }
        }
      }
    }
	});
});

test("TOC anchors strip inline formatting inside headings", () => {
	const markdown = `### 6. **Bona Forte для роз и хризантем** — С витаминами`;
	const anchors = AnchorGenerator.extractAnchors(markdown);
	expect(anchors.has("6.-Bona-Forte-для-роз-и-хризантем-—-С-витаминами")).toBe(true);
});
