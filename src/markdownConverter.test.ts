import { test, expect } from "bun:test";
import { convertMarkdownToHtml } from "./markdownConverter";

test("should convert basic markdown to html", () => {
  const markdown = "# Hello, World!";
  const expectedHtml = "<h1>Hello, World!</h1>";
  expect(convertMarkdownToHtml(markdown)).toBe(expectedHtml);
});

test("should convert paragraph to html", () => {
  const markdown = "This is a paragraph.";
  const expectedHtml = "<p>This is a paragraph.</p>";
  expect(convertMarkdownToHtml(markdown)).toBe(expectedHtml);
});

test("should convert links to html", () => {
  const markdown = "[Google](https://google.com)";
  const expectedHtml = '<p><a href="https://google.com">Google</a></p>';
  expect(convertMarkdownToHtml(markdown)).toBe(expectedHtml);
});

test("should convert bold text to html", () => {
  const markdown = "**bold text**";
  const expectedHtml = "<p><strong>bold text</strong></p>";
  expect(convertMarkdownToHtml(markdown)).toBe(expectedHtml);
});