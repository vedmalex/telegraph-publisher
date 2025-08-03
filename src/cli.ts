#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { cleanMarkdownFile, cleanMarkdownString } from "./clean_mr";
import { EnhancedCommands } from "./cli/EnhancedCommands";
import { ConfigManager } from "./config/ConfigManager";
import {
	convertMarkdownToTelegraphNodes,
	extractTitleAndContent,
	validateCleanedContent,
} from "./markdownConverter";
import { TelegraphPublisher } from "./telegraphPublisher";

// Configuration file name
const CONFIG_FILE_NAME = ".telegraph-publisher-config.json";

/**
 * Saves the access token to a configuration file in the specified directory.
 * @param directory The directory where the config file should be saved.
 * @param accessToken The access token to save.
 */
function saveAccessToken(directory: string, accessToken: string) {
	const configPath = join(directory, CONFIG_FILE_NAME);
	try {
		writeFileSync(configPath, JSON.stringify({ accessToken }), "utf-8");
		console.log(`✅ Access token saved to ${configPath}`);
	} catch (error) {
		console.error(
			`❌ Error saving access token to ${configPath}:`,
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Loads the access token from a configuration file in the specified directory.
 * @param directory The directory where the config file might be found.
 * @returns The access token if found, otherwise undefined.
 */
function loadAccessToken(directory: string): string | undefined {
	const configPath = join(directory, CONFIG_FILE_NAME);
	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, "utf-8"));
			if (config.accessToken) {
				console.log(`✅ Access token loaded from ${configPath}`);
				return config.accessToken;
			}
		} catch (error) {
			console.error(
				`❌ Error loading access token from ${configPath}:`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}
	return undefined;
}

// Read package.json to get the version
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const appVersion = packageJson.version;

const program = new Command();

program
	.name("telegraph-publisher")
	.description(
		"A CLI tool to publish Markdown content to Telegra.ph with metadata management and dependency resolution."
	)
	.version(appVersion);

// Add enhanced commands first (these are the new primary commands)
EnhancedCommands.addPublishCommand(program);
EnhancedCommands.addAnalyzeCommand(program);
EnhancedCommands.addConfigCommand(program);
EnhancedCommands.addStatusCommand(program);
EnhancedCommands.addResetCommand(program);
EnhancedCommands.addCheckLinksCommand(program);

// Keep original publish command as legacy support with enhanced workflow
program
	.command("publish-legacy")
	.description("Legacy publish command with enhanced workflow (use 'pub' for full features)")
	.option("-f, --file <path>", "Path to the Markdown file to publish")
	.option(
		"-t, --title <title>",
		"Title of the article (defaults to filename, or first heading in file if found)",
	)
	.option("-a, --author <name>", "Author's name")
	.option("-u, --author-url <url>", "Author's URL")
	.option(
		"--dry-run",
		"Process the file but do not publish to Telegra.ph, showing the resulting Telegraph Nodes (JSON).",
	)
	.option(
		"--token <token>",
		"Access token for your Telegra.ph account (optional, will try to load from/save to config file)",
	)
	.action(async (options) => {
		try {
			// Convert legacy options to enhanced command format
			const enhancedOptions = {
				file: options.file,
				author: options.author,
				title: options.title,
				authorUrl: options.authorUrl,
				dryRun: options.dryRun,
				token: options.token,
				withDependencies: false, // Legacy doesn't auto-publish dependencies
				forceRepublish: false,
				verbose: false
			};

			console.log("🔄 Running legacy command with enhanced workflow...");

			// Use the enhanced command handler but with legacy parameters
			await EnhancedCommands.handleUnifiedPublishCommand(enhancedOptions);
		} catch (error) {
			console.error(
				"❌ Error in legacy publish:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	});

program
	.command("clean-md")
	.description("Remove Markdown formatting from a file")
	.argument("<file-path>", "Path to the Markdown file to clean")
	.action((filePath) => {
		cleanMarkdownFile(filePath);
	});

program
	.command("list-pages")
	.description("List published pages on Telegra.ph for a given access token")
	.option(
		"-t, --token <token>",
		"Access token for your Telegra.ph account (optional, will try to load from config file)",
	)
	.action(async (options) => {
		try {
			const publisher = new TelegraphPublisher();
			let accessToken: string | undefined = options.token;
			if (!accessToken) {
				accessToken = loadAccessToken(process.cwd());
			}

			if (!accessToken) {
				console.error(
					"❌ Error: Access token is required. Please provide it via --token or ensure it's in the config file.",
				);
				process.exit(1);
			}
			publisher.setAccessToken(accessToken);

			console.log("🔎 Fetching page list from Telegra.ph...");
			const pageList = await publisher.listPages();

			if (pageList.pages.length === 0) {
				console.log("🤷 No pages found for this access token.");
				return;
			}

			console.log(`
📄 Found ${pageList.total_count} pages:
`);
			pageList.pages.forEach((page, index) => {
				console.log(`${index + 1}. Title: ${page.title}`);
				console.log(`   URL: ${page.url}`);
				console.log(`   Path: ${page.path}`);
				if (page.author_name) {
					console.log(`   Author: ${page.author_name}`);
				}
				console.log(""); // Empty line for readability
			});
		} catch (error) {
			console.error(
				"❌ Error listing pages:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	});



// Add help command with examples
program
	.command("help-examples")
	.description("Show usage examples")
	.action(() => {
		console.log(`
📚 Telegraph Publisher - Usage Examples

🚀 Unified Publishing (Recommended):
   telegraph-publisher pub -f article.md -a "Author Name"

📝 Create and Publish New File:
   telegraph-publisher pub -f new-article.md -a "Author" --title "My Article"

🔗 Publish with Dependencies:
   telegraph-publisher pub -f main.md -a "Author" --with-dependencies

📁 Publish Entire Directory:
   telegraph-publisher pub -a "Author"

🔄 Force Republish:
   telegraph-publisher pub -f article.md -a "Author" --force-republish

👁️ Dry Run (Preview):
   telegraph-publisher pub -f article.md -a "Author" --dry-run

📊 Analyze Dependencies:
   telegraph-publisher analyze -f article.md --show-tree

⚙️ Configuration Management:
   telegraph-publisher config --show
   telegraph-publisher config --username "Default Author"
   telegraph-publisher config --max-depth 10

📋 Check Status:
   telegraph-publisher status -f article.md

🔧 Legacy Commands (with enhanced workflow):
   telegraph-publisher publish-legacy -f article.md -a "Author"
   telegraph-publisher list-pages --token YOUR_TOKEN

🔧 First Time Setup:
   1. telegraph-publisher config --username "Your Name"
   2. telegraph-publisher pub -f your-file.md --token YOUR_TOKEN

💡 Tips:
   • Access token is saved automatically after first use
   • YAML front-matter is added to published files automatically (pub, publish-legacy)
   • Local links are replaced with Telegraph URLs in published content
   • Legacy commands now use enhanced workflow with metadata management
   • Unified 'pub' command creates/updates metadata and manages cache automatically
   • Use 'pub' for full features, 'publish-legacy' for backward-compatible interface

📖 For more information, visit: https://github.com/your-repo/telegraph-publisher
`);
	});

// Error handling for unknown commands
program.on("command:*", () => {
	console.error(
		"❌ Error: Invalid command: %s\nSee --help for a list of available commands.",
		program.args.join(" "),
	);
	process.exit(1);
});

// Show help if no command provided
if (process.argv.length <= 2) {
	program.help();
}

program.parse(process.argv);
