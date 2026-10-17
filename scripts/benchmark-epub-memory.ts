#!/usr/bin/env bun
/**
 * scripts/benchmark-epub-memory.ts - Separate-process EPUB Memory Benchmark (Plan §7.3).
 *
 * Spawns isolated `bun src/cli.ts epub ...` processes on generated Russian corpora
 * and measures peak RSS using `/usr/bin/time -l` (macOS) or `/usr/bin/time -v` (Linux).
 *
 * CLI: bun scripts/benchmark-epub-memory.ts [--output-dir <dir>] [--sizes-mib <20,80>] [--repeat <3>] [--quick]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { arch, cpus, platform } from "node:os";
import { join, resolve } from "node:path";

interface BenchmarkRunResult {
	runIndex: number;
	exitCode: number;
	elapsedMs: number;
	peakRssBytes: number;
	outputBytes: number;
	outputSha256: string;
	error?: string;
}

interface SizeBenchmarkResult {
	sizeMiB: number;
	inputFile: string;
	inputBytes: number;
	runs: BenchmarkRunResult[];
	medianRssBytes: number;
	medianElapsedMs: number;
	consistentSha256: boolean;
}

interface BenchmarkSuiteReport {
	timestamp: string;
	platform: string;
	arch: string;
	cpuCount: number;
	bunVersion: string;
	outputDir: string;
	results: SizeBenchmarkResult[];
}

function parseArgs() {
	const args = process.argv.slice(2);
	let outputDir = "/tmp/TASK-047-memory";
	let sizesMiB = [20, 80];
	let repeat = 3;
	let quick = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--output-dir" && args[i + 1]) {
			outputDir = args[++i];
		} else if (arg === "--sizes-mib" && args[i + 1]) {
			sizesMiB = args[++i].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
		} else if (arg === "--repeat" && args[i + 1]) {
			repeat = Number(args[++i]) || 3;
		} else if (arg === "--quick") {
			quick = true;
		}
	}

	if (quick) {
		sizesMiB = [1, 2];
		repeat = 1;
	}

	return { outputDir, sizesMiB, repeat };
}

async function generateRussianCorpus(filePath: string, targetBytes: number): Promise<number> {
	if (existsSync(filePath) && statSync(filePath).size >= targetBytes) {
		return statSync(filePath).size;
	}

	console.log(`Generating Russian corpus: ${filePath} (~${Math.round(targetBytes / (1024 * 1024))} MiB)...`);
	const out = createWriteStream(filePath, { encoding: "utf-8" });

	let bytesWritten = 0;
	let headingIndex = 1;

	const intro = `# Большая Бенчмарк-Книга Философии\n\nЭто корпус для измерения потоковой обработки и пикового потребления памяти.\n\n`;
	out.write(intro);
	bytesWritten += Buffer.byteLength(intro, "utf-8");

	const sampleParagraphs = [
		"Вайшнавская веданта представляет собой гармоничный синтез глубокого философского размышления и практической преданности. " +
			"Каждый стих несёт в себе многогранный смысл, раскрывающий природу души, Абсолютной Истины и вечной связи между ними. ",
		"Санскритские термины требуют особенно точного контекстуального анализа, чтобы избежать искажения при переводе. " +
			"Ачарьи древности оставили обширные комментарии, детально разъясняющие логику построения каждого философского силлогизма. ",
		"дхарма-кшетре куру-кшетре самвета йуйутсавах | \nмамках пандаваш чайва ким акурвата санджайа || \n",
		"Практическое применение философии охватывает все уровни человеческого бытия: мировоззрение, этику отношений и ежедневную садхану. ",
	];

	while (bytesWritten < targetBytes) {
		const heading = `\n## Раздел ${headingIndex}\n\n`;
		out.write(heading);
		bytesWritten += Buffer.byteLength(heading, "utf-8");
		headingIndex++;

		for (const para of sampleParagraphs) {
			const text = `${para}\n\n`;
			out.write(text);
			bytesWritten += Buffer.byteLength(text, "utf-8");
			if (bytesWritten >= targetBytes) break;
		}
	}

	await new Promise<void>((resolve, reject) => {
		out.end((err) => {
			if (err) reject(err);
			else resolve();
		});
	});

	const finalSize = statSync(filePath).size;
	console.log(`Corpus ready: ${filePath} (${finalSize} bytes)`);
	return finalSize;
}

function runMeasurement(
	inputFile: string,
	outputFile: string,
	reportFile: string,
	runIndex: number,
): BenchmarkRunResult {
	const startTime = Date.now();
	let peakRssBytes = 0;

	// Use /usr/bin/time on macOS or Linux
	const isMac = platform() === "darwin";
	const timeCmd = isMac ? ["/usr/bin/time", "-l"] : ["/usr/bin/time", "-v"];

	const bunArgs = [
		"src/cli.ts",
		"epub",
		"-f",
		inputFile,
		"-o",
		outputFile,
		"-t",
		"Bench Book",
		"-a",
		"Bench Author",
		"--no-with-dependencies",
		"--epub-report",
		reportFile,
	];

	const child = spawnSync(timeCmd[0], [...timeCmd.slice(1), "bun", ...bunArgs], {
		encoding: "utf-8",
		env: {
			...process.env,
			SOURCE_DATE_EPOCH: "1700000000",
		},
		maxBuffer: 50 * 1024 * 1024,
	});

	const elapsedMs = Date.now() - startTime;
	const stderr = child.stderr || "";

	if (isMac) {
		// Example: "  9388032  maximum resident set size"
		const match = stderr.match(/(\d+)\s+maximum resident set size/);
		if (match && match[1]) {
			peakRssBytes = Number(match[1]);
		}
	} else {
		// Linux: "Maximum resident set size (kbytes): 12345"
		const match = stderr.match(/Maximum resident set size \(kbytes\):\s+(\d+)/i);
		if (match && match[1]) {
			peakRssBytes = Number(match[1]) * 1024;
		}
	}

	let outputBytes = 0;
	let outputSha256 = "";
	if (existsSync(outputFile)) {
		const outBuf = readFileSync(outputFile);
		outputBytes = outBuf.length;
		outputSha256 = createHash("sha256").update(outBuf).digest("hex");
	}

	return {
		runIndex,
		exitCode: child.status ?? -1,
		elapsedMs,
		peakRssBytes,
		outputBytes,
		outputSha256,
		error: child.status !== 0 ? stderr.slice(0, 500) : undefined,
	};
}

async function main() {
	const { outputDir, sizesMiB, repeat } = parseArgs();
	mkdirSync(outputDir, { recursive: true });

	console.log("=== EPUB Memory Benchmark (Plan §7.3) ===");
	console.log(`Output Directory: ${outputDir}`);
	console.log(`Sizes: ${sizesMiB.join(", ")} MiB, Repeat: ${repeat}x`);

	const results: SizeBenchmarkResult[] = [];

	for (const sizeMiB of sizesMiB) {
		const targetBytes = sizeMiB * 1024 * 1024;
		const corpusFile = join(outputDir, `corpus-${sizeMiB}MiB.md`);
		const actualBytes = await generateRussianCorpus(corpusFile, targetBytes);

		const runs: BenchmarkRunResult[] = [];

		for (let r = 1; r <= repeat; r++) {
			console.log(`[${sizeMiB} MiB] Run ${r}/${repeat}...`);
			const outEpub = join(outputDir, `bench-${sizeMiB}MiB-run${r}.epub`);
			const reportPath = join(outputDir, `bench-${sizeMiB}MiB-report${r}.json`);

			const result = runMeasurement(corpusFile, outEpub, reportPath, r);
			runs.push(result);

			const rssMb = (result.peakRssBytes / (1024 * 1024)).toFixed(2);
			console.log(
				`  Run ${r}: exit=${result.exitCode}, elapsed=${result.elapsedMs}ms, peakRSS=${rssMb} MiB, out=${result.outputBytes} bytes`,
			);
		}

		// Compute medians
		const sortedRss = [...runs.map((r) => r.peakRssBytes)].sort((a, b) => a - b);
		const sortedElapsed = [...runs.map((r) => r.elapsedMs)].sort((a, b) => a - b);
		const mid = Math.floor(sortedRss.length / 2);
		const medianRssBytes = sortedRss[mid] ?? 0;
		const medianElapsedMs = sortedElapsed[mid] ?? 0;

		const hashes = new Set(runs.map((r) => r.outputSha256).filter(Boolean));
		const consistentSha256 = hashes.size === 1;

		results.push({
			sizeMiB,
			inputFile: corpusFile,
			inputBytes: actualBytes,
			runs,
			medianRssBytes,
			medianElapsedMs,
			consistentSha256,
		});
	}

	const suiteReport: BenchmarkSuiteReport = {
		timestamp: new Date().toISOString(),
		platform: platform(),
		arch: arch(),
		cpuCount: cpus().length,
		bunVersion: process.version,
		outputDir: resolve(outputDir),
		results,
	};

	const reportJsonPath = join(outputDir, "memory-benchmark-report.json");
	writeFileSync(reportJsonPath, JSON.stringify(suiteReport, null, 2), "utf-8");

	console.log("\n=== Benchmark Summary ===");
	for (const res of results) {
		const rssMb = (res.medianRssBytes / (1024 * 1024)).toFixed(2);
		console.log(
			`- ${res.sizeMiB} MiB Corpus: Median Peak RSS: ${rssMb} MiB, Median Time: ${res.medianElapsedMs} ms, Deterministic SHA: ${res.consistentSha256}`,
		);
	}
	console.log(`\nDetailed report written to: ${reportJsonPath}`);
}

main().catch((err) => {
	console.error("Benchmark failed:", err);
	process.exit(1);
});
