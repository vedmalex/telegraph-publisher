import { test, expect } from "bun:test";
import { TelegraphPublisher } from "./telegraphPublisher";
import type { TelegraphNode } from './telegraphPublisher';

test("should create a Telegraph account", async () => {
  const publisher = new TelegraphPublisher();
  const account = await publisher.createAccount("Test Author", "Test Author Name");

  expect(account).toBeDefined();
  expect(account.short_name).toBe("Test Author");
  expect(account.author_name).toBe("Test Author Name");
  expect(account.access_token).toBeDefined();
});

test("should publish HTML content to Telegraph", async () => {
  const publisher = new TelegraphPublisher();
  await publisher.createAccount("Test Author", "Test Author Name");

  const htmlContent = "<h1>Test Title</h1><p>Test content</p>";
  const result = await publisher.publishHtml("Test Article", htmlContent);

  expect(result).toBeDefined();
  expect(result.title).toBe("Test Article");
  expect(result.url).toBeDefined();
  expect(result.path).toBeDefined();
});

test("should publish markdown content to Telegraph", async () => {
  const publisher = new TelegraphPublisher();
  await publisher.createAccount("Test Author", "Test Author Name");

  const markdownContent = "# Test Title\n\nTest content with **bold** text.";
  const result = await publisher.publishMarkdown("Test Markdown Article", markdownContent);

  expect(result).toBeDefined();
  expect(result.title).toBe("Test Markdown Article");
  expect(result.url).toBeDefined();
  expect(result.path).toBeDefined();
});

test('should throw an error if content size exceeds 64KB', () => {
  const publisher = new TelegraphPublisher();
  // Create a large array of nodes that will exceed 64KB when stringified
  const largeContentNodes: TelegraphNode[] = [];
  const singleNode = { tag: 'p', children: ['a'.repeat(1000)] }; // ~1KB per node
  for (let i = 0; i < 70; i++) { // 70 nodes should be > 64KB
    largeContentNodes.push(singleNode);
  }

  expect(() => publisher.checkContentSize(largeContentNodes)).toThrow(
    /Content size \(\d+\.\d{2} KB\) exceeds the Telegra.ph limit of 64 KB\. Please reduce the content size\./
  );
});

test('should not throw an error if content size is within 64KB', () => {
  const publisher = new TelegraphPublisher();
  // Create a small array of nodes that will be within 64KB when stringified
  const smallContentNodes: TelegraphNode[] = [];
  const singleNode = { tag: 'p', children: ['a'.repeat(100)] }; // ~0.1KB per node
  for (let i = 0; i < 50; i++) { // 50 nodes should be < 64KB
    smallContentNodes.push(singleNode);
  }

  expect(() => publisher.checkContentSize(smallContentNodes)).not.toThrow();
});