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

// Keep original publish command as legacy support
program
	.command("publish-legacy")
	.description("Legacy publish command (use 'pub' for enhanced version)")
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
		if (!options.file) {
			console.error("❌ Error: File path must be specified using --file");
			program.help();
		}

		const filePath = resolve(options.file);
		const fileDirectory = dirname(filePath);

		if (!existsSync(filePath)) {
			console.error(`❌ Error: File not found: ${filePath}`);
			process.exit(1);
		}

		let accessToken: string | undefined = options.token;
		if (!accessToken) {
			accessToken = loadAccessToken(fileDirectory);
			if (!accessToken) {
				console.log(
					"⚠️  No access token provided and none found in config file. A new Telegraph account will be created.",
				);
			}
		}

		try {
			console.log("📝 Reading file...");
			const markdownContent = readFileSync(filePath, "utf-8");
			console.log("--- Raw Markdown Content (Diagnostic) ---");
			console.log(`${markdownContent.substring(0, 500)}...`); // Log first 500 chars to avoid huge output
			console.log("-----------------------------------------");

			let articleTitle: string | null = options.title || null;
			let contentToPublish = markdownContent; // This will be the content passed to convertMarkdownToTelegraphNodes

			if (!articleTitle) {
				console.log("🔎 Attempting to extract title from content...");
				const { title: extractedTitle, content: remainingContent } =
					extractTitleAndContent(markdownContent);
				if (extractedTitle) {
					articleTitle = cleanMarkdownString(extractedTitle); // ONLY clean the extracted title
					contentToPublish = remainingContent;
					console.log(
						`✅ Extracted and cleaned title from content: "${articleTitle}"`,
					);
				} else {
					console.error(
						"❌ Error: No title provided and no heading found in the content. Please provide a title using --title option or add a heading to the markdown file.",
					);
					process.exit(1);
				}
			}

			// Validate contentToPublish (which is original markdown content, possibly without the first heading)
			try {
				console.log("✅ Validating content for unsupported HTML tags...");
				validateCleanedContent(contentToPublish); // Validate for raw HTML tags in original markdown
				console.log("✨ Content validated successfully for HTML tags.");
			} catch (validationError: unknown) {
				console.error(
					"❌ Content validation failed:",
					validationError instanceof Error
						? validationError.message
						: String(validationError),
				);
				process.exit(1);
			}

			console.log("⚙️ Converting Markdown to Telegraph Nodes...");
			const telegraphNodes = convertMarkdownToTelegraphNodes(contentToPublish); // Pass original markdown content (possibly without title)
			console.log("✅ Markdown converted to Telegraph Nodes.");

			const author = options.author || "Anonymous";

			const publisher = new TelegraphPublisher(); // Create publisher instance once

			// Perform content size check before dry run or actual publishing
			try {
				console.log("📏 Checking content size...");
				publisher.checkContentSize(telegraphNodes);
				console.log("✅ Content size is within limits.");
			} catch (sizeError: unknown) {
				console.error(
					"❌ Content size validation failed:",
					sizeError instanceof Error ? sizeError.message : String(sizeError),
				);
				process.exit(1);
			}

			if (options.dryRun) {
				console.log("🚀 Dry Run Mode: Article will not be published.");
				console.log(`Proposed Title: ${articleTitle}`);
				console.log("\n--- Converted Telegraph Nodes (Dry Run) ---\n");
				console.log(JSON.stringify(telegraphNodes, null, 2));
				console.log("\n------------------------------------------\n");
				return;
			}

			let finalAccessToken = accessToken;
			if (!finalAccessToken) {
				console.log("🔧 Creating Telegraph account...");
				const account = await publisher.createAccount(
					author,
					author,
					options.authorUrl,
				);
				finalAccessToken = account.access_token;
				console.log(`✅ Account created: ${account.short_name}`);
				console.log(`🔗 Access Token: ${finalAccessToken}`);
				saveAccessToken(fileDirectory, finalAccessToken);
			}

			// Set the access token to the publisher instance
			publisher.setAccessToken(finalAccessToken);

			console.log("📤 Publishing article...");
			if (!articleTitle) {
				console.error(
					"❌ Internal Error: Article title is null after extraction/validation.",
				);
				process.exit(1);
			}

			const page = await publisher.publishNodes(articleTitle, telegraphNodes);

			console.log("🎉 Article successfully published!");
			console.log(`📄 Title: ${page.title}`);
			console.log(`🔗 URL: ${page.url}`);
			console.log(`📍 Path: ${page.path}`);

			if (page.author_name) {
				console.log(`👤 Author: ${page.author_name}`);
			}
		} catch (error) {
			console.error(
				"❌ Error publishing:",
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

program
	.command("edit")
	.description("Edit an existing Telegra.ph page")
	.option(
		"-t, --token <token>",
		"Access token for your Telegra.ph account (optional, will try to load from config file)",
	)
	.requiredOption(
		"-p, --path <path>",
		"Path of the page to edit (e.g., Your-Page-Title-12-31)",
	)
	.requiredOption(
		"-f, --file <path>",
		"Path to the Markdown file with the new content",
	)
	.option(
		"--title <title>",
		"New title of the article (optional, will be extracted from file if not provided)",
	)
	.option("--author <name>", "New author's name (optional)")
	.option("--author-url <url>", "New author's URL (optional)")
	.action(async (options) => {
		const { token, path, file, title, author, authorUrl } = options;

		if (!file) {
			console.error("❌ Error: File path must be specified using --file");
			program.help();
		}

		const filePath = resolve(file);
		const fileDirectory = dirname(filePath);

		if (!existsSync(filePath)) {
			console.error(`❌ Error: File not found: ${filePath}`);
			process.exit(1);
		}

		let accessToken: string | undefined = token;
		if (!accessToken) {
			accessToken = loadAccessToken(fileDirectory);
		}

		if (!accessToken) {
			console.error(
				"❌ Error: Access token is required. Please provide it via --token or ensure it's in the config file.",
			);
			process.exit(1);
		}

		try {
			console.log("📝 Reading new content file...");
			const markdownContent = readFileSync(filePath, "utf-8");

			let articleTitle: string | null = title || null;
			let contentToPublish = markdownContent;

			if (!articleTitle) {
				console.log("🔎 Attempting to extract title from new content...");
				const { title: extractedTitle, content: remainingContent } =
					extractTitleAndContent(markdownContent);
				if (extractedTitle) {
					articleTitle = cleanMarkdownString(extractedTitle);
					contentToPublish = remainingContent;
					console.log(
						`✅ Extracted and cleaned title from new content: "${articleTitle}"`,
					);
				} else {
					console.error(
						"❌ Error: No title provided and no heading found in the new content file. Please provide a title using --title option or add a heading to the markdown file.",
					);
					process.exit(1);
				}
			}

			try {
				console.log("✅ Validating new content for unsupported HTML tags...");
				validateCleanedContent(contentToPublish);
				console.log("✨ New content validated successfully for HTML tags.");
			} catch (validationError: unknown) {
				console.error(
					"❌ New content validation failed:",
					validationError instanceof Error
						? validationError.message
						: String(validationError),
				);
				process.exit(1);
			}

			console.log("⚙️ Converting new Markdown to Telegraph Nodes...");
			const telegraphNodes = convertMarkdownToTelegraphNodes(contentToPublish);
			console.log("✅ New Markdown converted to Telegraph Nodes.");

			const publisher = new TelegraphPublisher();
			publisher.setAccessToken(accessToken);

			try {
				console.log("📏 Checking new content size...");
				publisher.checkContentSize(telegraphNodes);
				console.log("✅ New content size is within limits.");
			} catch (sizeError: unknown) {
				console.error(
					"❌ New content size validation failed:",
					sizeError instanceof Error ? sizeError.message : String(sizeError),
				);
				process.exit(1);
			}

			console.log(`📤 Editing page with path: ${path}...`);
			if (!articleTitle) {
				console.error(
					"❌ Internal Error: Article title is null after extraction/validation.",
				);
				process.exit(1);
			}
			const editedPage = await publisher.editPage(
				path,
				articleTitle,
				telegraphNodes,
				author,
				authorUrl,
			);

			console.log("🎉 Article successfully edited!");
			console.log(`📄 Title: ${editedPage.title}`);
			console.log(`🔗 URL: ${editedPage.url}`);
			console.log(`📍 Path: ${editedPage.path}`);

			if (editedPage.author_name) {
				console.log(`👤 Author: ${editedPage.author_name}`);
			}
		} catch (error) {
			console.error(
				"❌ Error editing page:",
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

🚀 Enhanced Publishing (Recommended):
   telegraph-publisher pub -f article.md -a "Author Name"

🔗 Publish with Dependencies:
   telegraph-publisher pub -f main.md -a "Author" --with-dependencies

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

🔧 Legacy Commands:
   telegraph-publisher publish-legacy -f article.md -a "Author"
   telegraph-publisher list-pages --token YOUR_TOKEN
   telegraph-publisher edit -p Page-Path-12-31 -f new-content.md

🔧 First Time Setup:
   1. telegraph-publisher config --username "Your Name"
   2. telegraph-publisher pub -f your-file.md --token YOUR_TOKEN

💡 Tips:
   • Access token is saved automatically after first use
   • YAML front-matter is added to published files automatically
   • Local links are replaced with Telegraph URLs in published content
   • Original files remain unchanged
   • Use 'pub' for enhanced features, 'publish-legacy' for simple publishing

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
