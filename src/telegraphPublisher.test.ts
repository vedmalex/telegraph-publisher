import { test, expect } from "bun:test";
import { TelegraphPublisher } from "./telegraphPublisher";

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