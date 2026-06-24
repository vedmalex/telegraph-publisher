import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DstHarness } from "./DstHarness";
import { DstError } from "./DstIO";

describe("DstHarness", () => {
  let harness: DstHarness;

  beforeEach(() => {
    harness = new DstHarness(42);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("MockDstIO - Virtual FS", () => {
    it("should write and read files", () => {
      harness.io.writeFile("/test/file.md", "# Hello");
      expect(harness.io.readFile("/test/file.md")).toBe("# Hello");
    });

    it("should throw ENOENT for missing files", () => {
      expect(() => harness.io.readFile("/nonexistent.md")).toThrow(DstError);
      expect(() => harness.io.readFile("/nonexistent.md")).toThrow("ENOENT");
    });

    it("should detect file existence", () => {
      harness.io.addFile("/test.md", "content");
      expect(harness.io.exists("/test.md")).toBe(true);
      expect(harness.io.exists("/missing.md")).toBe(false);
    });

    it("should support readFileBuffer roundtrip", () => {
      const buf = new TextEncoder().encode("binary data");
      harness.io.writeFileBuffer("/test.bin", buf);
      const result = harness.io.readFileBuffer("/test.bin");
      expect(new TextDecoder().decode(result)).toBe("binary data");
    });
  });

  describe("MockDstIO - stat/lstat", () => {
    it("should stat a file", () => {
      harness.io.addFile("/test.md", "content");
      const stats = harness.io.stat("/test.md");
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.isSymbolicLink()).toBe(false);
      expect(stats.size).toBe(7);
    });

    it("should throw ENOENT for missing stat", () => {
      expect(() => harness.io.stat("/missing.md")).toThrow(DstError);
    });
  });

  describe("MockDstIO - copyFile, unlink, rm", () => {
    it("should copy a file", () => {
      harness.io.addFile("/src.md", "source");
      harness.io.copyFile("/src.md", "/dst.md");
      expect(harness.io.exists("/dst.md")).toBe(true);
      expect(harness.io.readFile("/dst.md")).toBe("source");
    });

    it("should unlink a file", () => {
      harness.io.addFile("/test.md", "content");
      harness.io.unlink("/test.md");
      expect(harness.io.exists("/test.md")).toBe(false);
    });

    it("should rm a file", () => {
      harness.io.addFile("/test.md", "content");
      harness.io.rm("/test.md");
      expect(harness.io.exists("/test.md")).toBe(false);
    });
  });

  describe("MockDstIO - HTTP handlers", () => {
    it("should register and invoke HTTP handler", async () => {
      harness.io.addHttpHandler("api.test.com", (req) => {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
      const res = await harness.io.fetch("https://api.test.com/v1/data");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("should throw ENETDOWN for unregistered URL", async () => {
      expect(harness.io.fetch("https://unknown.com")).rejects.toThrow("ENETDOWN");
    });
  });

  describe("MockDstIO - exec handlers", () => {
    it("should register and invoke exec handler", async () => {
      harness.io.addExecHandler("magick", async (args) => ({
        stdout: "success",
        stderr: "",
        exitCode: 0,
      }));
      const result = await harness.io.exec("magick", ["convert", "a.png", "b.png"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("success");
    });

    it("should throw ENOENT for unregistered command", async () => {
      expect(harness.io.exec("nonexistent", [])).rejects.toThrow("ENOENT");
    });
  });

  describe("MockDstIO - Tick clock", () => {
    it("should start at 0", () => {
      expect(harness.io.now()).toBe(0);
    });

    it("should advance on tick", () => {
      harness.io.tick(1000);
      expect(harness.io.now()).toBe(1000);
    });

    it("should produce ISO timestamps", () => {
      harness.io.tick(5000);
      const ts = harness.io.timestamp();
      expect(ts).toBe("1970-01-01T00:00:05.000Z");
    });
  });

  describe("MockDstIO - PRNG", () => {
    it("should produce deterministic values for same seed", () => {
      const h1 = new DstHarness(42);
      const h2 = new DstHarness(42);
      const vals1 = Array.from({ length: 5 }, () => h1.io.random());
      const vals2 = Array.from({ length: 5 }, () => h2.io.random());
      expect(vals1).toEqual(vals2);
    });

    it("should produce different values for different seeds", () => {
      const h1 = new DstHarness(42);
      const h2 = new DstHarness(1);
      expect(h1.io.random()).not.toBe(h2.io.random());
    });
  });

  describe("MockDstIO - Operation log", () => {
    it("should log operations", () => {
      harness.io.addFile("/test.md", "content");
      harness.io.readFile("/test.md");
      expect(harness.io.ops.length).toBeGreaterThanOrEqual(1);
      expect(harness.io.ops[0]!.kind).toBe("readFile");
    });
  });

  describe("DstHarness - reset", () => {
    it("should clear all state on reset", () => {
      harness.io.addFile("/test.md", "content");
      harness.io.tick(500);
      harness.reset();
      expect(harness.io.exists("/test.md")).toBe(false);
      expect(harness.io.now()).toBe(0);
    });
  });

  describe("DstHarness - DependencyManager integration", () => {
    it("should build a dependency tree using DstIO injection", () => {
      const config = {
        contentDir: "/content",
        maxDependencyDepth: 10,
        autoPublishDependencies: true,
        defaultAuthor: "Test",
        telegraphApiUrl: "https://api.telegra.ph",
        edition: "1.0",
      };

      harness.io.addFile("/content/main.md", "# Main\n\nLink to [dep](./dep.md)");
      harness.io.addFile("/content/dep.md", "# Dep\n\nNo links");

      const dm = harness.getDependencyManager(config as any);
      const tree = dm.buildDependencyTree("/content/main.md");

      expect(tree.filePath).toBe("/content/main.md");
      expect(tree.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]!.filePath).toBe("/content/dep.md");
      expect(tree.dependencies[0]!.depth).toBe(1);
    });

    it("should handle nested dependencies deterministically", () => {
      const config = {
        contentDir: "/content",
        maxDependencyDepth: 10,
        autoPublishDependencies: true,
        defaultAuthor: "Test",
        telegraphApiUrl: "https://api.telegra.ph",
        edition: "1.0",
      };

      harness.io.addFile("/content/a.md", "# A\n\nLink to [b](./b.md)");
      harness.io.addFile("/content/b.md", "# B\n\nLink to [c](./c.md)");
      harness.io.addFile("/content/c.md", "# C\n\nNo links");

      const dm = harness.getDependencyManager(config as any);
      const tree = dm.buildDependencyTree("/content/a.md");

      expect(tree.filePath).toBe("/content/a.md");
      expect(tree.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]!.filePath).toBe("/content/b.md");
      expect(tree.dependencies[0]!.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]!.dependencies[0]!.filePath).toBe("/content/c.md");
      expect(tree.dependencies[0]!.dependencies[0]!.depth).toBe(2);
    });

    it("should produce identical trees on repeated builds with same seed", () => {
      const config = {
        contentDir: "/content",
        maxDependencyDepth: 10,
        autoPublishDependencies: true,
        defaultAuthor: "Test",
        telegraphApiUrl: "https://api.telegra.ph",
        edition: "1.0",
      } as any;

      const h1 = new DstHarness(42);
      h1.io.addFile("/content/main.md", "# Main\n\nLink to [dep](./dep.md)");
      h1.io.addFile("/content/dep.md", "# Dep\n\nNo links");
      const tree1 = h1.getDependencyManager(config).buildDependencyTree("/content/main.md");

      const h2 = new DstHarness(42);
      h2.io.addFile("/content/main.md", "# Main\n\nLink to [dep](./dep.md)");
      h2.io.addFile("/content/dep.md", "# Dep\n\nNo links");
      const tree2 = h2.getDependencyManager(config).buildDependencyTree("/content/main.md");

      expect(tree1.filePath).toBe(tree2.filePath);
      expect(tree1.dependencies).toHaveLength(1);
      expect(tree2.dependencies).toHaveLength(1);
      expect(tree1.dependencies[0]!.filePath).toBe(tree2.dependencies[0]!.filePath);
    });
  });
});
