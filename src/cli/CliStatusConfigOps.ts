import { join } from "node:path";
import type { DstIO, DstStat } from "../dst/DstIO";
import { ConfigManager } from "../config/ConfigManager";
import { IntelligentConfigMerger } from "../config/IntelligentConfigMerger";
import { MetadataManager } from "../metadata/MetadataManager";
import { PublicationStatus } from "../types/metadata";

/**
 * IO-parameterized implementations of the CLI `status` (directory mode) and
 * `config --set` IO paths, seated on the DstIO seam (TASK-035).
 *
 * Design mirrors {@link ../dependencies/DependencyManager}: every function takes
 * an OPTIONAL `io?: DstIO`. When present, all filesystem access goes through the
 * injected IO (deterministic simulation); when absent it falls back to `node:fs`
 * exactly as the legacy static helpers did. This keeps production behavior
 * unchanged while making the IO paths simulatable under {@link ../dst/MockDstIO}.
 */

// ---------------------------------------------------------------------------
// IO helpers (DstIO-first with node:fs fallback — the DependencyManager pattern)
// ---------------------------------------------------------------------------

function ioReaddir(dir: string, io?: DstIO): string[] {
  if (io) {
    return io.readdir(dir);
  }
  const { readdirSync } = require("node:fs");
  return readdirSync(dir);
}

function ioStat(path: string, io?: DstIO): DstStat {
  if (io) {
    return io.stat(path);
  }
  const { statSync } = require("node:fs");
  const stats = statSync(path);
  return {
    isFile: () => stats.isFile(),
    isDirectory: () => stats.isDirectory(),
    isSymbolicLink: () => stats.isSymbolicLink(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
}

function ioReadFile(path: string, io?: DstIO): string {
  if (io) {
    return io.readFile(path);
  }
  const { readFileSync } = require("node:fs");
  return readFileSync(path, "utf-8");
}

function ioExists(path: string, io?: DstIO): boolean {
  if (io) {
    return io.exists(path);
  }
  const { existsSync } = require("node:fs");
  return existsSync(path);
}

function ioWriteFile(path: string, content: string, io?: DstIO): void {
  if (io) {
    io.writeFile(path, content);
    return;
  }
  const { writeFileSync } = require("node:fs");
  writeFileSync(path, content, "utf-8");
}

// ---------------------------------------------------------------------------
// status — directory scan
// ---------------------------------------------------------------------------

/** An entry may be descended into during a recursive scan. */
function isRecursable(entry: string): boolean {
  return !entry.startsWith(".") && entry !== "node_modules" && entry !== "dist";
}

/**
 * Recursively (or top-level only) collect markdown file paths under `dir`.
 *
 * Behavioral parity with the legacy `EnhancedCommands.findMarkdownFiles`:
 * dot-directories, `node_modules` and `dist` are skipped, only `*.md` (case
 * insensitive) files are collected, and the result is lexicographically sorted
 * for DETERMINISM (readdir order is not guaranteed across platforms / IO backends).
 *
 * @param dir Directory to scan
 * @param opts.recursive Whether to descend into subdirectories
 * @param io Optional DstIO seam (falls back to node:fs)
 * @returns Sorted array of markdown file paths
 */
export function scanMarkdownFiles(
  dir: string,
  opts: { recursive: boolean },
  io?: DstIO
): string[] {
  const { recursive } = opts;
  const files: string[] = [];

  let entries: string[];
  try {
    entries = ioReaddir(dir, io);
  } catch {
    console.warn(`Warning: Could not read directory ${dir}`);
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const isMd = entry.toLowerCase().endsWith(".md");

    let stat: DstStat | undefined;
    try {
      stat = ioStat(fullPath, io);
    } catch {
      // Real fs: an inaccessible entry — warn and skip (legacy behavior).
      if (!io) {
        console.warn(`Warning: Could not access ${fullPath}`);
        continue;
      }
      // DstIO (e.g. MockDstIO flat virtual FS): directories are not stat-able
      // and throw; fall through to the directory-probe branch below.
      stat = undefined;
    }

    if (stat) {
      if (stat.isDirectory()) {
        if (recursive && isRecursable(entry)) {
          files.push(...scanMarkdownFiles(fullPath, { recursive }, io));
        }
      } else if (stat.isFile() && isMd) {
        files.push(fullPath);
      }
      continue;
    }

    // io-path with an un-stat-able entry (virtual directory): a non-.md entry is
    // treated as a directory candidate and descended into when recursion is on.
    if (!isMd && recursive && isRecursable(entry)) {
      files.push(...scanMarkdownFiles(fullPath, { recursive }, io));
    }
  }

  return files.sort();
}

// ---------------------------------------------------------------------------
// status — per-file classification
// ---------------------------------------------------------------------------

/**
 * Compute the publication status (and URL, if any) for a single markdown file.
 *
 * Classification replicates {@link ../dependencies/DependencyManager} `createNode`
 * dstIO branch AS THE CANONICAL PRECEDENT: read content, then
 *   parseMetadata + validateMetadata → PUBLISHED
 *   parsed but invalid                → METADATA_CORRUPTED
 *   no metadata block                 → NOT_PUBLISHED
 *   read failure (missing/unreadable) → METADATA_MISSING
 * Both classification sites (this and DependencyManager) MUST behave identically.
 *
 * @param filePath Absolute path to a markdown file
 * @param io Optional DstIO seam (falls back to node:fs)
 */
export function computeFileStatus(
  filePath: string,
  io?: DstIO
): { status: PublicationStatus; url?: string } {
  try {
    const content = ioReadFile(filePath, io);
    const parsed = MetadataManager.parseMetadata(content);
    if (parsed && MetadataManager.validateMetadata(parsed)) {
      return { status: PublicationStatus.PUBLISHED, url: parsed.telegraphUrl };
    } else if (parsed && !MetadataManager.validateMetadata(parsed)) {
      return { status: PublicationStatus.METADATA_CORRUPTED };
    } else {
      return { status: PublicationStatus.NOT_PUBLISHED };
    }
  } catch {
    return { status: PublicationStatus.METADATA_MISSING };
  }
}

// ---------------------------------------------------------------------------
// config --set
// ---------------------------------------------------------------------------

/** A validated assignment produced by `EnhancedCommands.parseConfigSet`. */
export interface ConfigSetAssignment {
  path: string;
  value: string | number | boolean;
  display: string;
  sensitive: boolean;
}

/** A record of one applied config-set field (for handler display output). */
export interface AppliedConfigSetItem {
  key: string;
  display: string;
  sensitive: boolean;
}

/**
 * Fold validated `--set` assignments into a config-updates partial.
 *
 * Extracted VERBATIM from the former `EnhancedCommands.handleConfigCommand`
 * inline loop (the narrow, per-path nested-object merge). This is intentionally
 * NOT a generic deep-merge and does NOT use `IntelligentConfigMerger.deepMerge`:
 * the only nested paths here are the whitelisted, already-validated
 * `rateLimiting.*` and `customFields.*` keys, so a bespoke generic merger would
 * add surface with no benefit. `IntelligentConfigMerger.deepMerge` remains the
 * single generic merge, reserved for hierarchical config loading.
 *
 * @param current The current (loaded) config — used only to preserve sibling
 *   fields of the nested `rateLimiting` / `customFields` objects
 * @param assignments Validated assignments from `parseConfigSet`
 */
export function mergeConfigSetAssignments(
  current: { rateLimiting?: Record<string, unknown>; customFields?: Record<string, unknown> },
  assignments: ConfigSetAssignment[]
): { updates: Record<string, unknown>; applied: AppliedConfigSetItem[] } {
  const updates: Record<string, unknown> = {};
  const applied: AppliedConfigSetItem[] = [];

  for (const a of assignments) {
    if (a.path.startsWith("rateLimiting.")) {
      const sub = a.path.slice("rateLimiting.".length);
      updates.rateLimiting = updates.rateLimiting || {
        ...(current.rateLimiting || ConfigManager.DEFAULT_CONFIG.rateLimiting),
      };
      (updates.rateLimiting as Record<string, unknown>)[sub] = a.value;
    } else if (a.path.startsWith("customFields.")) {
      const sub = a.path.slice("customFields.".length);
      updates.customFields = updates.customFields || { ...(current.customFields || {}) };
      (updates.customFields as Record<string, unknown>)[sub] = a.value;
    } else {
      updates[a.path] = a.value;
    }
    applied.push({ key: a.path, display: a.display, sensitive: a.sensitive });
  }

  return { updates, applied };
}

/**
 * Load the single-directory config the EXACT way {@link ConfigManager.loadConfig}
 * (→ `loadHierarchicalConfigSync`) does — read the local
 * `.telegraph-publisher-config.json`, `IntelligentConfigMerger.deepMerge` it over
 * a fresh `DEFAULT_CONFIG`, and fall back to `DEFAULT_CONFIG` when the file is
 * absent or unparseable — but routed through the DstIO seam.
 *
 * This is kept in DELIBERATE lock-step with `ConfigManager.loadConfig` (not a
 * refactor of it: the plan forbids touching ConfigManager) so the production
 * `config --set` write path is byte-for-byte identical to the legacy
 * `loadConfig`/`updateMetadataConfig` path while becoming simulatable. The
 * deepMerge's `🔧 Config override` diagnostics and the parse-failure
 * `console.warn` are reproduced verbatim so console output is unchanged.
 *
 * @param dir Directory containing the config file
 * @param io Optional DstIO seam (falls back to node:fs)
 */
function loadConfigLikeManager(dir: string, io?: DstIO): Record<string, unknown> {
  const configPath = join(dir, ".telegraph-publisher-config.json");
  if (ioExists(configPath, io)) {
    try {
      const parsed = JSON.parse(ioReadFile(configPath, io)) as Record<string, unknown>;
      return IntelligentConfigMerger.deepMerge(
        { ...ConfigManager.DEFAULT_CONFIG } as Record<string, any>,
        parsed
      );
    } catch (error) {
      // Verbatim parity with ConfigManager.loadHierarchicalConfigSync's catch.
      console.warn(`Failed to parse config file ${configPath}:`, error);
    }
  }
  return { ...ConfigManager.DEFAULT_CONFIG } as Record<string, unknown>;
}

/**
 * Apply `--set key=value` pairs (and any `extraAssignments` folded from the
 * non-`--set` config flags) to `.telegraph-publisher-config.json` in `dir`,
 * routed through the DstIO seam.
 *
 * This is the PRODUCTION `config --set` write path (called by
 * `EnhancedCommands.handleConfigCommand`). It reproduces the legacy
 * handler + `ConfigManager.saveConfig` behavior EXACTLY, only seated on `io`:
 *   1. Load #1 — `loadConfigLikeManager` (mirrors the handler's
 *      `current = ConfigManager.loadConfig(dir)`), consulted only when there are
 *      `--set` pairs, exactly as the legacy `if (setPairs.length > 0)` guard did.
 *   2. Fold the combined assignments (`--set` pairs first, then the flag-derived
 *      `extraAssignments`) via {@link mergeConfigSetAssignments}.
 *   3. Load #2 + shallow spread + write — mirrors `saveConfig`'s
 *      `existingConfig = loadConfig(dir); { ...existingConfig, ...updates }` +
 *      `writeFileSync`.
 * The two loads (and hence the doubled deepMerge override diagnostics) are
 * intentional: they match the legacy path's twin `loadConfig` calls so console
 * AND file output are byte-for-byte identical. Pure of the handler's own
 * user-facing messages (the CLI handler owns the `✅`/`📝` block).
 *
 * @param dir Directory containing the config file
 * @param pairs Raw `--set key=value` strings from the CLI
 * @param io Optional DstIO seam (falls back to node:fs)
 * @param extraAssignments Pre-validated assignments folded from the other config
 *   flags (`--username`/`--github-token`/`--max-depth`/`--auto-deps`), appended
 *   after the `--set` pairs so the applied-field order matches the legacy handler
 * @returns The applied field list, the resolved config path, and the written config
 */
export function applyConfigSet(
  dir: string,
  pairs: string[],
  io?: DstIO,
  extraAssignments?: ConfigSetAssignment[]
): { applied: AppliedConfigSetItem[]; configPath: string; config: Record<string, unknown> } {
  const configPath = join(dir, ".telegraph-publisher-config.json");

  // Validate + type the pairs against the whitelist. Loaded at call time to
  // avoid a static import cycle with EnhancedCommands.
  const { EnhancedCommands } = require("./EnhancedCommands") as typeof import("./EnhancedCommands");
  const { assignments } = EnhancedCommands.parseConfigSet(pairs);
  const allAssignments =
    extraAssignments && extraAssignments.length > 0
      ? [...assignments, ...extraAssignments]
      : assignments;

  // Load #1 — only when there are --set pairs (legacy `if (setPairs.length > 0)`).
  // Used for nested rateLimiting/customFields sibling preservation. Flag-only
  // updates are all top-level, so the legacy path never loaded here (and emitted
  // no override diagnostics); we preserve that by passing an empty base.
  const current: Record<string, unknown> =
    pairs.length > 0 ? loadConfigLikeManager(dir, io) : {};

  const { updates, applied } = mergeConfigSetAssignments(
    current as { rateLimiting?: Record<string, unknown>; customFields?: Record<string, unknown> },
    allAssignments
  );

  // Load #2 + shallow-merge + write — verbatim parity with ConfigManager.saveConfig.
  const existingConfig = loadConfigLikeManager(dir, io);
  const merged: Record<string, unknown> = { ...existingConfig, ...updates };
  ioWriteFile(configPath, JSON.stringify(merged, null, 2), io);

  return { applied, configPath, config: merged };
}
