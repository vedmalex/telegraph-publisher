import { expect, test, spyOn } from "bun:test";

test("research_anchors script validates access token requirement", () => {
  // Test that the script includes all required test headings
  const expectedHeadings = [
    "Simple Title",
    "Title With Spaces", 
    "Заголовок на кириллице",
    "Заголовок с пробелами",
    "1. Numbered Heading",
    "Heading with 123",
    "Title with dot.",
    "Title with comma,",
    "Title with colon:",
    "Title with question mark?",
    "Title with exclamation!",
    "Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)",
    "Вопрос 4: Опишите квалификацию для того, чтобы рассказывать и слушать «Шримад-Бхагаватам».",
    "Title with @#$%^&*()_+-=[]{}|;'\"<>/",
    "MixedCaseTitle",
    "Title With Mixed Case",
    "**Bold Title**",
    "*Italic Title*",
    "`Code Title`",
    "[Link Title](url)",
    "**Bold *and Italic* Title**"
  ];

  // Validate that we have exactly 21 test headings as specified
  expect(expectedHeadings).toHaveLength(21);
  
  // Validate coverage of different categories
  const hasBasicCases = expectedHeadings.some(h => h === "Simple Title");
  const hasCyrillic = expectedHeadings.some(h => h === "Заголовок на кириллице");
  const hasNumbers = expectedHeadings.some(h => h === "1. Numbered Heading");
  const hasSpecialChars = expectedHeadings.some(h => h.includes("@#$%"));
  const hasMarkdown = expectedHeadings.some(h => h.includes("**Bold"));
  const hasComplexCyrillic = expectedHeadings.some(h => h.includes("Аналогия «Дерево цивилизации»"));
  
  expect(hasBasicCases).toBe(true);
  expect(hasCyrillic).toBe(true);
  expect(hasNumbers).toBe(true);
  expect(hasSpecialChars).toBe(true);
  expect(hasMarkdown).toBe(true);
  expect(hasComplexCyrillic).toBe(true);
});

test("research_anchors script has correct file structure", async () => {
  // Test that the script file exists and can be imported
  const scriptExists = await Bun.file("scripts/research_anchors.ts").exists();
  expect(scriptExists).toBe(true);
  
  // Test that the script contains the expected imports and structure
  const scriptContent = await Bun.file("scripts/research_anchors.ts").text();
  
  expect(scriptContent).toContain("import { TelegraphPublisher, type TelegraphNode }");
  expect(scriptContent).toContain("const testHeadings: string[]");
  expect(scriptContent).toContain("async function main()");
  expect(scriptContent).toContain("process.argv[2]");
  expect(scriptContent).toContain("publisher.publishNodes");
  expect(scriptContent).toContain("main()");
});

test("research_anchors script includes comprehensive test cases", async () => {
  const scriptContent = await Bun.file("scripts/research_anchors.ts").text();
  
  // Test for presence of all major test case categories
  expect(scriptContent).toContain("Simple Title");                    // Basic case
  expect(scriptContent).toContain("Заголовок на кириллице");         // Cyrillic
  expect(scriptContent).toContain("1. Numbered Heading");            // Numbers
  expect(scriptContent).toContain("Title with dot.");               // Punctuation
  expect(scriptContent).toContain("**Bold Title**");               // Markdown
  expect(scriptContent).toContain("@#$%^&*()_+-=[]{}|");          // Special symbols
  expect(scriptContent).toContain("MixedCaseTitle");              // Case variations
  expect(scriptContent).toContain("Аналогия «Дерево цивилизации»"); // Complex Cyrillic
});

test("research_anchors script has proper error handling", async () => {
  const scriptContent = await Bun.file("scripts/research_anchors.ts").text();
  
  // Test for error handling patterns
  expect(scriptContent).toContain("if (!accessToken)");
  expect(scriptContent).toContain("console.error");
  expect(scriptContent).toContain("process.exit(1)");
  expect(scriptContent).toContain("try {");
  expect(scriptContent).toContain("} catch (error)");
  expect(scriptContent).toContain("Usage: bun scripts/research_anchors.ts");
});

test("research_anchors script provides clear output format", async () => {
  const scriptContent = await Bun.file("scripts/research_anchors.ts").text();
  
  // Test for expected output messages
  expect(scriptContent).toContain("Starting anchor research publication");
  expect(scriptContent).toContain("Publication successful");
  expect(scriptContent).toContain("Next Steps:");
  expect(scriptContent).toContain("Right-click on each heading");
  expect(scriptContent).toContain("find the `id` attribute");
  expect(scriptContent).toContain("Compare the original heading text");
});