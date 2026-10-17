import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnhancedCommands } from "./EnhancedCommands";
import { PublicationStatus } from "../types/metadata";

/**
 * Tests for TASK-034 CLI-bug fixes:
 *  1. `config --set <key=value>` parsing/validation (pure parseConfigSet)
 *  2. directory-mode `status` (findMarkdownFiles recursion + computeFileStatus)
 */

// Access private-but-testable static (parseConfigSet is public; describeConfigSetKeys is private)
const parseConfigSet = (pairs: string[]) => EnhancedCommands.parseConfigSet(pairs);

describe("config --set parsing/validation (parseConfigSet)", () => {
  it("accepts a string key (defaultUsername)", () => {
    const { assignments } = parseConfigSet(["defaultUsername=Jane Doe"]);
    expect(assignments).toEqual([
      { path: "defaultUsername", value: "Jane Doe", display: "Jane Doe", sensitive: false }
    ]);
  });

  it("accepts boolean keys with true/false only", () => {
    const { assignments } = parseConfigSet([
      "autoPublishDependencies=false",
      "createBackups=true",
      "manageBidirectionalLinks=false",
      "autoSyncCache=true",
      "replaceLinksinContent=false"
    ]);
    expect(assignments.map(a => a.value)).toEqual([false, true, false, true, false]);
    expect(assignments.every(a => a.path.length > 0)).toBe(true);
  });

  it("rejects a non-boolean value for a boolean key", () => {
    expect(() => parseConfigSet(["autoSyncCache=yes"])).toThrow(/Expected "true" or "false"/);
  });

  it("accepts maxDependencyDepth within range and rejects out-of-range/non-int", () => {
    expect(parseConfigSet(["maxDependencyDepth=7"]).assignments[0]?.value).toBe(7);
    expect(parseConfigSet(["maxDependencyDepth=1"]).assignments[0]?.value).toBe(1);
    expect(parseConfigSet(["maxDependencyDepth=20"]).assignments[0]?.value).toBe(20);
    expect(() => parseConfigSet(["maxDependencyDepth=0"])).toThrow(/between 1 and 20/);
    expect(() => parseConfigSet(["maxDependencyDepth=21"])).toThrow(/between 1 and 20/);
    expect(() => parseConfigSet(["maxDependencyDepth=abc"])).toThrow(/between 1 and 20/);
    expect(() => parseConfigSet(["maxDependencyDepth=5.5"])).toThrow(/between 1 and 20/);
  });

  it("accepts nested rateLimiting numeric fields (>0) and rejects <=0", () => {
    const { assignments } = parseConfigSet(["rateLimiting.baseDelayMs=2000"]);
    expect(assignments[0]).toEqual({
      path: "rateLimiting.baseDelayMs",
      value: 2000,
      display: "2000",
      sensitive: false
    });
    expect(() => parseConfigSet(["rateLimiting.maxRetries=0"])).toThrow(/greater than 0/);
    expect(() => parseConfigSet(["rateLimiting.baseDelayMs=-1"])).toThrow(/greater than 0/);
  });

  it("accepts rateLimiting.backoffStrategy enum and rejects invalid enum", () => {
    expect(parseConfigSet(["rateLimiting.backoffStrategy=exponential"]).assignments[0]?.value).toBe("exponential");
    expect(parseConfigSet(["rateLimiting.backoffStrategy=linear"]).assignments[0]?.value).toBe("linear");
    expect(() => parseConfigSet(["rateLimiting.backoffStrategy=cubic"])).toThrow(/Allowed: linear \| exponential/);
  });

  it("accepts rateLimiting.enableAdaptiveThrottling boolean", () => {
    expect(parseConfigSet(["rateLimiting.enableAdaptiveThrottling=false"]).assignments[0]?.value).toBe(false);
  });

  it("rejects unknown rateLimiting fields", () => {
    expect(() => parseConfigSet(["rateLimiting.bogus=1"])).toThrow(/Unknown rateLimiting field/);
  });

  it("accepts arbitrary customFields.<name> strings", () => {
    const { assignments } = parseConfigSet(["customFields.project=demo"]);
    expect(assignments[0]).toEqual({
      path: "customFields.project",
      value: "demo",
      display: "demo",
      sensitive: false
    });
  });

  it("rejects accessToken and githubToken with a token-flag hint", () => {
    expect(() => parseConfigSet(["accessToken=SECRET"])).toThrow(/--token/);
    expect(() => parseConfigSet(["githubToken=SECRET"])).toThrow(/--github-token/);
  });

  it("rejects unknown keys with the valid-key list", () => {
    expect(() => parseConfigSet(["bogusKey=1"])).toThrow(/Unknown config key/);
  });

  it("rejects malformed pairs (no '=')", () => {
    expect(() => parseConfigSet(["justakey"])).toThrow(/Expected key=value/);
  });

  it("preserves '=' inside values (e.g. base64/url)", () => {
    const { assignments } = parseConfigSet(["customFields.token=a=b=c"]);
    expect(assignments[0]?.value).toBe("a=b=c");
  });

  it("processes multiple pairs in order", () => {
    const { assignments } = parseConfigSet([
      "defaultUsername=Jane",
      "maxDependencyDepth=3",
      "customFields.x=y"
    ]);
    expect(assignments.map(a => a.path)).toEqual([
      "defaultUsername",
      "maxDependencyDepth",
      "customFields.x"
    ]);
  });
});

describe("directory-status helpers (findMarkdownFiles + computeFileStatus)", () => {
  let tmp: string;

  const PUBLISHED_MD = `---
telegraphUrl: "https://telegra.ph/Test-01-01"
editPath: "Test-01-01"
username: "Jane"
publishedAt: "2026-01-01T00:00:00.000Z"
originalFilename: "pub.md"
title: "Test"
---
# Hello
`;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tp-status-"));
    writeFileSync(join(tmp, "pub.md"), PUBLISHED_MD, "utf-8");
    writeFileSync(join(tmp, "plain.md"), "# no metadata\n", "utf-8");
    mkdirSync(join(tmp, "sub"), { recursive: true });
    writeFileSync(join(tmp, "sub", "nested.md"), "# nested\n", "utf-8");
    mkdirSync(join(tmp, "node_modules"), { recursive: true });
    writeFileSync(join(tmp, "node_modules", "skip.md"), "# skip\n", "utf-8");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("lists only top-level .md files when non-recursive, skipping node_modules", async () => {
    const files = await EnhancedCommands.findMarkdownFiles(tmp, false);
    const names = files.map(f => f.replace(tmp + "/", ""));
    expect(names.sort()).toEqual(["plain.md", "pub.md"]);
    expect(names).not.toContain("node_modules/skip.md");
  });

  it("descends into subdirectories when recursive, still skipping node_modules", async () => {
    const files = await EnhancedCommands.findMarkdownFiles(tmp, true);
    const names = files.map(f => f.replace(tmp + "/", "")).sort();
    expect(names).toEqual(["plain.md", "pub.md", "sub/nested.md"]);
    expect(names).not.toContain("node_modules/skip.md");
  });

  it("computes published status + URL for a file with valid metadata", () => {
    const { status, url } = EnhancedCommands.computeFileStatus(join(tmp, "pub.md"));
    expect(status).toBe(PublicationStatus.PUBLISHED);
    expect(url).toBe("https://telegra.ph/Test-01-01");
  });

  it("computes not_published for a file without metadata", () => {
    const { status, url } = EnhancedCommands.computeFileStatus(join(tmp, "plain.md"));
    expect(status).toBe(PublicationStatus.NOT_PUBLISHED);
    expect(url).toBeUndefined();
  });

  it("computes metadata_missing for a non-existent file", () => {
    const { status } = EnhancedCommands.computeFileStatus(join(tmp, "does-not-exist.md"));
    expect(status).toBe(PublicationStatus.METADATA_MISSING);
  });
});
