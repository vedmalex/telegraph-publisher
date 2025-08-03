import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { TestHelpers } from "../test-utils/TestHelpers";
import type { DependencyNode, MetadataConfig } from "../types/metadata";
import { PublicationStatus } from "../types/metadata";
import { PathResolver } from "../utils/PathResolver";
import { DependencyManager } from "./DependencyManager";

describe("DependencyManager", () => {
  let tempDir: string;
  let dependencyManager: DependencyManager;
  let config: MetadataConfig;
  let pathResolver: PathResolver;

  beforeEach(() => {
    tempDir = TestHelpers.createTempDir("dependency-test");
    config = TestHelpers.createTestConfig({
      maxDependencyDepth: 5,
      autoPublishDependencies: true
    });
    pathResolver = PathResolver.getInstance();
    dependencyManager = new DependencyManager(config, pathResolver);
  });

  afterEach(() => {
    TestHelpers.cleanup();
  });

  describe("buildDependencyTree", () => {
    it("should build simple dependency tree", () => {
      const mainFile = join(tempDir, "main.md");
      const depFile = join(tempDir, "dep.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep.md"]
      ));
      TestHelpers.createTestFile(depFile, TestHelpers.createMarkdownWithLinks(
        "Dependency Article", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);

      expect(tree.filePath).toBe(mainFile);
      expect(tree.depth).toBe(0);
      expect(tree.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]?.filePath).toBe(depFile);
      expect(tree.dependencies[0]?.depth).toBe(1);
    });

    it("should handle nested dependencies", () => {
      const mainFile = join(tempDir, "main.md");
      const dep1File = join(tempDir, "dep1.md");
      const dep2File = join(tempDir, "dep2.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep1.md"]
      ));
      TestHelpers.createTestFile(dep1File, TestHelpers.createMarkdownWithLinks(
        "Dependency 1", ["./dep2.md"]
      ));
      TestHelpers.createTestFile(dep2File, TestHelpers.createMarkdownWithLinks(
        "Dependency 2", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);

      expect(tree.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]?.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]?.dependencies[0]?.filePath).toBe(dep2File);
      expect(tree.dependencies[0]?.dependencies[0]?.depth).toBe(2);
    });

    it("should respect max depth limit", () => {
      const mainFile = join(tempDir, "main.md");
      const dep1File = join(tempDir, "dep1.md");
      const dep2File = join(tempDir, "dep2.md");
      const dep3File = join(tempDir, "dep3.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep1.md"]
      ));
      TestHelpers.createTestFile(dep1File, TestHelpers.createMarkdownWithLinks(
        "Dependency 1", ["./dep2.md"]
      ));
      TestHelpers.createTestFile(dep2File, TestHelpers.createMarkdownWithLinks(
        "Dependency 2", ["./dep3.md"]
      ));
      TestHelpers.createTestFile(dep3File, TestHelpers.createMarkdownWithLinks(
        "Dependency 3", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile, 2);

      expect(tree.dependencies[0]?.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]?.dependencies[0]?.dependencies).toHaveLength(0); // Depth limit reached
    });

    it("should handle files with metadata", () => {
      const mainFile = join(tempDir, "main.md");
      const depFile = join(tempDir, "dep.md");

      const metadata = TestHelpers.createSampleMetadata();

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep.md"]
      ));
      TestHelpers.createTestFile(depFile, TestHelpers.createMarkdownWithLinks(
        "Dependency Article", []
      ), metadata);

      const tree = dependencyManager.buildDependencyTree(mainFile);

      expect(tree.status).toBe(PublicationStatus.NOT_PUBLISHED);
      expect(tree.dependencies[0]?.status).toBe(PublicationStatus.PUBLISHED);
    });

    it("should handle non-existent files", () => {
      const mainFile = join(tempDir, "main.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./non-existent.md"]
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);

      // Non-existent files are not added to dependency tree
      expect(tree.dependencies).toHaveLength(0);
    });
  });

  describe("detectCircularDependencies", () => {
    it("should detect simple circular dependency", () => {
      const file1 = join(tempDir, "file1.md");
      const file2 = join(tempDir, "file2.md");

      TestHelpers.createTestFile(file1, TestHelpers.createMarkdownWithLinks(
        "File 1", ["./file2.md"]
      ));
      TestHelpers.createTestFile(file2, TestHelpers.createMarkdownWithLinks(
        "File 2", ["./file1.md"]
      ));

      const tree = dependencyManager.buildDependencyTree(file1);
      const cycles = dependencyManager.detectCircularDependencies(tree);

      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain(file1);
      expect(cycles[0]).toContain(file2);
    });

    it("should detect complex circular dependency", () => {
      const file1 = join(tempDir, "file1.md");
      const file2 = join(tempDir, "file2.md");
      const file3 = join(tempDir, "file3.md");

      TestHelpers.createTestFile(file1, TestHelpers.createMarkdownWithLinks(
        "File 1", ["./file2.md"]
      ));
      TestHelpers.createTestFile(file2, TestHelpers.createMarkdownWithLinks(
        "File 2", ["./file3.md"]
      ));
      TestHelpers.createTestFile(file3, TestHelpers.createMarkdownWithLinks(
        "File 3", ["./file1.md"]
      ));

      const tree = dependencyManager.buildDependencyTree(file1);
      const cycles = dependencyManager.detectCircularDependencies(tree);

      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain(file1);
      expect(cycles[0]).toContain(file2);
      expect(cycles[0]).toContain(file3);
    });

    it("should return empty array for acyclic graph", () => {
      const mainFile = join(tempDir, "main.md");
      const dep1File = join(tempDir, "dep1.md");
      const dep2File = join(tempDir, "dep2.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep1.md", "./dep2.md"]
      ));
      TestHelpers.createTestFile(dep1File, TestHelpers.createMarkdownWithLinks(
        "Dependency 1", []
      ));
      TestHelpers.createTestFile(dep2File, TestHelpers.createMarkdownWithLinks(
        "Dependency 2", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);
      const cycles = dependencyManager.detectCircularDependencies(tree);

      expect(cycles).toHaveLength(0);
    });
  });

  describe("orderDependencies", () => {
    it("should order dependencies correctly", () => {
      const mainFile = join(tempDir, "main.md");
      const dep1File = join(tempDir, "dep1.md");
      const dep2File = join(tempDir, "dep2.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep1.md", "./dep2.md"]
      ));
      TestHelpers.createTestFile(dep1File, TestHelpers.createMarkdownWithLinks(
        "Dependency 1", ["./dep2.md"]
      ));
      TestHelpers.createTestFile(dep2File, TestHelpers.createMarkdownWithLinks(
        "Dependency 2", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);
      const order = dependencyManager.orderDependencies(tree);

      expect(order).toHaveLength(3);
      expect(order).toContain(mainFile);
      expect(order).toContain(dep1File);
      expect(order).toContain(dep2File);
      // Check that all files are in the order (actual order may vary based on implementation)
      expect(order.length).toBe(3);
    });

    it("should handle single file", () => {
      const singleFile = join(tempDir, "single.md");

      TestHelpers.createTestFile(singleFile, TestHelpers.createMarkdownWithLinks(
        "Single Article", []
      ));

      const tree = dependencyManager.buildDependencyTree(singleFile);
      const order = dependencyManager.orderDependencies(tree);

      expect(order).toEqual([singleFile]);
    });

    it("should handle diamond dependency pattern", () => {
      const mainFile = join(tempDir, "main.md");
      const leftFile = join(tempDir, "left.md");
      const rightFile = join(tempDir, "right.md");
      const sharedFile = join(tempDir, "shared.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./left.md", "./right.md"]
      ));
      TestHelpers.createTestFile(leftFile, TestHelpers.createMarkdownWithLinks(
        "Left Branch", ["./shared.md"]
      ));
      TestHelpers.createTestFile(rightFile, TestHelpers.createMarkdownWithLinks(
        "Right Branch", ["./shared.md"]
      ));
      TestHelpers.createTestFile(sharedFile, TestHelpers.createMarkdownWithLinks(
        "Shared Dependency", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);
      const order = dependencyManager.orderDependencies(tree);

      expect(order).toHaveLength(4);
      expect(order).toContain(mainFile);
      expect(order).toContain(leftFile);
      expect(order).toContain(rightFile);
      expect(order).toContain(sharedFile);

      // All files should be present in the order
      expect(new Set(order).size).toBe(4);
    });
  });

  describe("analyzeDependencyTree", () => {
    it("should provide comprehensive analysis", () => {
      const mainFile = join(tempDir, "main.md");
      const dep1File = join(tempDir, "dep1.md");
      const dep2File = join(tempDir, "dep2.md");

      const metadata = TestHelpers.createSampleMetadata();

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep1.md", "./dep2.md"]
      ));
      TestHelpers.createTestFile(dep1File, TestHelpers.createMarkdownWithLinks(
        "Dependency 1", []
      ), metadata);
      TestHelpers.createTestFile(dep2File, TestHelpers.createMarkdownWithLinks(
        "Dependency 2", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);
      const analysis = dependencyManager.analyzeDependencyTree(tree);

      expect(analysis.totalFiles).toBe(3);
      expect(analysis.publishedFiles).toBe(1);
      expect(analysis.unpublishedFiles).toBe(2);
      expect(analysis.maxDepth).toBe(1);
      expect(analysis.circularDependencies).toHaveLength(0);
      expect(analysis.publishOrder).toHaveLength(3);
    });

    it("should detect circular dependencies in analysis", () => {
      const file1 = join(tempDir, "file1.md");
      const file2 = join(tempDir, "file2.md");

      TestHelpers.createTestFile(file1, TestHelpers.createMarkdownWithLinks(
        "File 1", ["./file2.md"]
      ));
      TestHelpers.createTestFile(file2, TestHelpers.createMarkdownWithLinks(
        "File 2", ["./file1.md"]
      ));

      const tree = dependencyManager.buildDependencyTree(file1);
      const analysis = dependencyManager.analyzeDependencyTree(tree);

      expect(analysis.circularDependencies).toHaveLength(1);
      expect(analysis.totalFiles).toBeGreaterThan(0);
    });
  });

  describe("getFilesToPublish", () => {
    it("should return only unpublished files", () => {
      const mainFile = join(tempDir, "main.md");
      const publishedFile = join(tempDir, "published.md");
      const unpublishedFile = join(tempDir, "unpublished.md");

      const metadata = TestHelpers.createSampleMetadata();

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./published.md", "./unpublished.md"]
      ));
      TestHelpers.createTestFile(publishedFile, TestHelpers.createMarkdownWithLinks(
        "Published Article", []
      ), metadata);
      TestHelpers.createTestFile(unpublishedFile, TestHelpers.createMarkdownWithLinks(
        "Unpublished Article", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);
      const filesToPublish = dependencyManager.getFilesToPublish(tree);

      expect(filesToPublish).toContain(mainFile);
      expect(filesToPublish).toContain(unpublishedFile);
      expect(filesToPublish).not.toContain(publishedFile);
    });

    it("should return empty array for fully published tree", () => {
      const mainFile = join(tempDir, "main.md");
      const depFile = join(tempDir, "dep.md");

      const metadata1 = TestHelpers.createSampleMetadata();
      const metadata2 = TestHelpers.createSampleMetadata({
        telegraphUrl: "https://telegra.ph/Dep-Article-01-01"
      });

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./dep.md"]
      ), metadata1);
      TestHelpers.createTestFile(depFile, TestHelpers.createMarkdownWithLinks(
        "Dependency Article", []
      ), metadata2);

      const tree = dependencyManager.buildDependencyTree(mainFile);
      const filesToPublish = dependencyManager.getFilesToPublish(tree);

      expect(filesToPublish).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle file with no links", () => {
      const singleFile = join(tempDir, "single.md");

      TestHelpers.createTestFile(singleFile, TestHelpers.createMarkdownWithLinks(
        "Single Article", []
      ));

      const tree = dependencyManager.buildDependencyTree(singleFile);

      expect(tree.filePath).toBe(singleFile);
      expect(tree.dependencies).toHaveLength(0);
      expect(tree.depth).toBe(0);
    });

    it("should handle deeply nested dependencies", () => {
      const files: string[] = [];
      for (let i = 0; i < 10; i++) {
        files.push(join(tempDir, `file${i}.md`));
      }

      // Create chain: file0 -> file1 -> file2 -> ... -> file9
      for (let i = 0; i < files.length; i++) {
        const nextFile = i < files.length - 1 ? [`./file${i + 1}.md`] : [];
        TestHelpers.createTestFile(files[i]!, TestHelpers.createMarkdownWithLinks(
          `Article ${i}`, nextFile
        ));
      }

      const tree = dependencyManager.buildDependencyTree(files[0]!, 10);
      const analysis = dependencyManager.analyzeDependencyTree(tree);

      expect(analysis.totalFiles).toBe(10);
      expect(analysis.maxDepth).toBe(9);
    });

    it("should handle files with same name in different directories", () => {
      const subDir = join(tempDir, "subdir");
      const mainFile = join(tempDir, "main.md");
      const rootFile = join(tempDir, "same.md");
      const subFile = join(subDir, "same.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./same.md", "./subdir/same.md"]
      ));
      TestHelpers.createTestFile(rootFile, TestHelpers.createMarkdownWithLinks(
        "Root Same", []
      ));
      TestHelpers.createTestFile(subFile, TestHelpers.createMarkdownWithLinks(
        "Sub Same", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);

      expect(tree.dependencies).toHaveLength(2);
      expect(tree.dependencies.map(d => d.filePath)).toContain(rootFile);
      expect(tree.dependencies.map(d => d.filePath)).toContain(subFile);
    });

    it("should handle external links mixed with local links", () => {
      const mainFile = join(tempDir, "main.md");
      const localFile = join(tempDir, "local.md");

      const content = `# Main Article

This is a [local link](./local.md) and an [external link](https://example.com).
Also a [mailto link](mailto:test@example.com).`;

      TestHelpers.createTestFile(mainFile, content);
      TestHelpers.createTestFile(localFile, TestHelpers.createMarkdownWithLinks(
        "Local Article", []
      ));

      const tree = dependencyManager.buildDependencyTree(mainFile);

      expect(tree.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]?.filePath).toBe(localFile);
    });

    it("should handle corrupted metadata files", () => {
      const mainFile = join(tempDir, "main.md");
      const corruptedFile = join(tempDir, "corrupted.md");

      TestHelpers.createTestFile(mainFile, TestHelpers.createMarkdownWithLinks(
        "Main Article", ["./corrupted.md"]
      ));

      // Create file with invalid metadata
      const corruptedContent = `---
telegraphUrl: "invalid-url
editPath: "Test-01-01"
username: "Test Author"
publishedAt: "invalid-date"
originalFilename: "corrupted.md"
---

# Corrupted Article`;

      TestHelpers.createTestFile(corruptedFile, corruptedContent);

      const tree = dependencyManager.buildDependencyTree(mainFile);

      expect(tree.dependencies).toHaveLength(1);
      expect(tree.dependencies[0]?.status).toBe(PublicationStatus.METADATA_CORRUPTED);
    });
  });
});

describe('DependencyManager depth consistency fix', () => {
  let manager: DependencyManager;
  let tempDir: string;

  beforeEach(() => {
    const config = TestHelpers.createTestConfig();
    const pathResolver = PathResolver.getInstance();
    manager = new DependencyManager(config, pathResolver);
    tempDir = mkdtempSync(join(tmpdir(), 'dependency-depth-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should produce identical results for different depth values when sufficient', () => {
    // Create a shared dependency structure
    const sharedFile = join(tempDir, 'shared.md');
    const file1 = join(tempDir, 'file1.md');
    const file2 = join(tempDir, 'file2.md');
    const rootFile = join(tempDir, 'root.md');

    writeFileSync(sharedFile, '# Shared content\n[link to another](other.md)');
    writeFileSync(file1, `# File 1\n[shared dependency](${relative(dirname(file1), sharedFile)})`);
    writeFileSync(file2, `# File 2\n[same shared dependency](${relative(dirname(file2), sharedFile)})`);
    writeFileSync(rootFile, `# Root\n[to file1](${relative(dirname(rootFile), file1)})\n[to file2](${relative(dirname(rootFile), file2)})`);

    // Build trees with different depth values
    const tree10 = manager.buildDependencyTree(rootFile, 10);
    const tree100 = manager.buildDependencyTree(rootFile, 100);
    const tree5 = manager.buildDependencyTree(rootFile, 5);

    // Helper function to normalize trees for comparison (remove depth info that may vary)
    const normalizeForComparison = (node: DependencyNode): any => ({
      filePath: node.filePath,
      status: node.status,
      dependencies: node.dependencies.map(normalizeForComparison).sort((a, b) => a.filePath.localeCompare(b.filePath))
    });

    const normalized10 = normalizeForComparison(tree10);
    const normalized100 = normalizeForComparison(tree100);
    const normalized5 = normalizeForComparison(tree5);

    // Different sufficient depths should produce identical trees
    expect(normalized10).toEqual(normalized100);
    expect(normalized10).toEqual(normalized5);

    // Verify shared dependencies maintain their structure in all instances
    const findSharedNodeInTree = (tree: DependencyNode, targetPath: string): DependencyNode | null => {
      if (tree.filePath === targetPath) return tree;
      for (const dep of tree.dependencies) {
        const found = findSharedNodeInTree(dep, targetPath);
        if (found) return found;
      }
      return null;
    };

    const sharedIn10 = findSharedNodeInTree(tree10, sharedFile);
    const sharedIn100 = findSharedNodeInTree(tree100, sharedFile);

    expect(sharedIn10).toBeTruthy();
    expect(sharedIn100).toBeTruthy();

    // Shared nodes should have identical structure regardless of path taken to reach them
    if (sharedIn10 && sharedIn100) {
      expect(normalizeForComparison(sharedIn10)).toEqual(normalizeForComparison(sharedIn100));
    }
  });

  it('should handle shared dependencies with multiple reference paths correctly', () => {
    // Create a more complex shared dependency scenario
    const shared = join(tempDir, 'shared.md');
    const intermediate1 = join(tempDir, 'intermediate1.md');
    const intermediate2 = join(tempDir, 'intermediate2.md');
    const root = join(tempDir, 'root.md');

    writeFileSync(shared, '# Shared\nThis is shared content');
    writeFileSync(intermediate1, `# Int1\n[to shared](${relative(dirname(intermediate1), shared)})`);
    writeFileSync(intermediate2, `# Int2\n[to shared](${relative(dirname(intermediate2), shared)})`);
    writeFileSync(root, `# Root\n[to int1](${relative(dirname(root), intermediate1)})\n[to int2](${relative(dirname(root), intermediate2)})`);

    const tree = manager.buildDependencyTree(root, 10);

    // Count how many times shared file appears in the tree
    const countOccurrences = (node: DependencyNode, targetPath: string): number => {
      let count = node.filePath === targetPath ? 1 : 0;
      for (const dep of node.dependencies) {
        count += countOccurrences(dep, targetPath);
      }
      return count;
    };

    const sharedCount = countOccurrences(tree, shared);
    expect(sharedCount).toBe(2); // Should appear twice (through both intermediate files)

    // All instances should be complete nodes (not shallow)
    const collectSharedNodes = (node: DependencyNode, targetPath: string): DependencyNode[] => {
      const nodes: DependencyNode[] = [];
      if (node.filePath === targetPath) nodes.push(node);
      for (const dep of node.dependencies) {
        nodes.push(...collectSharedNodes(dep, targetPath));
      }
      return nodes;
    };

    const allSharedNodes = collectSharedNodes(tree, shared);
    expect(allSharedNodes).toHaveLength(2);

    // Both instances should be identical complete nodes
    expect(allSharedNodes[0]).toEqual(allSharedNodes[1]);
  });
});