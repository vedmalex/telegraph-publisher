#!/usr/bin/env bun
/**
 * scripts/check-epub-mutations.ts - Mutation testing for EPUB pipeline (Plan §7.2).
 *
 * Runs 16 named mutations from plan §7.2 against the test suite:
 * M01_FIRST_PART ... M16_SKIP_BACKPRESSURE.
 *
 * For each mutant:
 * 1. Checks baseline test passes (PASS).
 * 2. Applies the specific AST/code mutation to target source file.
 * 3. Runs the target test command -> expects test failure (KILLED / RED).
 * 4. Reverts mutation and verifies restored baseline test passes (PASS).
 * 5. Emits structured execution receipt JSON.
 *
 * CLI:
 *   bun scripts/check-epub-mutations.ts [--work-dir .] [--receipt-dir /tmp/TASK-047-mutation-receipts] [--mutants M01,M02...]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface MutationDefinition {
	id: string;
	description: string;
	targetFile: string;
	originalPattern: string;
	mutatedReplacement: string;
	testCommand: string[];
	expectedFailureOracle: string;
}

interface MutationReceipt {
	id: string;
	description: string;
	targetFile: string;
	originalSha256: string;
	mutatedSha256: string;
	restoredSha256: string;
	status: "KILLED" | "SURVIVED" | "ERROR";
	baselinePass: boolean;
	killedNonZeroExit: boolean;
	restoredPass: boolean;
	oracleMatches: boolean;
	durationMs: number;
	baselineOutput?: string;
	killedOutput?: string;
	error?: string;
}

const MUTATIONS: MutationDefinition[] = [
	{
		id: "M01_FIRST_PART",
		description: "resolve fragment always returns source first part",
		targetFile: "src/epub/EpubAnchorRegistry.ts",
		originalPattern: "href: `${address.href}#${address.id}`,",
		mutatedReplacement: "href: `${this.firstParts.get(key)}#${address.id}`,",
		testCommand: ["bun", "test", "src/epub/EpubAnchorRegistry.test.ts"],
		expectedFailureOracle: "pure fragments and cross-file fragments address actual parts in both directions",
	},
	{
		id: "M02_SKIP_PURE_FRAGMENT",
		description: "skip pure fragment registry resolution",
		targetFile: "src/epub/EpubAnchorRegistry.ts",
		originalPattern: 'const hash = href.indexOf("#");',
		mutatedReplacement: 'if (href.startsWith("#")) return { kind: "unresolved", href }; const hash = href.indexOf("#");',
		testCommand: ["bun", "test", "src/epub/EpubAnchorRegistry.test.ts"],
		expectedFailureOracle: "pure fragments and cross-file fragments address actual parts in both directions",
	},
	{
		id: "M03_FENCE_TOGGLE",
		description: "toggle instead of char+minLength fence",
		targetFile: "src/epub/EpubMarkdownDocument.ts",
		originalPattern: "tokenizer: {",
		mutatedReplacement: `tokenizer: {
			fences(src) {
				const m = /^ {0,3}(\`{3,}|~{3,})[^\\n]*\\n/.exec(src);
				if (m) {
					return { type: "code", raw: m[0], text: "" };
				}
			},`,
		testCommand: ["bun", "test", "src/epub/EpubMarkdownDocument.test.ts"],
		expectedFailureOracle: "fenced code with 4 backticks containing 3 backticks does not create false headings",
	},
	{
		id: "M04_UTF16_SIZE",
		description: "use UTF-16 .length instead of UTF-8 byte length in layout renderer",
		targetFile: "src/epub/EpubXhtmlRenderer.ts",
		originalPattern: "totalBytes += chunk.byteLength;",
		mutatedReplacement: "totalBytes += new TextDecoder().decode(chunk).length;",
		testCommand: ["bun", "test", "tests/integration/epub-large-files.test.ts"],
		expectedFailureOracle: "multi-chapter book with >300KiB chapter splits into sub-chapters",
	},
	{
		id: "M05_PRE_REWRITE_MEASURE",
		description: "omit empty wrapper check before layout sizing",
		targetFile: "src/epub/EpubLayoutPlanner.ts",
		originalPattern: "if (emptySize > normalizedOptions.maxChapterBytes) {",
		mutatedReplacement: "if (false as boolean && emptySize > normalizedOptions.maxChapterBytes) {",
		testCommand: ["bun", "test", "src/epub/EpubLayoutPlanner.test.ts"],
		expectedFailureOracle: "empty wrapper oversize throws E_WRAPPER_OVERSIZE",
	},
	{
		id: "M06_RESET_IDS",
		description: "reset suffix generator and use duplicate base ids without unique suffixes",
		targetFile: "src/epub/EpubMarkdownDocument.ts",
		originalPattern: "const id = explicit ?? getUniqueAnchorId(base, usedIds);",
		mutatedReplacement: "const id = explicit ?? base; /* MUTATED RESET IDS */",
		testCommand: ["bun", "test", "src/epub/EpubMarkdownDocument.test.ts"],
		expectedFailureOracle: "duplicate headings in same source receive -2, -3 suffixes",
	},
	{
		id: "M07_DROP_DEFINITIONS",
		description: "drop source-level definitions across units",
		targetFile: "src/epub/EpubSourceScanner.ts",
		originalPattern: "definitions,\n\t\t\tlinks: allLinks,",
		mutatedReplacement: "definitions: new Map(),\n\t\t\tlinks: allLinks,",
		testCommand: ["bun", "test", "src/epub/EpubSourceScanner.test.ts"],
		expectedFailureOracle: "streaming scan produces metadata identical to parseEpubMarkdown",
	},
	{
		id: "M08_PHYSICAL_TOC",
		description: "flatten semantic outline into physical part list",
		targetFile: "src/epub/EpubNavigation.ts",
		originalPattern: "root.children = hierarchy(\n\t\t\t\tnodes.filter((node) => node.targetId !== reuse?.targetId),\n\t\t\t);",
		mutatedReplacement: "root.children = []; /* MUTATED PHYSICAL TOC */",
		testCommand: ["bun", "test", "src/epub/EpubNavigation.test.ts"],
		expectedFailureOracle: "fail",
	},
	{
		id: "M09_BREAK_AT_LINE",
		description: "break indivisible units across line boundaries ignoring keepWithNext",
		targetFile: "src/epub/EpubLayoutPlanner.ts",
		originalPattern: "if (source.units[u - 1]?.keepWithNext === false) {",
		mutatedReplacement: "if (false as boolean) {",
		testCommand: ["bun", "test", "src/epub/EpubLayoutPlanner.test.ts"],
		expectedFailureOracle: "heading keepWithNext: cut point is never placed immediately after a heading",
	},
	{
		id: "M10_NO_PROGRESS",
		description: "retry layout overflow without progressing cut",
		targetFile: "src/epub/EpubLayoutPlanner.ts",
		originalPattern: "if (pass > maxPasses) {",
		mutatedReplacement: "if (pass > 1) { /* MUTATED NO PROGRESS */",
		testCommand: ["bun", "test", "src/epub/EpubLayoutPlanner.test.ts"],
		expectedFailureOracle: "provisional multiple cuts per pass handles large paragraph corpus",
	},
	{
		id: "M11_DIRECT_OUTPUT",
		description: "stream directly to final output bypassing staging sentinel",
		targetFile: "src/epub/EpubGenerator.ts",
		originalPattern: 'const stagedZip = session.ownedPath("package.epub");',
		mutatedReplacement: "const stagedZip = this.options.outputPath;",
		testCommand: ["bun", "test", "src/epub/EpubPipeline.dst.test.ts"],
		expectedFailureOracle: "output sentinel: destination file is NEVER modified or corrupted",
	},
	{
		id: "M12_SKIP_CLEANUP",
		description: "skip cleanup and dispose on aborted or failed build",
		targetFile: "src/epub/EpubBuildSession.ts",
		originalPattern: "this.io.base.rm(this.directory, { recursive: true });",
		mutatedReplacement: "/* MUTATED SKIP RM CLEANUP */",
		testCommand: ["bun", "test", "src/epub/EpubBuildSession.test.ts"],
		expectedFailureOracle: "non-debug removes directory",
	},
	{
		id: "M13_ACCUMULATE_BODIES",
		description: "retain rendered bodies in memory even when retainRenderedText is false",
		targetFile: "src/epub/EpubLayoutPlanner.ts",
		originalPattern: "const retainText = book.retainRenderedText ?? true;",
		mutatedReplacement: "const retainText = true;",
		testCommand: ["bun", "test", "src/epub/EpubLayoutPlanner.test.ts"],
		expectedFailureOracle: "non-retaining stage B mode: retainRenderedText false stores only metadata and empty text",
	},
	{
		id: "M14_MIMETYPE_ORDER",
		description: "place mimetype entry at end of ZIP instead of first",
		targetFile: "src/epub/EpubZipWriter.ts",
		originalPattern: "const sortedEntries: ZipEntry[] = [mimetypeEntry, ...otherEntries];",
		mutatedReplacement: "const sortedEntries: ZipEntry[] = [...otherEntries, mimetypeEntry];",
		testCommand: ["bun", "test", "src/epub/EpubZipWriter.test.ts"],
		expectedFailureOracle: "real ZIP generation produces valid EPUB package",
	},
	{
		id: "M15_DROP_PAGE_TARGET",
		description: "drop page target and point to first chapter root",
		targetFile: "src/epub/EpubNavigation.ts",
		originalPattern: "function pageAddress(page: PageTarget, index: NavigationIndex): string {\n\tconst target = index.target(page.targetId);\n\treturn `${target.href}#${encodeURIComponent(target.id)}`;\n}",
		mutatedReplacement: 'function pageAddress(page: PageTarget, index: NavigationIndex): string {\n\treturn "chapter-1.html";\n}',
		testCommand: ["bun", "test", "src/epub/EpubGenerator.test.ts"],
		expectedFailureOracle: "keeps printed page numbers out of the contents and in a page-list",
	},
	{
		id: "M16_SKIP_BACKPRESSURE",
		description: "skip waiting for backpressure drain in writer",
		targetFile: "src/epub/MockEpubIO.ts",
		originalPattern: 'await this.operation("drain", path);',
		mutatedReplacement: '/* MUTATED SKIP DRAIN */ // await this.operation("drain", path);',
		testCommand: ["bun", "test", "src/epub/EpubPipeline.dst.test.ts"],
		expectedFailureOracle: "backpressure & drain testing: writer pause and resume",
	},
];

function sha256Of(content: string): string {
	return createHash("sha256").update(content, "utf-8").digest("hex");
}

function runCommand(cmd: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
	const res = spawnSync(cmd[0], cmd.slice(1), {
		cwd,
		encoding: "utf-8",
		maxBuffer: 20 * 1024 * 1024,
	});
	return {
		exitCode: res.status ?? -1,
		stdout: res.stdout || "",
		stderr: res.stderr || "",
	};
}

function parseArgs() {
	const args = process.argv.slice(2);
	let workDir = resolve(".");
	let receiptDir = "/tmp/TASK-047-mutation-receipts";
	let filterMutants: string[] | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--work-dir" && args[i + 1]) {
			workDir = resolve(args[++i]);
		} else if (arg === "--receipt-dir" && args[i + 1]) {
			receiptDir = resolve(args[++i]);
		} else if (arg === "--mutants" && args[i + 1]) {
			filterMutants = args[++i].split(",").map((s) => s.trim());
		}
	}

	return { workDir, receiptDir, filterMutants };
}

async function main() {
	const { workDir, receiptDir, filterMutants } = parseArgs();
	mkdirSync(receiptDir, { recursive: true });

	console.log("=== EPUB Mutation Tester (Plan §7.2) ===");
	console.log(`Work dir: ${workDir}`);
	console.log(`Receipt dir: ${receiptDir}`);

	const activeMutants = filterMutants
		? MUTATIONS.filter((m) => filterMutants.includes(m.id))
		: MUTATIONS;

	console.log(`Running ${activeMutants.length} mutant checks...\n`);

	const receipts: MutationReceipt[] = [];

	for (const mutant of activeMutants) {
		const startTime = Date.now();
		const filePath = resolve(workDir, mutant.targetFile);

		if (!existsSync(filePath)) {
			console.error(`[${mutant.id}] Target file not found: ${filePath}`);
			receipts.push({
				id: mutant.id,
				description: mutant.description,
				targetFile: mutant.targetFile,
				originalSha256: "",
				mutatedSha256: "",
				restoredSha256: "",
				status: "ERROR",
				baselinePass: false,
				killedNonZeroExit: false,
				restoredPass: false,
				oracleMatches: false,
				durationMs: Date.now() - startTime,
				error: `Target file not found: ${filePath}`,
			});
			continue;
		}

		const originalContent = readFileSync(filePath, "utf-8");
		const originalSha = sha256Of(originalContent);

		if (!originalContent.includes(mutant.originalPattern)) {
			console.error(`[${mutant.id}] Pattern not found in ${mutant.targetFile}`);
			receipts.push({
				id: mutant.id,
				description: mutant.description,
				targetFile: mutant.targetFile,
				originalSha256: originalSha,
				mutatedSha256: "",
				restoredSha256: originalSha,
				status: "ERROR",
				baselinePass: false,
				killedNonZeroExit: false,
				restoredPass: false,
				oracleMatches: false,
				durationMs: Date.now() - startTime,
				error: "Original pattern not found in file",
			});
			continue;
		}

		console.log(`[${mutant.id}] 1. Checking baseline test...`);
		const baselineRun = runCommand(mutant.testCommand, workDir);
		const baselinePass = baselineRun.exitCode === 0;

		if (!baselinePass) {
			console.error(`[${mutant.id}] Baseline test failed!`);
			receipts.push({
				id: mutant.id,
				description: mutant.description,
				targetFile: mutant.targetFile,
				originalSha256: originalSha,
				mutatedSha256: "",
				restoredSha256: originalSha,
				status: "ERROR",
				baselinePass: false,
				killedNonZeroExit: false,
				restoredPass: false,
				oracleMatches: false,
				durationMs: Date.now() - startTime,
				baselineOutput: baselineRun.stdout + baselineRun.stderr,
				error: "Baseline test failed before mutation",
			});
			continue;
		}

		// Apply mutation
		const mutatedContent = originalContent.replace(
			mutant.originalPattern,
			mutant.mutatedReplacement,
		);
		const mutatedSha = sha256Of(mutatedContent);
		writeFileSync(filePath, mutatedContent, "utf-8");

		console.log(`[${mutant.id}] 2. Running mutated test (expecting RED)...`);
		const mutatedRun = runCommand(mutant.testCommand, workDir);
		const combinedMutatedOut = mutatedRun.stdout + "\n" + mutatedRun.stderr;
		const killedNonZeroExit = mutatedRun.exitCode !== 0;
		const oracleMatches = combinedMutatedOut.toLowerCase().includes(mutant.expectedFailureOracle.toLowerCase());

		// Revert mutation immediately
		writeFileSync(filePath, originalContent, "utf-8");
		const restoredSha = sha256Of(readFileSync(filePath, "utf-8"));

		console.log(`[${mutant.id}] 3. Verifying restored baseline...`);
		const restoredRun = runCommand(mutant.testCommand, workDir);
		const restoredPass = restoredRun.exitCode === 0 && restoredSha === originalSha;

		const killed = killedNonZeroExit && oracleMatches && restoredPass;
		const status: "KILLED" | "SURVIVED" | "ERROR" = killed ? "KILLED" : "SURVIVED";

		const durationMs = Date.now() - startTime;
		console.log(
			`[${mutant.id}] Result: ${status} (exit=${mutatedRun.exitCode}, oracleMatch=${oracleMatches}, restored=${restoredPass}) [${durationMs}ms]\n`,
		);

		const receipt: MutationReceipt = {
			id: mutant.id,
			description: mutant.description,
			targetFile: mutant.targetFile,
			originalSha256: originalSha,
			mutatedSha256: mutatedSha,
			restoredSha256: restoredSha,
			status,
			baselinePass,
			killedNonZeroExit,
			restoredPass,
			oracleMatches,
			durationMs,
			baselineOutput: baselineRun.stdout.slice(0, 500),
			killedOutput: combinedMutatedOut.slice(0, 1000),
		};

		receipts.push(receipt);

		// Write individual receipt JSON
		const receiptFile = resolve(receiptDir, `${mutant.id}.json`);
		writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), "utf-8");
	}

	// Write summary
	const summaryPath = resolve(receiptDir, "mutation-summary.json");
	const summary = {
		timestamp: new Date().toISOString(),
		total: receipts.length,
		killed: receipts.filter((r) => r.status === "KILLED").length,
		survived: receipts.filter((r) => r.status === "SURVIVED").length,
		errors: receipts.filter((r) => r.status === "ERROR").length,
		receipts,
	};
	writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");

	console.log("=== Mutation Testing Summary ===");
	console.log(`Total: ${summary.total}`);
	console.log(`Killed (PASS): ${summary.killed}`);
	console.log(`Survived (FAIL): ${summary.survived}`);
	console.log(`Errors: ${summary.errors}`);
	console.log(`Full summary written to: ${summaryPath}`);

	if (summary.killed !== summary.total) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Mutation runner failed:", err);
	process.exit(1);
});
