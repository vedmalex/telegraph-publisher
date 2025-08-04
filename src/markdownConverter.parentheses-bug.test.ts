import { describe, it, expect } from 'bun:test';
import { convertMarkdownToTelegraphNodes } from './markdownConverter';

/**
 * Test for Telegraph JSON generation bug with parentheses in link anchors
 */
describe('MarkdownConverter - Telegraph JSON Parentheses Bug', () => {
  it('should reproduce the issue with orphaned parentheses in Telegraph JSON', () => {
    // Test case based on user's provided content that causes the issue
    const testMarkdown = `## [Аналогии](./аналогии.md)

- [Анализ аналогий из Шримад-Бхагаватам 1.1](./аналогии.md#Анализ-аналогий-из-Шримад-Бхагаватам-1.1)
- [1. Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)](./аналогии.md#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4))
- [2. Аналогия «Кино материального мира» (из комментария к ШБ 1.1.17)](./аналогии.md#2.-Аналогия-«Кино-материального-мира»-(из-комментария-к-ШБ-1.1.17))`;

    console.log('=== TESTING TELEGRAPH JSON GENERATION ===');
    const nodes = convertMarkdownToTelegraphNodes(testMarkdown, { generateToc: false });

    console.log('Generated Telegraph Nodes:');
    console.log(JSON.stringify(nodes, null, 2));

    // Helper function to find orphaned parentheses
    function findOrphanedParentheses(nodes: any[]): string[] {
      const orphans: string[] = [];
      
      function traverse(node: any) {
        if (typeof node === 'string' && node.trim() === ')') {
          orphans.push(')');
        } else if (Array.isArray(node)) {
          node.forEach(traverse);
        } else if (typeof node === 'object' && node !== null) {
          if (node.children) {
            traverse(node.children);
          }
        }
      }
      
      traverse(nodes);
      return orphans;
    }

    // Helper function to extract href values
    function extractHrefs(nodes: any[]): string[] {
      const hrefs: string[] = [];
      
      function traverse(node: any) {
        if (Array.isArray(node)) {
          node.forEach(traverse);
        } else if (typeof node === 'object' && node !== null) {
          if (node.tag === 'a' && node.attrs && node.attrs.href) {
            hrefs.push(node.attrs.href);
          }
          if (node.children) {
            traverse(node.children);
          }
        }
      }
      
      traverse(nodes);
      return hrefs;
    }

    const orphans = findOrphanedParentheses(nodes);
    const hrefs = extractHrefs(nodes);

    console.log('\n=== ANALYSIS ===');
    console.log(`Found ${orphans.length} orphaned parentheses:`, orphans);
    
    console.log('\nExtracted href values:');
    hrefs.forEach((href, i) => {
      const shouldEndWithParen = href.includes('-(из-комментария-к-ШБ-1.1.4') || href.includes('-(из-комментария-к-ШБ-1.1.17');
      const actuallyEndsWithParen = href.endsWith(')');
      const isCorrect = !shouldEndWithParen || actuallyEndsWithParen;
      console.log(`${i + 1}. ${href} ${isCorrect ? '✅' : '❌ INCOMPLETE'}`);
    });

    // Test assertions for FIXED behavior
    // After fix, there should be NO orphaned parentheses
    expect(orphans.length).toBe(0); // Fixed: no orphaned parentheses

    // After fix, hrefs should be COMPLETE 
    const problematicHrefs = hrefs.filter(href => 
      (href.includes('-(из-комментария-к-ШБ-1.1.4') && !href.endsWith(')')) ||
      (href.includes('-(из-комментария-к-ШБ-1.1.17') && !href.endsWith(')'))
    );
    expect(problematicHrefs.length).toBe(0); // Fixed: all hrefs should be complete

    // Verify specific problematic hrefs are now complete
    const expectedCompleteHrefs = [
      './аналогии.md#1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4)',
      './аналогии.md#2.-Аналогия-«Кино-материального-мира»-(из-комментария-к-ШБ-1.1.17)'
    ];
    
    console.log('\nActual hrefs found:');
    hrefs.forEach((href, i) => console.log(`${i + 1}. "${href}"`));
    
    // Check that hrefs with parentheses end correctly
    const hrefs1 = hrefs.filter(h => h.includes('1.-Аналогия-«Дерево-цивилизации»-(из-комментария-к-ШБ-1.1.4'));
    const hrefs2 = hrefs.filter(h => h.includes('2.-Аналогия-«Кино-материального-мира»-(из-комментария-к-ШБ-1.1.17'));
    
    expect(hrefs1.length).toBe(1);
    expect(hrefs2.length).toBe(1);
    expect(hrefs1[0]).toEndWith(')');
    expect(hrefs2[0]).toEndWith(')');

    console.log('\n=== FIX VALIDATED ===');
    console.log(`Orphaned parentheses found: ${orphans.length} (should be 0)`);
    console.log(`Incomplete hrefs found: ${problematicHrefs.length} (should be 0)`);
  });

  it('should handle simple links correctly (regression test)', () => {
    // Simple link in a paragraph context (more realistic)
    const simpleMarkdown = `Here is a [Simple link](./file.md) in text.`;
    const nodes = convertMarkdownToTelegraphNodes(simpleMarkdown, { generateToc: false });

    console.log('Simple link test nodes:', JSON.stringify(nodes, null, 2));

    // Extract href values
    function extractHrefs(nodes: any[]): string[] {
      const hrefs: string[] = [];
      
      function traverse(node: any) {
        if (Array.isArray(node)) {
          node.forEach(traverse);
        } else if (typeof node === 'object' && node !== null) {
          if (node.tag === 'a' && node.attrs && node.attrs.href) {
            hrefs.push(node.attrs.href);
          }
          if (node.children) {
            traverse(node.children);
          }
        }
      }
      
      traverse(nodes);
      return hrefs;
    }

    const hrefs = extractHrefs(nodes);
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]).toBe('./file.md');
  });
});