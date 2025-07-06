#!/usr/bin/env bun

import { TelegraphPublisher } from "./telegraphPublisher";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface CliOptions {
  file?: string;
  title?: string;
  author?: string;
  authorUrl?: string;
  help?: boolean;
}

function showHelp() {
  console.log(`
Telegraph Publisher CLI - Публикация Markdown в Telegra.ph

Использование:
  bun run cli.ts [опции]

Опции:
  --file <path>        Путь к Markdown файлу для публикации
  --title <title>      Заголовок статьи (если не указан, используется имя файла)
  --author <name>      Имя автора
  --author-url <url>   URL автора
  --help               Показать эту справку

Примеры:
  bun run cli.ts --file article.md --title "Моя статья" --author "Иван Иванов"
  bun run cli.ts --file content.md --author "Автор" --author-url "https://example.com"
  `);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--file":
        options.file = args[++i];
        break;
      case "--title":
        options.title = args[++i];
        break;
      case "--author":
        options.author = args[++i];
        break;
      case "--author-url":
        options.authorUrl = args[++i];
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  if (!options.file) {
    console.error("❌ Ошибка: Необходимо указать файл с помощью --file");
    showHelp();
    process.exit(1);
  }

  const filePath = resolve(options.file);

  if (!existsSync(filePath)) {
    console.error(`❌ Ошибка: Файл не найден: ${filePath}`);
    process.exit(1);
  }

  try {
    console.log("📝 Читаю файл...");
    const markdownContent = readFileSync(filePath, "utf-8");

    const title = options.title || filePath.split("/").pop()?.replace(/\.md$/, "") || "Без названия";
    const author = options.author || "Аноним";

    console.log("🔧 Создаю аккаунт Telegraph...");
    const publisher = new TelegraphPublisher();
    const account = await publisher.createAccount(author, author, options.authorUrl);

    console.log(`✅ Аккаунт создан: ${account.short_name}`);
    console.log(`🔗 Access Token: ${account.access_token}`);

    console.log("📤 Публикую статью...");
    const page = await publisher.publishMarkdown(title, markdownContent);

    console.log("🎉 Статья успешно опубликована!");
    console.log(`📄 Заголовок: ${page.title}`);
    console.log(`🔗 URL: ${page.url}`);
    console.log(`📍 Path: ${page.path}`);

    if (page.author_name) {
      console.log(`👤 Автор: ${page.author_name}`);
    }

  } catch (error) {
    console.error("❌ Ошибка при публикации:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}