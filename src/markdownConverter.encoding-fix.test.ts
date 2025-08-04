import { describe, it, expect } from 'bun:test';
import { convertMarkdownToTelegraphNodes } from './markdownConverter';

/**
 * Test suite for H5/H6 encoding fix
 * Validates that ASCII > symbols are used instead of Unicode » symbols
 */
describe('MarkdownConverter - H5/H6 Encoding Fix', () => {
  
  it('should use ASCII > symbols instead of Unicode » for H5/H6 headings', () => {
    const markdown = `##### H5 Heading
###### H6 Heading`;

    const nodes = convertMarkdownToTelegraphNodes(markdown, { generateToc: true });
    
    // Find ToC
    const tocAside = nodes.find(node => typeof node === 'object' && node.tag === 'aside');
    expect(tocAside).toBeDefined();
    
    if (tocAside && typeof tocAside === 'object' && tocAside.children) {
      const ul = tocAside.children[0];
      if (typeof ul === 'object' && ul.tag === 'ul' && ul.children) {
        const listItems = ul.children;
        
        // H5 ToC item
        const h5Item = listItems[0];
        if (typeof h5Item === 'object' && h5Item.children) {
          const h5Link = h5Item.children[0];
          if (typeof h5Link === 'object' && h5Link.children) {
            const h5Text = h5Link.children[0];
            expect(h5Text).toBe('> H5 Heading'); // ASCII > not Unicode »
            
            // Check character codes
            if (typeof h5Text === 'string') {
              const firstChar = h5Text.charCodeAt(0);
              expect(firstChar).toBe(62); // ASCII > = 62, not Unicode » = 187
            }
          }
        }
        
        // H6 ToC item  
        const h6Item = listItems[1];
        if (typeof h6Item === 'object' && h6Item.children) {
          const h6Link = h6Item.children[0];
          if (typeof h6Link === 'object' && h6Link.children) {
            const h6Text = h6Link.children[0];
            expect(h6Text).toBe('>> H6 Heading'); // ASCII >> not Unicode »»
            
            // Check character codes
            if (typeof h6Text === 'string') {
              const firstChar = h6Text.charCodeAt(0);
              const secondChar = h6Text.charCodeAt(1);
              expect(firstChar).toBe(62); // ASCII >
              expect(secondChar).toBe(62); // ASCII >
            }
          }
        }
      }
    }
    
    // Find H5 and H6 heading elements
    const h5Element = nodes.find(node => 
      typeof node === 'object' && 
      node.tag === 'h4' && 
      Array.isArray(node.children) && 
      typeof node.children[0] === 'string' && 
      node.children[0].includes('H5')
    );
    
    const h6Element = nodes.find(node => 
      typeof node === 'object' && 
      node.tag === 'h4' && 
      Array.isArray(node.children) && 
      typeof node.children[0] === 'string' && 
      node.children[0].includes('H6')
    );
    
    // Validate heading elements use ASCII > symbols
    if (h5Element && typeof h5Element === 'object' && h5Element.children) {
      const h5Text = h5Element.children[0];
      expect(h5Text).toBe('> H5 Heading');
      if (typeof h5Text === 'string') {
        expect(h5Text.charCodeAt(0)).toBe(62); // ASCII >
      }
    }
    
    if (h6Element && typeof h6Element === 'object' && h6Element.children) {
      const h6Text = h6Element.children[0];
      expect(h6Text).toBe('>> H6 Heading');
      if (typeof h6Text === 'string') {
        expect(h6Text.charCodeAt(0)).toBe(62); // ASCII >
        expect(h6Text.charCodeAt(1)).toBe(62); // ASCII >
      }
    }
  });

  it('should prevent UTF-8 encoding issues with ASCII symbols', () => {
    const markdown = `##### Test Heading`;
    const nodes = convertMarkdownToTelegraphNodes(markdown, { generateToc: false });
    
    const h5Element = nodes.find(node => 
      typeof node === 'object' && 
      node.tag === 'h4' && 
      Array.isArray(node.children) && 
      typeof node.children[0] === 'string'
    );
    
    if (h5Element && typeof h5Element === 'object' && h5Element.children) {
      const text = h5Element.children[0];
      if (typeof text === 'string') {
        // Should NOT contain Unicode » (187) that causes Â» display
        expect(text).not.toContain(String.fromCharCode(187));
        
        // Should contain ASCII > (62) that displays correctly
        expect(text.charCodeAt(0)).toBe(62);
        
        // Verify no double-encoding artifacts
        expect(text).not.toContain('Â');
        expect(text).not.toContain('Â»');
      }
    }
  });

  it('should handle multiple H5/H6 headings with ASCII symbols', () => {
    const markdown = `##### First H5
###### First H6  
##### Second H5
###### Second H6`;

    const nodes = convertMarkdownToTelegraphNodes(markdown, { generateToc: true });
    
    // Count H4 elements (converted H5/H6)
    const h4Elements = nodes.filter(node => 
      typeof node === 'object' && node.tag === 'h4'
    );
    
    expect(h4Elements).toHaveLength(4);
    
    // Verify all use ASCII > symbols
    h4Elements.forEach((element, index) => {
      if (typeof element === 'object' && element.children) {
        const text = element.children[0];
        if (typeof text === 'string') {
          if (index % 2 === 0) {
            // H5 elements (even indices)
            expect(text.charCodeAt(0)).toBe(62); // >
            expect(text.charCodeAt(1)).toBe(32); // space
          } else {
            // H6 elements (odd indices)  
            expect(text.charCodeAt(0)).toBe(62); // >
            expect(text.charCodeAt(1)).toBe(62); // >
            expect(text.charCodeAt(2)).toBe(32); // space
          }
          
          // No Unicode » symbols anywhere
          expect(text).not.toContain(String.fromCharCode(187));
        }
      }
    });
  });
});