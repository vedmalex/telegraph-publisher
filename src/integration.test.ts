import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { validateContentStructure, convertMarkdownToTelegraphNodes } from "./markdownConverter";
import { cleanMarkdownString } from "./clean_mr";

test("integration test: validate, clean, and convert real shloka file", async () => {
  // Read the real file
  const filePath = "шлока1.1.1.md";
  const content = readFileSync(filePath, "utf-8");

  // Step 1: Validate structure
  const isValid = validateContentStructure(content);
  expect(isValid).toBe(true);

  // Step 2: Clean markdown
  const cleanedContent = cleanMarkdownString(content);
  expect(cleanedContent).toBeDefined();
  expect(cleanedContent.length).toBeGreaterThan(0);

  // Step 3: Convert to Telegraph nodes
  const telegraphNodes = convertMarkdownToTelegraphNodes(cleanedContent);
  expect(telegraphNodes).toBeDefined();
  expect(telegraphNodes.length).toBeGreaterThan(0);

  // Check that we have the expected structure
  const hasHeadings = telegraphNodes.some(node => node.tag && node.tag.startsWith('h'));
  const hasBlockquotes = telegraphNodes.some(node => node.tag === 'blockquote');
  const hasStrongElements = telegraphNodes.some(node =>
    node.children && node.children.some(child =>
      typeof child === 'object' && child.tag === 'strong'
    )
  );

  expect(hasHeadings).toBe(true);
  expect(hasBlockquotes).toBe(true);
  expect(hasStrongElements).toBe(true);

  console.log(`✅ Integration test passed: processed ${telegraphNodes.length} Telegraph nodes`);
});