#!/usr/bin/env bun

import { Command } from 'commander';
import { TelegraphPublisher } from "./telegraphPublisher";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { cleanMarkdownFile } from "./clean_mr";

const program = new Command();

program
  .name('telegraph-publisher')
  .description('CLI tool for publishing Markdown to Telegra.ph and cleaning Markdown files.')
  .version('1.0.0');

program.command('publish')
  .description('Publish a Markdown file to Telegra.ph')
  .option('-f, --file <path>', 'Path to the Markdown file to publish')
  .option('-t, --title <title>', 'Title of the article (defaults to filename)')
  .option('-a, --author <name>', "Author's name")
  .option('-u, --author-url <url>', "Author's URL")
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
      const markdownContent = readFileSync(filePath, "utf-8");

      const title = options.title || filePath.split('/').pop()?.replace(/\.md$/, '') || "Untitled";
      const author = options.author || "Anonymous";

      console.log("🔧 Creating Telegraph account...");
      const publisher = new TelegraphPublisher();
      const account = await publisher.createAccount(author, author, options.authorUrl);

      console.log(`✅ Account created: ${account.short_name}`);
      console.log(`🔗 Access Token: ${account.access_token}`);

      console.log("📤 Publishing article...");
      const page = await publisher.publishMarkdown(title, markdownContent);

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