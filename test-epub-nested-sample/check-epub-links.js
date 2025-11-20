#!/usr/bin/env node

/**
 * Simple local diagnostic script for EPUB link mapping.
 *
 * Usage:
 *   1. From repo root:
 *        cd test-epub-nested-sample
 *        telegraph-publisher epub -f index.md -a "Test Author" -o nested.epub --debug
 *   2. Then:
 *        node check-epub-links.js
 *
 * The script will:
 *   - Find the latest .epub-temp-* directory in the current folder
 *   - Scan OEBPS/chapter-*.html
 *   - Verify that local links no longer point to .md files
 *   - Report any hrefs that still contain ".md"
 */

const fs = require("node:fs");
const path = require("node:path");

function findLatestTempDir(baseDir) {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const candidates = entries
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name.startsWith(".epub-temp-"),
    )
    .map((d) => path.join(baseDir, d.name));

  if (candidates.length === 0) {
    return null;
  }

  // Pick the most recently modified temp dir
  candidates.sort((a, b) => {
    const aStat = fs.statSync(a);
    const bStat = fs.statSync(b);
    return bStat.mtimeMs - aStat.mtimeMs;
  });

  return candidates[0] || null;
}

function collectChapterFiles(oebpsDir) {
  const entries = fs.readdirSync(oebpsDir, { withFileTypes: true });
  return entries
    .filter(
      (d) =>
        d.isFile() &&
        d.name.startsWith("chapter-") &&
        d.name.endsWith(".html"),
    )
    .map((d) => path.join(oebpsDir, d.name));
}

function checkLinksInFile(filePath) {
  const html = fs.readFileSync(filePath, "utf-8");
  const hrefRegex = /href="([^"]+)"/g;
  const issues = [];

  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1] || "";

    // Skip external and pure-anchor links
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("#")
    ) {
      continue;
    }

    if (href.toLowerCase().includes(".md")) {
      issues.push(href);
    }
  }

  return issues;
}

function main() {
  const baseDir = process.cwd();
  const tempDir = findLatestTempDir(baseDir);

  if (!tempDir) {
    console.error("❌ No .epub-temp-* directory found in:", baseDir);
    console.error("   Generate EPUB with --debug before running this script.");
    process.exit(1);
  }

  const oebpsDir = path.join(tempDir, "OEBPS");
  if (!fs.existsSync(oebpsDir) || !fs.statSync(oebpsDir).isDirectory()) {
    console.error("❌ OEBPS directory not found in:", tempDir);
    process.exit(1);
  }

  const chapterFiles = collectChapterFiles(oebpsDir);
  if (chapterFiles.length === 0) {
    console.error("⚠️ No chapter-*.html files found in:", oebpsDir);
    process.exit(1);
  }

  console.log("🔍 Checking local links in chapters under:", oebpsDir);

  let totalIssues = 0;

  for (const file of chapterFiles) {
    const issues = checkLinksInFile(file);
    if (issues.length > 0) {
      console.log(`\n❌ Found .md links in ${path.basename(file)}:`);
      for (const href of issues) {
        console.log(`   - ${href}`);
      }
      totalIssues += issues.length;
    }
  }

  if (totalIssues === 0) {
    console.log("\n✅ All chapter links look clean (no .md hrefs found).");
  } else {
    console.log(`\n❌ Total .md hrefs found: ${totalIssues}`);
    process.exit(1);
  }
}

main();

