import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockDstIO } from "../dst/MockDstIO";
import { PublicationStatus } from "../types/metadata";
import {
  applyConfigSet,
  computeFileStatus,
  type ConfigSetAssignment,
  scanMarkdownFiles,
} from "./CliStatusConfigOps";
import { EnhancedCommands } from "./EnhancedCommands";

/**
 * Deterministic simulation tests (TASK-035, CD-63) for the DstIO-seated CLI
 * `status` (directory mode) and `config --set` IO paths. All filesystem access
 * is routed through MockDstIO (seed 42) — no real fs, no wall clock.
 */

const ROOT = "/proj";

const PUBLISHED_MD = `---
telegraphUrl: "https://telegra.ph/Test-01-01"
editPath: "Test-01-01"
username: "Jane"
publishedAt: "2026-01-01T00:00:00.000Z"
originalFilename: "pub.md"
contentHash: "abc123"
title: "Test"
---
# Hello
`;

// Present metadata block, but missing required fields + invalid URL → corrupted.
const CORRUPTED_MD = `---
telegraphUrl: "not-a-valid-url"
username: "Jane"
---
# Broken
`;

const PLAIN_MD = `# no metadata
`;

/** Seed a canonical in-memory tree covering the scan-reachable statuses. */
function seedTree(io: MockDstIO): void {
  io.addFile(`${ROOT}/pub.md`, PUBLISHED_MD);
  io.addFile(`${ROOT}/plain.md`, PLAIN_MD);
  io.addFile(`${ROOT}/broken.md`, CORRUPTED_MD);
  io.addFile(`${ROOT}/sub/nested.md`, PLAIN_MD);
  io.addFile(`${ROOT}/node_modules/skip.md`, PLAIN_MD);
  io.addFile(`${ROOT}/dist/skip.md`, PLAIN_MD);
  io.addFile(`${ROOT}/.hidden/secret.md`, PLAIN_MD);
}

/** Summarize a file list the way handleStatusCommand's directory loop does. */
function summarize(files: string[], io: MockDstIO): Record<PublicationStatus, number> {
  const counts: Record<PublicationStatus, number> = {
    [PublicationStatus.PUBLISHED]: 0,
    [PublicationStatus.NOT_PUBLISHED]: 0,
    [PublicationStatus.METADATA_CORRUPTED]: 0,
    [PublicationStatus.METADATA_MISSING]: 0,
  };
  for (const file of files) {
    const { status } = computeFileStatus(file, io);
    counts[status] += 1;
  }
  return counts;
}

describe("scanMarkdownFiles (DstIO)", () => {
  let io: MockDstIO;

  beforeEach(() => {
    io = new MockDstIO(42);
    seedTree(io);
  });

  it("lists only top-level .md files when non-recursive, skipping virtual dirs", () => {
    const files = scanMarkdownFiles(ROOT, { recursive: false }, io);
    expect(files).toEqual([
      `${ROOT}/broken.md`,
      `${ROOT}/plain.md`,
      `${ROOT}/pub.md`,
    ]);
  });

  it("descends into subdirectories when recursive, still skipping node_modules and dot-dirs", () => {
    const files = scanMarkdownFiles(ROOT, { recursive: true }, io);
    expect(files).toEqual([
      `${ROOT}/broken.md`,
      `${ROOT}/plain.md`,
      `${ROOT}/pub.md`,
      `${ROOT}/sub/nested.md`,
    ]);
    expect(files).not.toContain(`${ROOT}/node_modules/skip.md`);
    expect(files).not.toContain(`${ROOT}/.hidden/secret.md`);
  });

  it("excludes the dist/ build output directory on a recursive scan (F-QA3)", () => {
    // Parity with `isRecursable`: dist is treated exactly like node_modules —
    // never descended into during a recursive scan, so a markdown file that
    // lives under a build-output dir is never reported as a source doc.
    const files = scanMarkdownFiles(ROOT, { recursive: true }, io);
    expect(files).not.toContain(`${ROOT}/dist/skip.md`);
    // Sanity: the sibling real subdir IS still descended into, so the exclusion
    // is specific to dist and not an accidental "no subdirs descended" pass.
    expect(files).toContain(`${ROOT}/sub/nested.md`);
  });

  it("returns sorted output regardless of insertion order", () => {
    const io2 = new MockDstIO(42);
    // Insert in reverse/arbitrary order.
    io2.addFile(`${ROOT}/zebra.md`, PLAIN_MD);
    io2.addFile(`${ROOT}/alpha.md`, PLAIN_MD);
    io2.addFile(`${ROOT}/mango.md`, PLAIN_MD);
    const files = scanMarkdownFiles(ROOT, { recursive: false }, io2);
    expect(files).toEqual([
      `${ROOT}/alpha.md`,
      `${ROOT}/mango.md`,
      `${ROOT}/zebra.md`,
    ]);
  });
});

describe("computeFileStatus (DstIO) — all four statuses", () => {
  let io: MockDstIO;

  beforeEach(() => {
    io = new MockDstIO(42);
    seedTree(io);
  });

  it("PUBLISHED with URL for valid front-matter", () => {
    const { status, url } = computeFileStatus(`${ROOT}/pub.md`, io);
    expect(status).toBe(PublicationStatus.PUBLISHED);
    expect(url).toBe("https://telegra.ph/Test-01-01");
  });

  it("NOT_PUBLISHED for a file without a metadata block", () => {
    const { status, url } = computeFileStatus(`${ROOT}/plain.md`, io);
    expect(status).toBe(PublicationStatus.NOT_PUBLISHED);
    expect(url).toBeUndefined();
  });

  it("METADATA_CORRUPTED for a present-but-invalid metadata block", () => {
    const { status } = computeFileStatus(`${ROOT}/broken.md`, io);
    expect(status).toBe(PublicationStatus.METADATA_CORRUPTED);
  });

  it("METADATA_MISSING when io.readFile throws (file listed but unreadable/absent)", () => {
    // Honest simulation: read a path absent from the mock fs — io.readFile
    // throws a DstError, exactly the DependencyManager catch → METADATA_MISSING.
    const { status } = computeFileStatus(`${ROOT}/vanished.md`, io);
    expect(status).toBe(PublicationStatus.METADATA_MISSING);
  });
});

describe("status summary (DstIO) — counts across all four statuses", () => {
  it("counts scan-reachable statuses plus a missing file", () => {
    const io = new MockDstIO(42);
    seedTree(io);
    const files = scanMarkdownFiles(ROOT, { recursive: true }, io);
    // Append a path present in a listing snapshot but no longer readable.
    const withMissing = [...files, `${ROOT}/vanished.md`];
    const counts = summarize(withMissing, io);
    expect(counts).toEqual({
      [PublicationStatus.PUBLISHED]: 1,
      [PublicationStatus.NOT_PUBLISHED]: 2, // plain.md + sub/nested.md
      [PublicationStatus.METADATA_CORRUPTED]: 1,
      [PublicationStatus.METADATA_MISSING]: 1,
    });
  });
});

describe("applyConfigSet (DstIO)", () => {
  let io: MockDstIO;

  beforeEach(() => {
    io = new MockDstIO(42);
  });

  it("preserves sibling fields when updating a nested rateLimiting key", () => {
    io.addFile(
      `${ROOT}/.telegraph-publisher-config.json`,
      JSON.stringify({
        defaultUsername: "Jane",
        rateLimiting: {
          baseDelayMs: 1500,
          maxRetries: 3,
          backoffStrategy: "linear",
        },
      })
    );

    const { config, configPath } = applyConfigSet(
      ROOT,
      ["rateLimiting.baseDelayMs=2000"],
      io
    );

    expect(configPath).toBe(`${ROOT}/.telegraph-publisher-config.json`);
    // Updated field applied.
    expect((config.rateLimiting as any).baseDelayMs).toBe(2000);
    // Sibling nested fields preserved.
    expect((config.rateLimiting as any).maxRetries).toBe(3);
    expect((config.rateLimiting as any).backoffStrategy).toBe("linear");
    // Unrelated top-level field preserved.
    expect(config.defaultUsername).toBe("Jane");

    // Persisted to the mock fs.
    const written = JSON.parse(io.readFile(`${ROOT}/.telegraph-publisher-config.json`));
    expect(written.rateLimiting.baseDelayMs).toBe(2000);
    expect(written.rateLimiting.maxRetries).toBe(3);
    expect(written.defaultUsername).toBe("Jane");
  });

  it("creates config from scratch when none exists", () => {
    const { config } = applyConfigSet(ROOT, ["defaultUsername=Neo"], io);
    expect(config.defaultUsername).toBe("Neo");
    expect(io.exists(`${ROOT}/.telegraph-publisher-config.json`)).toBe(true);
  });

  it("merges customFields.<name> preserving existing custom fields", () => {
    io.addFile(
      `${ROOT}/.telegraph-publisher-config.json`,
      JSON.stringify({ customFields: { project: "demo", keep: "me" } })
    );
    const { config } = applyConfigSet(ROOT, ["customFields.project=updated"], io);
    expect((config.customFields as any).project).toBe("updated");
    expect((config.customFields as any).keep).toBe("me");
  });

  it("rejects secret token keys (does not write)", () => {
    expect(() => applyConfigSet(ROOT, ["accessToken=SECRET"], io)).toThrow(/--token/);
    expect(io.exists(`${ROOT}/.telegraph-publisher-config.json`)).toBe(false);
  });

  it("rejects unknown keys (does not write)", () => {
    expect(() => applyConfigSet(ROOT, ["bogusKey=1"], io)).toThrow(/Unknown config key/);
    expect(io.exists(`${ROOT}/.telegraph-publisher-config.json`)).toBe(false);
  });
});

describe("applyConfigSet (DstIO) — production path (handleConfigCommand parity)", () => {
  const CONFIG = `${ROOT}/.telegraph-publisher-config.json`;
  let io: MockDstIO;

  beforeEach(() => {
    io = new MockDstIO(42);
  });

  it("merges DEFAULT_CONFIG into the written file (matches ConfigManager.loadConfig semantics)", () => {
    // The legacy production path writes the FULL default-merged config, not a
    // sparse partial. The DstIO-seated path must do the same, else it diverges
    // from the ConfigManager.loadConfig/updateMetadataConfig bytes.
    const { config } = applyConfigSet(ROOT, ["maxDependencyDepth=7", "customFields.foo=bar"], io);

    expect(config.maxDependencyDepth).toBe(7);
    // Full default scaffold is present (not just the set keys).
    expect(config.autoPublishDependencies).toBe(true);
    expect(config.replaceLinksinContent).toBe(true);
    expect(config.createBackups).toBe(false);
    expect(config.manageBidirectionalLinks).toBe(true);
    expect(config.autoSyncCache).toBe(true);
    // The whole default rateLimiting block is materialized.
    expect(config.rateLimiting).toEqual({
      baseDelayMs: 1500,
      adaptiveMultiplier: 2,
      maxDelayMs: 30000,
      backoffStrategy: "linear",
      maxRetries: 3,
      cooldownPeriodMs: 60000,
      enableAdaptiveThrottling: true,
    });
    expect((config.customFields as any).foo).toBe("bar");
  });

  it("folds the non---set flags (extraAssignments) into the SAME single write, legacy applied order", () => {
    // Mirrors handleConfigCommand: --set pairs first, then the flag-derived
    // assignments (--username / --max-depth here), all in one write.
    const extra: ConfigSetAssignment[] = [
      { path: "defaultUsername", value: "NewUser", display: "NewUser", sensitive: false },
      { path: "maxDependencyDepth", value: 12, display: "12", sensitive: false },
    ];
    const { applied, config } = applyConfigSet(
      ROOT,
      ["rateLimiting.baseDelayMs=2500", "customFields.foo=bar"],
      io,
      extra
    );

    // Applied order: set pairs, then flags.
    expect(applied.map((a) => a.key)).toEqual([
      "rateLimiting.baseDelayMs",
      "customFields.foo",
      "defaultUsername",
      "maxDependencyDepth",
    ]);
    expect(config.defaultUsername).toBe("NewUser");
    expect(config.maxDependencyDepth).toBe(12);
    expect((config.rateLimiting as any).baseDelayMs).toBe(2500);
    expect((config.customFields as any).foo).toBe("bar");

    // Exactly one write landed for the whole combined update.
    const writes = io.ops.filter((o) => o.kind === "writeFile" && o.path === CONFIG);
    expect(writes.length).toBe(1);
  });

  it("is BYTE-FOR-BYTE identical to the legacy fs write (rich combined scenario)", () => {
    // Same inputs and seed as the fs before/after smoke: an existing config with
    // accessToken + partial rateLimiting + a custom field, then a combined
    // --set rateLimiting.baseDelayMs=2500 --set customFields.foo=bar
    // --username NewUser --max-depth 12.
    io.addFile(
      CONFIG,
      JSON.stringify({
        accessToken: "SECRET-TOKEN-abcdef",
        defaultUsername: "OldUser",
        rateLimiting: { baseDelayMs: 1000, maxRetries: 5 },
        customFields: { keep: "me" },
      })
    );

    const extra: ConfigSetAssignment[] = [
      { path: "defaultUsername", value: "NewUser", display: "NewUser", sensitive: false },
      { path: "maxDependencyDepth", value: 12, display: "12", sensitive: false },
    ];
    applyConfigSet(ROOT, ["rateLimiting.baseDelayMs=2500", "customFields.foo=bar"], io, extra);

    const written = io.readFile(CONFIG);
    // Byte-for-byte snapshot captured from the real `bun src/cli.ts config ...`
    // run through ConfigManager.loadConfig/updateMetadataConfig (fs path).
    const expected = `{
  "defaultUsername": "NewUser",
  "autoPublishDependencies": true,
  "replaceLinksinContent": true,
  "maxDependencyDepth": 12,
  "createBackups": false,
  "manageBidirectionalLinks": true,
  "autoSyncCache": true,
  "rateLimiting": {
    "baseDelayMs": 2500,
    "adaptiveMultiplier": 2,
    "maxDelayMs": 30000,
    "backoffStrategy": "linear",
    "maxRetries": 5,
    "cooldownPeriodMs": 60000,
    "enableAdaptiveThrottling": true
  },
  "customFields": {
    "keep": "me",
    "foo": "bar"
  },
  "accessToken": "SECRET-TOKEN-abcdef"
}`;
    expect(written).toBe(expected);
  });

  it("preserves accessToken through the seated write", () => {
    io.addFile(
      CONFIG,
      JSON.stringify({ accessToken: "keep-me-secret", customFields: {} })
    );
    const { config } = applyConfigSet(ROOT, ["maxDependencyDepth=9"], io);
    expect(config.accessToken).toBe("keep-me-secret");
    expect(JSON.parse(io.readFile(CONFIG)).accessToken).toBe("keep-me-secret");
  });

  it("flag-only update (no --set pairs) still writes through the seam", () => {
    const extra: ConfigSetAssignment[] = [
      { path: "defaultUsername", value: "Solo", display: "Solo", sensitive: false },
    ];
    const { applied, config } = applyConfigSet(ROOT, [], io, extra);
    expect(applied.map((a) => a.key)).toEqual(["defaultUsername"]);
    expect(config.defaultUsername).toBe("Solo");
    expect(io.exists(CONFIG)).toBe(true);
  });
});

describe("applyConfigSet (DstIO) — flag glue: githubToken + autoDeps (F-QA2)", () => {
  const CONFIG = `${ROOT}/.telegraph-publisher-config.json`;
  let io: MockDstIO;

  beforeEach(() => {
    io = new MockDstIO(42);
  });

  // NOTE ON HONEST COVERAGE: the ConfigSetAssignment shapes below are a VERBATIM
  // replica of what `EnhancedCommands.handleConfigCommand` builds from the
  // --github-token / --auto-deps flags (see EnhancedCommands.ts ~759-773):
  //   githubToken → { path: "githubToken",              sensitive: true  }
  //   autoDeps    → { path: "autoPublishDependencies",  value: opt === "true" }
  // The production flag→assignment mapping itself is additionally exercised
  // end-to-end (real flag object, no hand-built assignment) by the
  // "handleConfigCommand glue (production mapping)" describe below, so this
  // DstIO layer proves the write/merge behavior and that block proves the glue.

  it("writes a githubToken flag value into the config verbatim (sensitive flag is display-only)", () => {
    const extra: ConfigSetAssignment[] = [
      { path: "githubToken", value: "ghp_secretvalue123", display: "ghp_secretvalue123", sensitive: true },
    ];
    const { applied, config } = applyConfigSet(ROOT, [], io, extra);

    // The sensitive marker governs console masking ONLY; the persisted value is
    // the raw token (config files are the store of record for the credential).
    expect(config.githubToken).toBe("ghp_secretvalue123");
    expect(JSON.parse(io.readFile(CONFIG)).githubToken).toBe("ghp_secretvalue123");
    expect(applied).toEqual([{ key: "githubToken", display: "ghp_secretvalue123", sensitive: true }]);
  });

  it("coerces --auto-deps true/false to a boolean autoPublishDependencies", () => {
    // true → boolean true
    const extraTrue: ConfigSetAssignment[] = [
      { path: "autoPublishDependencies", value: "true" === "true", display: String("true" === "true"), sensitive: false },
    ];
    const t = applyConfigSet(ROOT, [], io, extraTrue);
    expect(t.config.autoPublishDependencies).toBe(true);
    expect(typeof t.config.autoPublishDependencies).toBe("boolean");

    // false → boolean false (fresh io so the write is isolated)
    const io2 = new MockDstIO(42);
    const extraFalse: ConfigSetAssignment[] = [
      { path: "autoPublishDependencies", value: "false" === "true", display: String("false" === "true"), sensitive: false },
    ];
    const f = applyConfigSet(ROOT, [], io2, extraFalse);
    expect(f.config.autoPublishDependencies).toBe(false);
    expect(typeof f.config.autoPublishDependencies).toBe("boolean");
    expect(JSON.parse(io2.readFile(CONFIG)).autoPublishDependencies).toBe(false);
  });

  it("folds --set pairs + githubToken + autoDeps into ONE write, --set-first applied order", () => {
    const extra: ConfigSetAssignment[] = [
      { path: "githubToken", value: "ghp_abcdef", display: "ghp_abcdef", sensitive: true },
      { path: "autoPublishDependencies", value: false, display: "false", sensitive: false },
    ];
    const { applied, config } = applyConfigSet(
      ROOT,
      ["defaultUsername=Neo", "customFields.foo=bar"],
      io,
      extra
    );

    // Applied order: --set pairs first (in order), then the flag-derived extras.
    expect(applied.map((a) => a.key)).toEqual([
      "defaultUsername",
      "customFields.foo",
      "githubToken",
      "autoPublishDependencies",
    ]);
    expect(config.defaultUsername).toBe("Neo");
    expect((config.customFields as any).foo).toBe("bar");
    expect(config.githubToken).toBe("ghp_abcdef");
    expect(config.autoPublishDependencies).toBe(false);

    // Exactly one write landed for the whole combined update.
    const writes = io.ops.filter((o) => o.kind === "writeFile" && o.path === CONFIG);
    expect(writes.length).toBe(1);
  });
});

/**
 * End-to-end glue coverage (F-QA2 / F-QA4): drive the ACTUAL private
 * `handleConfigCommand` with a raw flag-shaped options object (no hand-built
 * assignments) against a throwaway cwd on the real fs. This proves the
 * production flag→ConfigSetAssignment mapping and the flag-validation ORDER,
 * which live inside the handler and cannot be reached through applyConfigSet or
 * the pure parseConfigSet alone.
 */
describe("handleConfigCommand glue (production mapping, real fs) — F-QA2 / F-QA4", () => {
  const CONFIG_NAME = ".telegraph-publisher-config.json";
  let tmp: string;
  let prevCwd: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tp-cfg-glue-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
    logs = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    };
  });

  afterEach(() => {
    console.log = origLog;
    process.chdir(prevCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  /** Invoke the private static async handler with a flag-shaped options object. */
  function runHandler(options: Record<string, unknown>): Promise<void> {
    return (EnhancedCommands as any).handleConfigCommand(options);
  }

  /** Read the config the handler wrote into the throwaway cwd. */
  function readWrittenConfig(): Record<string, unknown> {
    const { readFileSync } = require("node:fs");
    return JSON.parse(readFileSync(join(tmp, CONFIG_NAME), "utf-8"));
  }

  it("maps --github-token to config.githubToken and MASKS it in console output", async () => {
    await runHandler({ githubToken: "ghp_secretvalue123" });

    // Written verbatim to the config store of record.
    expect(readWrittenConfig().githubToken).toBe("ghp_secretvalue123");

    // Applied-settings console line masks the secret (never prints it raw).
    const applied = logs.join("\n");
    expect(applied).toContain("githubToken =");
    expect(applied).not.toContain("ghp_secretvalue123");
    expect(applied).toContain("ghp_...23"); // maskSensitive: first4...last2
  });

  it("maps --auto-deps 'true'/'false' to a boolean autoPublishDependencies", async () => {
    await runHandler({ autoDeps: "true" });
    expect(readWrittenConfig().autoPublishDependencies).toBe(true);

    // Re-run in a fresh throwaway state for the false case.
    rmSync(join(tmp, CONFIG_NAME), { force: true });
    await runHandler({ autoDeps: "false" });
    const cfg = readWrittenConfig();
    expect(cfg.autoPublishDependencies).toBe(false);
    expect(typeof cfg.autoPublishDependencies).toBe("boolean");
  });

  it("routes --set pairs + --username + --github-token + --auto-deps through ONE combined write", async () => {
    await runHandler({
      set: ["customFields.foo=bar"],
      username: "Neo",
      githubToken: "ghp_combined9",
      autoDeps: "false",
    });
    const cfg = readWrittenConfig();
    expect(cfg.defaultUsername).toBe("Neo");
    expect((cfg.customFields as any).foo).toBe("bar");
    expect(cfg.githubToken).toBe("ghp_combined9");
    expect(cfg.autoPublishDependencies).toBe(false);
    // Full default scaffold present (single default-merged write, not a partial).
    expect(cfg.replaceLinksinContent).toBe(true);
    expect(cfg.rateLimiting).toBeDefined();
  });

  it("validates --max-depth range BEFORE parsing --set (F-QA4: max-depth error wins)", async () => {
    // Both flags are invalid: max-depth is out of range AND the --set key is
    // unknown. The handler validates --max-depth (~763) before applyConfigSet
    // runs parseConfigSet (~776), so the range error must surface first — and
    // nothing is written because the throw precedes any config write.
    await expect(
      runHandler({ maxDepth: "999", set: ["bogusKey=1"] })
    ).rejects.toThrow(/Max depth must be a number between 1 and 20/);

    const { existsSync } = require("node:fs");
    expect(existsSync(join(tmp, CONFIG_NAME))).toBe(false);
  });
});

describe("determinism — identical seed yields identical results and order", () => {
  function run(): {
    scan: string[];
    counts: Record<PublicationStatus, number>;
    config: Record<string, unknown>;
  } {
    const io = new MockDstIO(42);
    seedTree(io);
    io.addFile(
      `${ROOT}/.telegraph-publisher-config.json`,
      JSON.stringify({ rateLimiting: { baseDelayMs: 1000, maxRetries: 2 } })
    );
    const scan = scanMarkdownFiles(ROOT, { recursive: true }, io);
    const counts = summarize([...scan, `${ROOT}/vanished.md`], io);
    const { config } = applyConfigSet(ROOT, ["rateLimiting.baseDelayMs=3000"], io);
    return { scan, counts, config };
  }

  it("two runs with the same seed produce identical output", () => {
    const a = run();
    const b = run();
    expect(a.scan).toEqual(b.scan);
    expect(a.counts).toEqual(b.counts);
    expect(a.config).toEqual(b.config);
  });
});
