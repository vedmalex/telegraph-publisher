import { describe, expect, test, beforeAll } from "bun:test";
import { AnchorGenerator } from "./AnchorGenerator";
import { convertMarkdownToTelegraphNodes } from "../markdownConverter";
import { LinkVerifier } from "../links/LinkVerifier";
import { PathResolver } from "../utils/PathResolver";

describe('AnchorGenerator Integration Tests', () => {
  beforeAll(() => {
    // Enable unified anchors for integration tests
    process.env.USE_UNIFIED_ANCHORS = 'true';
  });

  describe('TOC ↔ LinkVerifier Consistency', () => {
    test('should generate identical anchors for TOC and LinkVerifier', () => {
      const content = `# Main Title

## Section One
Regular content here.

### Subsection
More content.

##### Advanced Configuration
H5 content with special handling.

###### API Reference Details  
H6 content with double prefix.

## [GitHub Repository](https://github.com/user/repo)
Link in heading content.

##### [Advanced Setup Guide](https://setup.example.com)
H5 with link in heading.`;

      // Extract anchors using AnchorGenerator directly
      const directAnchors = AnchorGenerator.extractAnchors(content);

      // Extract anchors using LinkVerifier (which should use AnchorGenerator)
      const linkVerifier = new LinkVerifier(PathResolver.getInstance());
      const linkVerifierAnchors = (linkVerifier as any).parseAnchorsFromContent(content);

      // Both should produce identical results
      expect(linkVerifierAnchors.size).toBe(directAnchors.size);
      
      for (const anchor of directAnchors) {
        expect(linkVerifierAnchors.has(anchor)).toBe(true);
      }

      // Verify specific anchor formats
      expect(directAnchors.has('Main-Title')).toBe(true);
      expect(directAnchors.has('Section-One')).toBe(true);
      expect(directAnchors.has('Subsection')).toBe(true);
      expect(directAnchors.has('>-Advanced-Configuration')).toBe(true);
      expect(directAnchors.has('>>-API-Reference-Details')).toBe(true);
      expect(directAnchors.has('GitHub-Repository')).toBe(true);
      expect(directAnchors.has('>-Advanced-Setup-Guide')).toBe(true);
    });

    test('should extract TOC anchors that match LinkVerifier anchors', () => {
      const content = `## Regular Section

##### H5 Section with Prefix

###### H6 Section with Double Prefix

### [Documentation Link](https://docs.example.com)

##### [H5 Link Section](https://h5.example.com)`;

      // Generate TOC using convertMarkdownToTelegraphNodes
      const telegraphNodes = convertMarkdownToTelegraphNodes(content);
      
      // Find the TOC aside element
      const tocAside = telegraphNodes.find(node => node.tag === 'aside');
      expect(tocAside).toBeDefined();
      
      if (!tocAside || !tocAside.children || !Array.isArray(tocAside.children)) {
        throw new Error('TOC structure is invalid');
      }

      // Extract anchors from TOC links
      const tocAnchors = new Set<string>();
      const ulElement = tocAside.children[0];
      if (ulElement && ulElement.tag === 'ul' && ulElement.children) {
        for (const liElement of ulElement.children) {
          if (liElement.tag === 'li' && liElement.children) {
            const aElement = liElement.children[0];
            if (aElement && aElement.tag === 'a' && aElement.attrs && aElement.attrs.href) {
              const href = aElement.attrs.href as string;
              if (href.startsWith('#')) {
                tocAnchors.add(href.substring(1)); // Remove # prefix
              }
            }
          }
        }
      }

      // Extract anchors using LinkVerifier
      const linkVerifier = new LinkVerifier(PathResolver.getInstance());
      const linkVerifierAnchors = (linkVerifier as any).parseAnchorsFromContent(content);

      // TOC anchors should match LinkVerifier anchors exactly
      expect(tocAnchors.size).toBe(linkVerifierAnchors.size);
      
      for (const anchor of tocAnchors) {
        expect(linkVerifierAnchors.has(anchor)).toBe(true);
      }

      // Verify specific H5/H6 anchors are correctly handled
      expect(tocAnchors.has('>-H5-Section-with-Prefix')).toBe(true);
      expect(tocAnchors.has('>>-H6-Section-with-Double-Prefix')).toBe(true);
      expect(tocAnchors.has('Documentation-Link')).toBe(true);
      expect(tocAnchors.has('>-H5-Link-Section')).toBe(true);
    });

    test('should handle complex edge cases consistently', () => {
      const content = `### Title with <brackets> and >arrows<

##### > Already Prefixed H5

###### >> Already Prefixed H6

## **Bold Title**

### \`Code Title\`

#### Title with    multiple     spaces

##### [Complex Link](https://example.com "With Title")

###### Тест заголовка с кириллицей`;

      // Extract using both methods
      const directAnchors = AnchorGenerator.extractAnchors(content);
      const linkVerifier = new LinkVerifier(PathResolver.getInstance());
      const linkVerifierAnchors = (linkVerifier as any).parseAnchorsFromContent(content);

      // Should be identical
      expect(linkVerifierAnchors.size).toBe(directAnchors.size);
      
      for (const anchor of directAnchors) {
        expect(linkVerifierAnchors.has(anchor)).toBe(true);
      }

      // Verify specific edge cases
      expect(directAnchors.has('Title-with-brackets>-and->arrows')).toBe(true); // < removed, > preserved
      expect(directAnchors.has('>->-Already-Prefixed-H5')).toBe(true); // > preserved in H5
      expect(directAnchors.has('>>->>-Already-Prefixed-H6')).toBe(true); // >> preserved in H6
      expect(directAnchors.has('**Bold-Title**')).toBe(true); // Markdown preserved
      expect(directAnchors.has('`Code-Title`')).toBe(true); // Code formatting preserved
      expect(directAnchors.has('Title-with----multiple-----spaces')).toBe(true); // Multiple spaces to hyphens
      expect(directAnchors.has('>-Complex-Link')).toBe(true); // H5 link text extraction
      expect(directAnchors.has('>>-Тест-заголовка-с-кириллицей')).toBe(true); // Unicode support
    });
  });

  describe('Backward Compatibility Verification', () => {
    test('should maintain compatibility with existing anchor behavior for H1-H4', () => {
      const content = `# Main Title

## Regular Section

### Subsection Content

#### Detailed Information`;

      const anchors = AnchorGenerator.extractAnchors(content);

      // These should work exactly as before (no prefixes for H1-H4)
      expect(anchors.has('Main-Title')).toBe(true);
      expect(anchors.has('Regular-Section')).toBe(true);
      expect(anchors.has('Subsection-Content')).toBe(true);
      expect(anchors.has('Detailed-Information')).toBe(true);

      // Should not have any prefixes
      expect(anchors.has('>-Main-Title')).toBe(false);
      expect(anchors.has('>>-Regular-Section')).toBe(false);
    });

    test('should handle empty and malformed headings gracefully', () => {
      const content = `## 

### Valid Heading

#### 

##### Another Valid`;

      const anchors = AnchorGenerator.extractAnchors(content);

      // Should only include valid headings
      expect(anchors.size).toBe(2);
      expect(anchors.has('Valid-Heading')).toBe(true);
      expect(anchors.has('>-Another-Valid')).toBe(true);
      
      // Should not include empty anchors
      expect(anchors.has('')).toBe(false);
    });
  });

  describe('Performance Validation', () => {
    test('should handle large documents efficiently', () => {
      // Generate a large document with many headings
      let content = '# Main Document\n\n';
      const expectedAnchors = new Set<string>();
      expectedAnchors.add('Main-Document');

      for (let i = 1; i <= 100; i++) {
        content += `## Section ${i}\n\nContent for section ${i}.\n\n`;
        expectedAnchors.add(`Section-${i}`);

        if (i % 10 === 0) {
          content += `##### Advanced Section ${i}\n\nH5 content.\n\n`;
          expectedAnchors.add(`>-Advanced-Section-${i}`);
        }

        if (i % 20 === 0) {
          content += `###### API Section ${i}\n\nH6 content.\n\n`;
          expectedAnchors.add(`>>-API-Section-${i}`);
        }
      }

      const startTime = Date.now();
      const anchors = AnchorGenerator.extractAnchors(content);
      const endTime = Date.now();

      // Should complete quickly (under 100ms for this size)
      expect(endTime - startTime).toBeLessThan(100);

      // Should extract all expected anchors
      expect(anchors.size).toBe(expectedAnchors.size);
      
      for (const expectedAnchor of expectedAnchors) {
        expect(anchors.has(expectedAnchor)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid content gracefully', () => {
      const invalidContent = '';
      const anchors = AnchorGenerator.extractAnchors(invalidContent);
      expect(anchors.size).toBe(0);
    });

    test('should handle content without headings', () => {
      const content = `This is just regular text.

Some more content here.

No headings at all.`;

      const anchors = AnchorGenerator.extractAnchors(content);
      expect(anchors.size).toBe(0);
    });

    test('should handle malformed markdown gracefully', () => {
      const content = `#Not a heading (no space)
## Valid Heading
###Also not valid (no space)
#### Another Valid`;

      const anchors = AnchorGenerator.extractAnchors(content);
      expect(anchors.size).toBe(2);
      expect(anchors.has('Valid-Heading')).toBe(true);
      expect(anchors.has('Another-Valid')).toBe(true);
    });
  });
});