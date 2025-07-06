#!/usr/bin/env bun

import { Command } from 'commander';
import { TelegraphPublisher } from "./telegraphPublisher";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { cleanMarkdownString, cleanMarkdownFile } from "./clean_mr";
import { convertMarkdownToTelegraphNodes, extractTitleAndContent, validateCleanedContent } from "./markdownConverter";

// Read package.json to get the version
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const appVersion = packageJson.version;

const program = new Command();

program
  .name('telegraph-publisher')
  .description('A CLI tool to publish Markdown content to Telegra.ph and manage related tasks.')
  .version(appVersion);

program.command('publish')
  .description('Publish a Markdown file to Telegra.ph')
  .option('-f, --file <path>', 'Path to the Markdown file to publish')
  .option('-t, --title <title>', 'Title of the article (defaults to filename, or first heading in file if found)')
  .option('-a, --author <name>', "Author's name")
  .option('-u, --author-url <url>', "Author's URL")
  .option('--dry-run', 'Process the file but do not publish to Telegra.ph, showing the resulting Telegraph Nodes (JSON).')
  .action(async (options) => {
    if (!options.file) {
      console.error("❌ Error: File path must be specified using --file");
      program.help();
    }

    const filePath = resolve(options.file);

    if (!existsSync(filePath)) {
      console.error(`❌ Error: File not found: ${filePath}`);
      process.exit(1);
    }

    try {
      console.log("📝 Reading file...");
      let markdownContent = readFileSync(filePath, "utf-8");
      console.log("--- Raw Markdown Content (Diagnostic) ---");
      console.log(markdownContent.substring(0, 500) + '...'); // Log first 500 chars to avoid huge output
      console.log("-----------------------------------------");

      let articleTitle: string | null = options.title || null;
      let contentToPublish = markdownContent; // This will be the content passed to convertMarkdownToTelegraphNodes

      if (!articleTitle) {
        console.log("🔎 Attempting to extract title from content...");
        const { title: extractedTitle, content: remainingContent } = extractTitleAndContent(markdownContent);
        if (extractedTitle) {
          articleTitle = cleanMarkdownString(extractedTitle); // ONLY clean the extracted title
          contentToPublish = remainingContent;
          console.log(`✅ Extracted and cleaned title from content: "${articleTitle}"`);
        } else {
          console.error("❌ Error: No title provided and no heading found in the content. Please provide a title using --title option or add a heading to the markdown file.");
          process.exit(1);
        }
      }

      // Validate contentToPublish (which is original markdown content, possibly without the first heading)
      try {
        console.log("✅ Validating content for unsupported HTML tags...");
        validateCleanedContent(contentToPublish); // Validate for raw HTML tags in original markdown
        console.log("✨ Content validated successfully for HTML tags.");
      } catch (validationError: any) {
        console.error("❌ Content validation failed:", validationError.message);
        process.exit(1);
      }

      console.log("⚙️ Converting Markdown to Telegraph Nodes...");
      const telegraphNodes = convertMarkdownToTelegraphNodes(contentToPublish); // Pass original markdown content (possibly without title)
      console.log("✅ Markdown converted to Telegraph Nodes.");

      const author = options.author || "Anonymous";

      if (options.dryRun) {
        console.log("🚀 Dry Run Mode: Article will not be published.");
        console.log(`Proposed Title: ${articleTitle}`);
        console.log("\n--- Converted Telegraph Nodes (Dry Run) ---\n");
        console.log(JSON.stringify(telegraphNodes, null, 2));
        console.log("\n------------------------------------------\n");
        return;
      }

      console.log("🔧 Creating Telegraph account...");
      const publisher = new TelegraphPublisher();
      const account = await publisher.createAccount(author, author, options.authorUrl);

      console.log(`✅ Account created: ${account.short_name}`);
      console.log(`🔗 Access Token: ${account.access_token}`);

      console.log("📤 Publishing article...");
      // Ensure articleTitle is not null before passing it to publishMarkdown
      if (!articleTitle) {
        console.error("❌ Internal Error: Article title is null after extraction/validation.");
        process.exit(1);
      }
      // Pass telegraphNodes directly to publishNodes, not cleanedMarkdownContent to publishMarkdown
      const page = await publisher.publishNodes(articleTitle, telegraphNodes);

      console.log("🎉 Article successfully published!");
      console.log(`📄 Title: ${page.title}`);
      console.log(`🔗 URL: ${page.url}`);
      console.log(`📍 Path: ${page.path}`);

      if (page.author_name) {
        console.log(`👤 Author: ${page.author_name}`);
      }

    } catch (error) {
      console.error("❌ Error publishing:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.command('clean-md')
  .description('Remove Markdown formatting from a file')
  .argument('<file-path>', 'Path to the Markdown file to clean')
  .action((filePath) => {
    cleanMarkdownFile(filePath);
  });

// Error handling for unknown commands
program.on('command:*', () => {
  console.error('❌ Error: Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
  process.exit(1);
});

program.parse(process.argv);