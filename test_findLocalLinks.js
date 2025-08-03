const { LinkResolver } = require('./dist/cli.js');

// Test content with local links
const testContent = `# Test Document

This is a [local link](./test.md) and another [relative link](../docs/guide.md).
This is an [external link](https://example.com) and [email](mailto:test@example.com).

Here's another [local file](./images/image.png).
`;

const testBasePath = '/Users/test/project';

console.log('Testing LinkResolver.findLocalLinks...');

try {
  const localLinks = LinkResolver.findLocalLinks(testContent, testBasePath);
  console.log('✅ Success! Found', localLinks.length, 'local links');
  console.log('Local links:', JSON.stringify(localLinks, null, 2));
} catch (error) {
  console.error('❌ Error:', error.message);
}
