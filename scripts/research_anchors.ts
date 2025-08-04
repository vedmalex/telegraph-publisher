import { TelegraphPublisher, type TelegraphNode } from '../src/telegraphPublisher';

const testHeadings: string[] = [
  // Basic cases
  "Simple Title",
  "Title With Spaces",
  // Cyrillic
  "Заголовок на кириллице",
  "Заголовок с пробелами",
  // Numbers
  "1. Numbered Heading",
  "Heading with 123",
  // Special Characters (common)
  "Title with dot.",
  "Title with comma,",
  "Title with colon:",
  "Title with question mark?",
  "Title with exclamation!",
  // Special Characters (problematic from logs)
  "Аналогия «Дерево цивилизации» (из комментария к ШБ 1.1.4)",
  "Вопрос 4: Опишите квалификацию для того, чтобы рассказывать и слушать «Шримад-Бхагаватам».",
  // Other symbols
  "Title with @#$%^&*()_+-=[]{}|;'\"<>/",
  // Mixed case
  "MixedCaseTitle",
  "Title With Mixed Case",
  // Markdown formatting
  "**Bold Title**",
  "*Italic Title*",
  "`Code Title`",
  "[Link Title](url)",
  "**Bold *and Italic* Title**"
];

async function main() {
  const accessToken = process.argv[2];

  if (!accessToken) {
    console.error("❌ Error: Access token is required.");
    console.log("Usage: bun scripts/research_anchors.ts <YOUR_ACCESS_TOKEN>");
    process.exit(1);
  }

  try {
    console.log("🚀 Starting anchor research publication...");
    const publisher = new TelegraphPublisher();
    publisher.setAccessToken(accessToken);

    const nodes: TelegraphNode[] = testHeadings.map(text => ({
      tag: 'h3',
      children: [text]
    }));

    const page = await publisher.publishNodes("Anchor Research Page", nodes);

    console.log("\n✅ Publication successful!");
    console.log("=======================================");
    console.log("🔗 URL:", page.url);
    console.log("=======================================");
    console.log("\n🕵️‍♂️ Next Steps:");
    console.log("1. Open the URL above in your browser.");
    console.log("2. Right-click on each heading and select 'Inspect'.");
    console.log("3. In the developer tools, find the `id` attribute of the `<h3>` tag.");
    console.log("4. Compare the original heading text with the generated `id` to determine the rules.");

  } catch (error) {
    console.error("❌ Publication failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Execute the script
main();