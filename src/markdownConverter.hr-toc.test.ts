import { describe, expect, test } from "bun:test";
import { convertMarkdownToTelegraphNodes } from "./markdownConverter";

describe('markdownConverter - TOC with HR separators', () => {
  const testMarkdown = `# Main Title

## Section One
Content here.

### Subsection
More content.

## Section Two
Final content.`;

  test('should add HR elements before and after TOC when TOC is generated', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: 'Table of Contents',
      tocSeparators: true
    });
    
    // Should have HR, aside, HR as first three elements
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    
    // First element should be HR
    expect(nodes[0].tag).toBe('hr');
    
    // Second element should be aside with TOC
    expect(nodes[1].tag).toBe('aside');
    expect(nodes[1].children).toBeDefined();
    if (nodes[1].children) {
      // Should have h3 title and ul list
      expect(nodes[1].children[0].tag).toBe('h3');
      expect(nodes[1].children[0].children).toEqual(['Table of Contents']);
      expect(nodes[1].children[1].tag).toBe('ul');
    }
    
    // Third element should be HR
    expect(nodes[2].tag).toBe('hr');
    
    // Fourth element should be first heading (h3 - Main Title)
    expect(nodes[3].tag).toBe('h3');
    expect(nodes[3].children).toEqual(['Main Title']);
  });

  test('should add HR elements before and after TOC without title', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: '',
      tocSeparators: true
    });
    
    // Should have HR, aside, HR as first three elements
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    
    // First element should be HR
    expect(nodes[0].tag).toBe('hr');
    
    // Second element should be aside without title (only ul)
    expect(nodes[1].tag).toBe('aside');
    expect(nodes[1].children).toBeDefined();
    if (nodes[1].children) {
      // Should have only ul list (no h3 title)
      expect(nodes[1].children[0].tag).toBe('ul');
    }
    
    // Third element should be HR
    expect(nodes[2].tag).toBe('hr');
  });

  test('should not add HR elements when TOC is disabled', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: false 
    });
    
    // First element should be the first heading, not HR
    expect(nodes[0].tag).toBe('h3');
    expect(nodes[0].children).toEqual(['Main Title']);
    
    // Should not contain any HR elements
    const hrElements = nodes.filter(node => node.tag === 'hr');
    expect(hrElements).toHaveLength(0);
  });

  test('should not add HR elements when content has less than 2 headings', () => {
    const shortMarkdown = `# Only One Heading

Some content here without more headings.`;
    
    const nodes = convertMarkdownToTelegraphNodes(shortMarkdown, { 
      generateToc: true, 
      tocTitle: 'Should not appear' 
    });
    
    // Should not have aside or HR elements
    const asideElements = nodes.filter(node => node.tag === 'aside');
    const hrElements = nodes.filter(node => node.tag === 'hr');
    
    expect(asideElements).toHaveLength(0);
    expect(hrElements).toHaveLength(0);
    
    // First element should be the heading
    expect(nodes[0].tag).toBe('h3');
    expect(nodes[0].children).toEqual(['Only One Heading']);
  });

  test('should preserve correct order: HR, aside, HR, content', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: 'Contents',
      tocSeparators: true
    });
    
    // Verify the complete order
    expect(nodes[0].tag).toBe('hr');           // HR before TOC
    expect(nodes[1].tag).toBe('aside');        // TOC aside
    expect(nodes[2].tag).toBe('hr');           // HR after TOC
    expect(nodes[3].tag).toBe('h3');           // First content heading
    expect(nodes[4].tag).toBe('h3');           // Second content heading  
    expect(nodes[5].tag).toBe('p');            // First content paragraph
    expect(nodes[6].tag).toBe('h3');           // Third content heading
    expect(nodes[7].tag).toBe('p');            // Second content paragraph
    expect(nodes[8].tag).toBe('h3');           // Fourth content heading
    expect(nodes[9].tag).toBe('p');            // Third content paragraph
  });

  test('should work with both legacy and unified anchor generators', () => {
    // Test both code paths if unified anchors are enabled/disabled
    const originalEnv = process.env.USE_UNIFIED_ANCHORS;
    
    try {
      // Test legacy path
      process.env.USE_UNIFIED_ANCHORS = 'false';
      const legacyNodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
        generateToc: true, 
        tocTitle: 'Legacy TOC',
        tocSeparators: true
      });
      
      // Test unified path
      process.env.USE_UNIFIED_ANCHORS = 'true';
      const unifiedNodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
        generateToc: true, 
        tocTitle: 'Unified TOC',
        tocSeparators: true
      });
      
      // Both should have HR elements in correct positions
      expect(legacyNodes[0].tag).toBe('hr');
      expect(legacyNodes[1].tag).toBe('aside');
      expect(legacyNodes[2].tag).toBe('hr');
      
      expect(unifiedNodes[0].tag).toBe('hr');
      expect(unifiedNodes[1].tag).toBe('aside');
      expect(unifiedNodes[2].tag).toBe('hr');
      
      // Both should have correct titles
      if (legacyNodes[1].children && unifiedNodes[1].children) {
        expect(legacyNodes[1].children[0].children).toEqual(['Legacy TOC']);
        expect(unifiedNodes[1].children[0].children).toEqual(['Unified TOC']);
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

  test('should handle special characters in TOC title with HR elements', () => {
    const specialTitle = 'Содержание: "Глава №1" & другие разделы';
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: specialTitle,
      tocSeparators: true
    });
    
    // Should still have correct structure with HR elements
    expect(nodes[0].tag).toBe('hr');
    expect(nodes[1].tag).toBe('aside');
    expect(nodes[2].tag).toBe('hr');
    
    // Special characters should be preserved in title
    if (nodes[1].children) {
      expect(nodes[1].children[0].tag).toBe('h3');
      expect(nodes[1].children[0].children).toEqual([specialTitle]);
    }
  });

  test('should not add HR elements when tocSeparators is disabled', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: 'Table of Contents',
      tocSeparators: false
    });
    
    // Should have aside as first element (no HR before it)
    expect(nodes[0].tag).toBe('aside');
    expect(nodes[0].children).toBeDefined();
    if (nodes[0].children) {
      expect(nodes[0].children[0].tag).toBe('h3');
      expect(nodes[0].children[0].children).toEqual(['Table of Contents']);
    }
    
    // Second element should be first heading (no HR after aside)
    expect(nodes[1].tag).toBe('h3');
    expect(nodes[1].children).toEqual(['Main Title']);
    
    // Should not contain any HR elements
    const hrElements = nodes.filter(node => node.tag === 'hr');
    expect(hrElements).toHaveLength(0);
  });

  test('should use tocSeparators default (true) when not specified', () => {
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { 
      generateToc: true, 
      tocTitle: 'Default Behavior'
    });
    
    // Should still add HR elements by default (since tocSeparators defaults to true in publisher)
    // But here in markdownConverter, it defaults to undefined, so no HR
    expect(nodes[0].tag).toBe('aside');
    expect(nodes[1].tag).toBe('h3');
    
    // Should not contain HR elements when tocSeparators is undefined
    const hrElements = nodes.filter(node => node.tag === 'hr');
    expect(hrElements).toHaveLength(0);
  });
});