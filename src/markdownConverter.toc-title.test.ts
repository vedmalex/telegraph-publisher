import { describe, expect, test } from "bun:test";
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";

describe('markdownConverter - TOC Title', () => {
  const testMarkdown = `# Main Title

## Section One
Content here.

### Subsection
More content.

##### H5 Section
H5 content.

## Section Two
Final content.`;

  test('should generate TOC without title by default', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: true });
    
    // Find the aside element
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeDefined();
    
    if (!asideElement || !asideElement.children) {
      throw new Error('Aside element structure is invalid');
    }
    
    // Check that first child is ul (no h3 title by default)
    const firstElement = asideElement.children[0];
    expect(firstElement.tag).toBe('ul');
    expect(firstElement.children).toBeDefined();
    expect(Array.isArray(firstElement.children)).toBe(true);
    expect(firstElement.children!.length).toBeGreaterThan(0);
  });

  test('should generate TOC with explicit default title "Содержание"', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: true, tocTitle: 'Содержание' });
    
    // Find the aside element
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeDefined();
    
    if (!asideElement || !asideElement.children) {
      throw new Error('Aside element structure is invalid');
    }
    
    // Check that first child is h3 with default title
    const titleElement = asideElement.children[0];
    expect(titleElement.tag).toBe('h3');
    expect(titleElement.children).toEqual(['Содержание']);
    
    // Check that second child is ul with links
    const listElement = asideElement.children[1];
    expect(listElement.tag).toBe('ul');
    expect(listElement.children).toBeDefined();
    expect(Array.isArray(listElement.children)).toBe(true);
    expect(listElement.children!.length).toBeGreaterThan(0);
  });

  test('should generate TOC with custom title', () => {
    const customTitle = 'Table of Contents';
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: customTitle 
    });
    
    // Find the aside element
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeDefined();
    
    if (!asideElement || !asideElement.children) {
      throw new Error('Aside element structure is invalid');
    }
    
    // Check that first child is h3 with custom title
    const titleElement = asideElement.children[0];
    expect(titleElement.tag).toBe('h3');
    expect(titleElement.children).toEqual([customTitle]);
  });

  test('should generate TOC with Russian custom title', () => {
    const customTitle = 'Оглавление статьи';
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: customTitle 
    });
    
    // Find the aside element
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeDefined();
    
    if (!asideElement || !asideElement.children) {
      throw new Error('Aside element structure is invalid');
    }
    
    // Check that first child is h3 with Russian title
    const titleElement = asideElement.children[0];
    expect(titleElement.tag).toBe('h3');
    expect(titleElement.children).toEqual([customTitle]);
  });

  test('should generate TOC without title when empty title provided', () => {
    const customTitle = '';
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: customTitle 
    });
    
    // Find the aside element
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeDefined();
    
    if (!asideElement || !asideElement.children) {
      throw new Error('Aside element structure is invalid');
    }
    
    // Check that first child is ul (no h3 title when empty)
    const firstElement = asideElement.children[0];
    expect(firstElement.tag).toBe('ul');
    expect(firstElement.children).toBeDefined();
    expect(Array.isArray(firstElement.children)).toBe(true);
    expect(firstElement.children!.length).toBeGreaterThan(0);
  });

  test('should not generate TOC when generateToc is false (tocTitle should be ignored)', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: false, 
      tocTitle: 'Should be ignored' 
    });
    
    // No aside element should be present
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeUndefined();
  });

  test('should not generate TOC for content with 1 heading', () => {
    const oneHeadingMarkdown = `# Only One Heading

Some content here without more headings.`;
    
    const nodes = convertMarkdownToTelegraphNodes(oneHeadingMarkdown, { 
      generateToc: true, 
      tocTitle: 'Custom Title' 
    });
    
    // No aside element should be present
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeUndefined();
  });

  test('should not generate TOC for content with 0 headings', () => {
    const noHeadingsMarkdown = `Just regular content here.

Another paragraph without any headings.

Some more text to make it longer.`;
    
    const nodes = convertMarkdownToTelegraphNodes(noHeadingsMarkdown, { 
      generateToc: true, 
      tocTitle: 'Custom Title' 
    });
    
    // No aside element should be present
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeUndefined();
    
    // Should only contain paragraph elements
    expect(nodes.every(node => node.tag === 'p')).toBe(true);
    expect(nodes.length).toBe(3); // Three paragraphs
  });

  test('should preserve TOC structure with title for both legacy and unified anchor generators', () => {
    // Test both code paths if unified anchors are enabled/disabled
    const originalEnv = process.env.USE_UNIFIED_ANCHORS;
    
    try {
      // Test legacy path
      process.env.USE_UNIFIED_ANCHORS = 'false';
      const legacyNodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
        generateToc: true, 
        tocTitle: 'Legacy TOC' 
      });
      
      // Test unified path
      process.env.USE_UNIFIED_ANCHORS = 'true';
      const unifiedNodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
        generateToc: true, 
        tocTitle: 'Unified TOC' 
      });
      
      // Both should have aside elements with titles
      const legacyAside = legacyNodes.find(node => node.tag === 'aside');
      const unifiedAside = unifiedNodes.find(node => node.tag === 'aside');
      
      expect(legacyAside).toBeDefined();
      expect(unifiedAside).toBeDefined();
      
      if (legacyAside && legacyAside.children && unifiedAside && unifiedAside.children) {
        // Both should have h3 title as first child
        expect(legacyAside.children[0].tag).toBe('h3');
        expect(legacyAside.children[0].children).toEqual(['Legacy TOC']);
        
        expect(unifiedAside.children[0].tag).toBe('h3');
        expect(unifiedAside.children[0].children).toEqual(['Unified TOC']);
        
        // Both should have ul as second child
        expect(legacyAside.children[1].tag).toBe('ul');
        expect(unifiedAside.children[1].tag).toBe('ul');
      } else {
        throw new Error('Aside element structure is invalid');
      }
    } finally {
      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.USE_UNIFIED_ANCHORS = originalEnv;
      } else {
        delete process.env.USE_UNIFIED_ANCHORS;
      }
    }
  });

  test('should handle special characters in TOC title', () => {
    const specialTitle = 'Содержание: "Глава №1" & другие разделы';
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: specialTitle 
    });
    
    // Find the aside element
    const asideElement = nodes.find(node => node.tag === 'aside');
    expect(asideElement).toBeDefined();
    
    if (!asideElement || !asideElement.children) {
      throw new Error('Aside element structure is invalid');
    }
    
    // Check that special characters are preserved
    const titleElement = asideElement.children[0];
    expect(titleElement.tag).toBe('h3');
    expect(titleElement.children).toEqual([specialTitle]);
  });
});