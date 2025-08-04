import { describe, expect, test } from "bun:test";
import { AnchorGenerator, type HeadingInfo } from "./AnchorGenerator";

describe('AnchorGenerator', () => {
  describe('extractHeadingInfo', () => {
    test('should extract basic heading info correctly', () => {
      const match = ['## Regular Heading', '##', 'Regular Heading'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(2);
      expect(result.originalText).toBe('Regular Heading');
      expect(result.displayText).toBe('Regular Heading');
      expect(result.textForAnchor).toBe('Regular Heading');
      expect(result.metadata.hasLink).toBe(false);
      expect(result.metadata.hasPrefix).toBe(false);
      expect(result.metadata.prefixType).toBe('none');
    });

    test('should handle H5 heading with prefix', () => {
      const match = ['##### Advanced Configuration', '#####', 'Advanced Configuration'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(5);
      expect(result.originalText).toBe('Advanced Configuration');
      expect(result.displayText).toBe('> Advanced Configuration');
      expect(result.textForAnchor).toBe('> Advanced Configuration');
      expect(result.metadata.hasLink).toBe(false);
      expect(result.metadata.hasPrefix).toBe(true);
      expect(result.metadata.prefixType).toBe('h5');
    });

    test('should handle H6 heading with double prefix', () => {
      const match = ['###### API Reference', '######', 'API Reference'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(6);
      expect(result.originalText).toBe('API Reference');
      expect(result.displayText).toBe('>> API Reference');
      expect(result.textForAnchor).toBe('>> API Reference');
      expect(result.metadata.hasLink).toBe(false);
      expect(result.metadata.hasPrefix).toBe(true);
      expect(result.metadata.prefixType).toBe('h6');
    });

    test('should handle levels > 6 with extended prefix', () => {
      const match = ['####### Deep Nested Section', '#######', 'Deep Nested Section'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(7);
      expect(result.originalText).toBe('Deep Nested Section');
      expect(result.displayText).toBe('>>> Deep Nested Section');
      expect(result.textForAnchor).toBe('>>> Deep Nested Section');
      expect(result.metadata.hasPrefix).toBe(true);
      expect(result.metadata.prefixType).toBe('extended');
    });

    test('should extract link text from heading', () => {
      const match = ['## [GitHub Repository](https://github.com/user/repo)', '##', '[GitHub Repository](https://github.com/user/repo)'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(2);
      expect(result.originalText).toBe('[GitHub Repository](https://github.com/user/repo)');
      expect(result.displayText).toBe('[GitHub Repository](https://github.com/user/repo)');
      expect(result.textForAnchor).toBe('GitHub Repository');
      expect(result.metadata.hasLink).toBe(true);
      expect(result.linkInfo).toEqual({
        text: 'GitHub Repository',
        url: 'https://github.com/user/repo'
      });
    });

    test('should handle link in H5 heading', () => {
      const match = ['##### [Advanced Setup](http://example.com)', '#####', '[Advanced Setup](http://example.com)'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(5);
      expect(result.originalText).toBe('[Advanced Setup](http://example.com)');
      expect(result.displayText).toBe('> [Advanced Setup](http://example.com)');
      expect(result.textForAnchor).toBe('> Advanced Setup');
      expect(result.metadata.hasLink).toBe(true);
      expect(result.metadata.hasPrefix).toBe(true);
      expect(result.metadata.prefixType).toBe('h5');
    });

    test('should handle link in H6 heading', () => {
      const match = ['###### [API Details](http://api.example.com)', '######', '[API Details](http://api.example.com)'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(6);
      expect(result.originalText).toBe('[API Details](http://api.example.com)');
      expect(result.displayText).toBe('>> [API Details](http://api.example.com)');
      expect(result.textForAnchor).toBe('>> API Details');
      expect(result.metadata.hasLink).toBe(true);
      expect(result.metadata.hasPrefix).toBe(true);
      expect(result.metadata.prefixType).toBe('h6');
    });

    test('should handle empty heading gracefully', () => {
      const match = ['## ', '##', ''];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(2);
      expect(result.originalText).toBe('');
      expect(result.displayText).toBe('');
      expect(result.textForAnchor).toBe('');
      expect(result.metadata.hasLink).toBe(false);
    });

    test('should handle heading with special characters', () => {
      const match = ['### Тест заголовка с символами!@#', '###', 'Тест заголовка с символами!@#'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(3);
      expect(result.originalText).toBe('Тест заголовка с символами!@#');
      expect(result.displayText).toBe('Тест заголовка с символами!@#');
      expect(result.textForAnchor).toBe('Тест заголовка с символами!@#');
    });
  });

  describe('generateAnchor', () => {
    test('should generate basic anchor correctly', () => {
      const headingInfo: HeadingInfo = {
        level: 2,
        originalText: 'Regular Section',
        displayText: 'Regular Section',
        textForAnchor: 'Regular Section',
        metadata: { hasLink: false, hasPrefix: false, prefixType: 'none' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('Regular-Section');
    });

    test('should generate H5 anchor with prefix', () => {
      const headingInfo: HeadingInfo = {
        level: 5,
        originalText: 'Advanced Config',
        displayText: '> Advanced Config',
        textForAnchor: '> Advanced Config',
        metadata: { hasLink: false, hasPrefix: true, prefixType: 'h5' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('>-Advanced-Config');
    });

    test('should generate H6 anchor with double prefix', () => {
      const headingInfo: HeadingInfo = {
        level: 6,
        originalText: 'API Details',
        displayText: '>> API Details',
        textForAnchor: '>> API Details',
        metadata: { hasLink: false, hasPrefix: true, prefixType: 'h6' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('>>-API-Details');
    });

    test('should handle link text extraction in anchor', () => {
      const headingInfo: HeadingInfo = {
        level: 2,
        originalText: '[GitHub Repo](https://github.com)',
        displayText: '[GitHub Repo](https://github.com)',
        textForAnchor: 'GitHub Repo',
        linkInfo: { text: 'GitHub Repo', url: 'https://github.com' },
        metadata: { hasLink: true, hasPrefix: false, prefixType: 'none' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('GitHub-Repo');
    });

    test('should remove < characters but preserve >', () => {
      const headingInfo: HeadingInfo = {
        level: 3,
        originalText: 'Title <with> angles',
        displayText: 'Title <with> angles',
        textForAnchor: 'Title <with> angles',
        metadata: { hasLink: false, hasPrefix: false, prefixType: 'none' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('Title-with>-angles');
    });

    test('should handle Unicode characters', () => {
      const headingInfo: HeadingInfo = {
        level: 2,
        originalText: 'Тест заголовка',
        displayText: 'Тест заголовка',
        textForAnchor: 'Тест заголовка',
        metadata: { hasLink: false, hasPrefix: false, prefixType: 'none' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('Тест-заголовка');
    });

    test('should handle empty text gracefully', () => {
      const headingInfo: HeadingInfo = {
        level: 2,
        originalText: '',
        displayText: '',
        textForAnchor: '',
        metadata: { hasLink: false, hasPrefix: false, prefixType: 'none' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('');
    });

    test('should handle multiple spaces', () => {
      const headingInfo: HeadingInfo = {
        level: 2,
        originalText: 'Multiple   spaces   here',
        displayText: 'Multiple   spaces   here',
        textForAnchor: 'Multiple   spaces   here',
        metadata: { hasLink: false, hasPrefix: false, prefixType: 'none' }
      };
      
      const anchor = AnchorGenerator.generateAnchor(headingInfo);
      expect(anchor).toBe('Multiple---spaces---here');
    });
  });

  describe('parseHeadingsFromContent', () => {
    test('should parse multiple headings correctly', () => {
      const content = `# Main Title

## Section One
Some content here.

### Subsection
More content.

##### Advanced Config
H5 content.

###### API Reference  
H6 content.`;

      const headings = AnchorGenerator.parseHeadingsFromContent(content);
      
      expect(headings).toHaveLength(5);
      
      expect(headings[0].level).toBe(1);
      expect(headings[0].originalText).toBe('Main Title');
      expect(headings[0].textForAnchor).toBe('Main Title');
      
      expect(headings[1].level).toBe(2);
      expect(headings[1].originalText).toBe('Section One');
      
      expect(headings[2].level).toBe(3);
      expect(headings[2].originalText).toBe('Subsection');
      
      expect(headings[3].level).toBe(5);
      expect(headings[3].originalText).toBe('Advanced Config');
      expect(headings[3].textForAnchor).toBe('> Advanced Config');
      expect(headings[3].metadata.hasPrefix).toBe(true);
      
      expect(headings[4].level).toBe(6);
      expect(headings[4].originalText).toBe('API Reference');
      expect(headings[4].textForAnchor).toBe('>> API Reference');
      expect(headings[4].metadata.hasPrefix).toBe(true);
    });

    test('should handle content with links in headings', () => {
      const content = `## [Documentation](https://docs.example.com)

### [API Guide](https://api.example.com)

##### [Advanced Setup](https://setup.example.com)`;

      const headings = AnchorGenerator.parseHeadingsFromContent(content);
      
      expect(headings).toHaveLength(3);
      
      expect(headings[0].level).toBe(2);
      expect(headings[0].metadata.hasLink).toBe(true);
      expect(headings[0].textForAnchor).toBe('Documentation');
      expect(headings[0].linkInfo?.url).toBe('https://docs.example.com');
      
      expect(headings[1].level).toBe(3);
      expect(headings[1].metadata.hasLink).toBe(true);
      expect(headings[1].textForAnchor).toBe('API Guide');
      
      expect(headings[2].level).toBe(5);
      expect(headings[2].metadata.hasLink).toBe(true);
      expect(headings[2].textForAnchor).toBe('> Advanced Setup');
      expect(headings[2].metadata.hasPrefix).toBe(true);
    });

    test('should handle empty content', () => {
      const headings = AnchorGenerator.parseHeadingsFromContent('');
      expect(headings).toHaveLength(0);
    });

    test('should handle content without headings', () => {
      const content = `This is just regular text.

Some more content here.

No headings at all.`;

      const headings = AnchorGenerator.parseHeadingsFromContent(content);
      expect(headings).toHaveLength(0);
    });

    test('should ignore malformed headings', () => {
      const content = `# Valid Heading

#Not a heading (no space)
## 

### Another Valid

####Also not valid`;

      const headings = AnchorGenerator.parseHeadingsFromContent(content);
      expect(headings).toHaveLength(3);
      expect(headings[0].originalText).toBe('Valid Heading');
      expect(headings[1].originalText).toBe('');
      expect(headings[2].originalText).toBe('Another Valid');
    });
  });

  describe('extractAnchors', () => {
    test('should extract anchors correctly', () => {
      const content = `# Main Title

## Regular Section

### Subsection

##### H5 Section

###### H6 Section

## [Link Section](https://example.com)`;

      const anchors = AnchorGenerator.extractAnchors(content);
      
      expect(anchors.size).toBe(6);
      expect(anchors.has('Main-Title')).toBe(true);
      expect(anchors.has('Regular-Section')).toBe(true);
      expect(anchors.has('Subsection')).toBe(true);
      expect(anchors.has('>-H5-Section')).toBe(true);
      expect(anchors.has('>>-H6-Section')).toBe(true);
      expect(anchors.has('Link-Section')).toBe(true);
    });

    test('should filter out empty anchors', () => {
      const content = `# Valid Title

## 

### Another Valid`;

      const anchors = AnchorGenerator.extractAnchors(content);
      
      expect(anchors.size).toBe(2);
      expect(anchors.has('Valid-Title')).toBe(true);
      expect(anchors.has('Another-Valid')).toBe(true);
      expect(anchors.has('')).toBe(false);
    });

    test('should handle duplicate anchors', () => {
      const content = `## Section One

### Section One

#### Section One`;

      const anchors = AnchorGenerator.extractAnchors(content);
      
      // Set automatically deduplicates
      expect(anchors.size).toBe(1);
      expect(anchors.has('Section-One')).toBe(true);
    });
  });

  describe('validateAnchorConsistency', () => {
    test('should detect duplicate anchors', () => {
      const content = `## Duplicate Section

### Duplicate Section

#### Duplicate Section`;

      const result = AnchorGenerator.validateAnchorConsistency(content);
      
      expect(result.isConsistent).toBe(false);
      expect(result.inconsistencies.length).toBe(3); // All three duplicates reported
      expect(result.inconsistencies[0].issue).toContain('Duplicate anchor (3 occurrences)');
    });

    test('should report consistent content', () => {
      const content = `## Section One

### Section Two

#### Section Three`;

      const result = AnchorGenerator.validateAnchorConsistency(content);
      
      expect(result.isConsistent).toBe(true);
      expect(result.inconsistencies.length).toBe(0);
    });

    test('should handle empty content', () => {
      const result = AnchorGenerator.validateAnchorConsistency('');
      
      expect(result.isConsistent).toBe(true);
      expect(result.inconsistencies.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle malformed regex match', () => {
      const match = ['##', '##', undefined] as any;
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(2);
      expect(result.originalText).toBe('');
      expect(result.textForAnchor).toBe('');
    });

    test('should handle missing regex groups', () => {
      const match = ['##'] as any;
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.level).toBe(0);
      expect(result.originalText).toBe('');
    });

    test('should handle link with title attribute', () => {
      const match = ['## [Link](http://example.com "Title")', '##', '[Link](http://example.com "Title")'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.metadata.hasLink).toBe(true);
      expect(result.linkInfo?.text).toBe('Link');
      expect(result.linkInfo?.url).toBe('http://example.com');
    });

    test('should handle reference link format', () => {
      const match = ['## [Link Text][ref]', '##', '[Link Text][ref]'];
      const result = AnchorGenerator.extractHeadingInfo(match);
      
      expect(result.metadata.hasLink).toBe(true);
      expect(result.linkInfo?.text).toBe('Link Text');
      expect(result.linkInfo?.url).toBe('ref');
    });

    test('should handle options with extractLinkText disabled', () => {
      const match = ['## [Link](http://example.com)', '##', '[Link](http://example.com)'];
      const result = AnchorGenerator.extractHeadingInfo(match, { extractLinkText: false });
      
      expect(result.metadata.hasLink).toBe(false);
      expect(result.textForAnchor).toBe('[Link](http://example.com)');
      expect(result.linkInfo).toBeUndefined();
    });
  });
});