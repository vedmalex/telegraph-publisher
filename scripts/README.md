# Research Scripts

This directory contains utility scripts for project research and development.

## research_anchors.ts

**Purpose**: Research script to empirically determine Telegra.ph anchor generation algorithm.

**Usage**:
```bash
bun run scripts/research_anchors.ts <YOUR_ACCESS_TOKEN>
```

**What it does**:
1. Creates a Telegraph page with 21 test headings covering edge cases
2. Publishes the page using TelegraphPublisher API
3. Outputs the URL for manual analysis of generated anchor IDs
4. Provides step-by-step instructions for extracting anchor generation rules

**Test headings include**:
- Basic cases (English, spaces)
- Cyrillic text (Russian characters)
- Numbers and punctuation
- Special symbols (@#$%^&* etc.)
- Complex cases from project logs
- Markdown formatting (**bold**, *italic*, etc.)
- Mixed case variations

**Output example**:
```
🚀 Starting anchor research publication...

✅ Publication successful!
=======================================
🔗 URL: https://telegra.ph/Anchor-Research-Page-XX-XX
=======================================

🕵️‍♂️ Next Steps:
1. Open the URL above in your browser.
2. Right-click on each heading and select 'Inspect'.
3. In the developer tools, find the `id` attribute of the `<h3>` tag.
4. Compare the original heading text with the generated `id` to determine the rules.
```

**Testing**:
```bash
bun test scripts/research_anchors.test.ts
```

**Related Task**: `2025-08-04_TASK-023_anchor-rules-research`