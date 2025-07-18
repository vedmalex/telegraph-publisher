import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { FileMetadata, MetadataConfig, PublishedPageInfo } from "../types/metadata";

/**
 * Test utilities and helpers for Telegraph publisher testing
 */
export class TestHelpers {
  private static testDirs: string[] = [];

  /**
   * Create a temporary test directory
   * @param prefix Directory prefix
   * @returns Path to created directory
   */
  static createTempDir(prefix: string = "telegraph-test"): string {
    const tempDir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    mkdirSync(tempDir, { recursive: true });
    TestHelpers.testDirs.push(tempDir);
    return tempDir;
  }

  /**
   * Clean up all created test directories
   */
  static cleanup(): void {
    for (const dir of TestHelpers.testDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    TestHelpers.testDirs = [];
  }

  /**
   * Create a test markdown file
   * @param filePath File path
   * @param content File content
   * @param metadata Optional metadata to inject
   */
  static createTestFile(filePath: string, content: string, metadata?: FileMetadata): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let finalContent = content;
    if (metadata) {
      const yamlFrontMatter = TestHelpers.createYamlFrontMatter(metadata);
      finalContent = `${yamlFrontMatter}\n${content}`;
    }

    writeFileSync(filePath, finalContent, "utf-8");
  }

  /**
   * Create YAML front-matter from metadata
   * @param metadata Metadata object
   * @returns YAML front-matter string
   */
  static createYamlFrontMatter(metadata: FileMetadata): string {
    const lines = [
      "---",
      `telegraphUrl: "${metadata.telegraphUrl}"`,
      `editPath: "${metadata.editPath}"`,
      `username: "${metadata.username}"`,
      `publishedAt: "${metadata.publishedAt}"`,
      `originalFilename: "${metadata.originalFilename}"`
    ];

    if (metadata.title) {
      lines.push(`title: "${metadata.title}"`);
    }
    if (metadata.description) {
      lines.push(`description: "${metadata.description}"`);
    }

    lines.push("---");
    return lines.join("\n");
  }

  /**
   * Create sample metadata
   * @param overrides Optional property overrides
   * @returns Sample metadata object
   */
  static createSampleMetadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
    return {
      telegraphUrl: "https://telegra.ph/Sample-Article-01-01",
      editPath: "Sample-Article-01-01",
      username: "Test Author",
      publishedAt: new Date().toISOString(),
      originalFilename: "sample.md",
      title: "Sample Article",
      description: "A sample article for testing",
      ...overrides
    };
  }

  /**
   * Create sample published page info
   * @param overrides Optional property overrides
   * @returns Sample published page info
   */
  static createSamplePageInfo(overrides: Partial<PublishedPageInfo> = {}): PublishedPageInfo {
    return {
      telegraphUrl: "https://telegra.ph/Sample-Article-01-01",
      editPath: "Sample-Article-01-01",
      title: "Sample Article",
      authorName: "Test Author",
      publishedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      views: 42,
      localFilePath: "/path/to/sample.md",
      ...overrides
    };
  }

  /**
   * Create test configuration
   * @param overrides Optional property overrides
   * @returns Test configuration object
   */
  static createTestConfig(overrides: Partial<MetadataConfig> = {}): MetadataConfig {
    return {
      defaultUsername: "Test User",
      autoPublishDependencies: true,
      replaceLinksinContent: true,
      maxDependencyDepth: 5,
      createBackups: false,
      manageBidirectionalLinks: true,
      autoSyncCache: true,
      customFields: {},
      ...overrides
    };
  }

  /**
   * Create markdown content with links
   * @param title Article title
   * @param localLinks Array of local link paths
   * @param telegraphLinks Array of Telegraph URLs
   * @returns Markdown content
   */
  static createMarkdownWithLinks(
    title: string,
    localLinks: string[] = [],
    telegraphLinks: string[] = []
  ): string {
    const content = [`# ${title}`, "", "This is a test article with various links.", ""];

    if (localLinks.length > 0) {
      content.push("## Local Links");
      localLinks.forEach((link, index) => {
        content.push(`- [Local Link ${index + 1}](${link})`);
      });
      content.push("");
    }

    if (telegraphLinks.length > 0) {
      content.push("## Telegraph Links");
      telegraphLinks.forEach((link, index) => {
        content.push(`- [Telegraph Link ${index + 1}](${link})`);
      });
      content.push("");
    }

    content.push("End of test content.");
    return content.join("\n");
  }

  /**
   * Create a complex test project structure
   * @param baseDir Base directory
   * @returns Object with file paths
   */
  static createTestProject(baseDir: string): {
    mainFile: string;
    dependencyFile1: string;
    dependencyFile2: string;
    circularFile: string;
    configFile: string;
    cacheFile: string;
  } {
    const mainFile = join(baseDir, "main.md");
    const dependencyFile1 = join(baseDir, "deps", "dep1.md");
    const dependencyFile2 = join(baseDir, "deps", "dep2.md");
    const circularFile = join(baseDir, "circular.md");
    const configFile = join(baseDir, ".telegraph-publisher-config.json");
    const cacheFile = join(baseDir, ".telegraph-pages-cache.json");

    // Create main file with dependencies
    TestHelpers.createTestFile(
      mainFile,
      TestHelpers.createMarkdownWithLinks("Main Article", ["./deps/dep1.md", "./deps/dep2.md"])
    );

    // Create dependency files
    TestHelpers.createTestFile(
      dependencyFile1,
      TestHelpers.createMarkdownWithLinks("Dependency 1", ["./dep2.md"])
    );

    TestHelpers.createTestFile(
      dependencyFile2,
      TestHelpers.createMarkdownWithLinks("Dependency 2", ["../circular.md"])
    );

    // Create circular dependency
    TestHelpers.createTestFile(
      circularFile,
      TestHelpers.createMarkdownWithLinks("Circular File", ["./main.md"])
    );

    // Create config file
    writeFileSync(configFile, JSON.stringify({
      accessToken: "test-token-123",
      defaultUsername: "Test User",
      autoPublishDependencies: true,
      manageBidirectionalLinks: true
    }, null, 2));

    // Create cache file
    writeFileSync(cacheFile, JSON.stringify({
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      accessTokenHash: "test-hash",
      pages: {},
      localToTelegraph: {},
      telegraphToLocal: {}
    }, null, 2));

    return {
      mainFile,
      dependencyFile1,
      dependencyFile2,
      circularFile,
      configFile,
      cacheFile
    };
  }

  /**
   * Read file content
   * @param filePath File path
   * @returns File content
   */
  static readFile(filePath: string): string {
    return readFileSync(filePath, "utf-8");
  }

  /**
   * Check if file exists
   * @param filePath File path
   * @returns Whether file exists
   */
  static fileExists(filePath: string): boolean {
    return existsSync(filePath);
  }

  /**
   * Create mock Telegraph API responses
   */
  static createMockTelegraphResponses() {
    return {
      createAccount: {
        ok: true,
        result: {
          short_name: "Test",
          author_name: "Test Author",
          author_url: "",
          access_token: "test-token-123",
          auth_url: "https://edit.telegra.ph/auth/test"
        }
      },
      createPage: {
        ok: true,
        result: {
          path: "Test-Article-01-01",
          url: "https://telegra.ph/Test-Article-01-01",
          title: "Test Article",
          description: "Test description",
          author_name: "Test Author",
          author_url: "",
          image_url: "",
          content: [],
          views: 0,
          can_edit: true
        }
      },
      editPage: {
        ok: true,
        result: {
          path: "Test-Article-01-01",
          url: "https://telegra.ph/Test-Article-01-01",
          title: "Test Article Updated",
          description: "Test description updated",
          author_name: "Test Author",
          author_url: "",
          image_url: "",
          content: [],
          views: 42,
          can_edit: true
        }
      },
      getPageList: {
        ok: true,
        result: {
          total_count: 2,
          pages: [
            {
              path: "Test-Article-01-01",
              url: "https://telegra.ph/Test-Article-01-01",
              title: "Test Article",
              description: "Test description",
              author_name: "Test Author",
              author_url: "",
              image_url: "",
              views: 42,
              can_edit: true
            },
            {
              path: "Another-Article-01-02",
              url: "https://telegra.ph/Another-Article-01-02",
              title: "Another Article",
              description: "Another description",
              author_name: "Test Author",
              author_url: "",
              image_url: "",
              views: 24,
              can_edit: true
            }
          ]
        }
      }
    };
  }

  /**
   * Assert that two objects are deeply equal
   * @param actual Actual value
   * @param expected Expected value
   * @param message Optional error message
   */
  static assertEqual<T>(actual: T, expected: T, message?: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  /**
   * Assert that value is truthy
   * @param value Value to check
   * @param message Optional error message
   */
  static assertTrue(value: any, message?: string): void {
    if (!value) {
      throw new Error(message || `Expected truthy value, got ${value}`);
    }
  }

  /**
   * Assert that value is falsy
   * @param value Value to check
   * @param message Optional error message
   */
  static assertFalse(value: any, message?: string): void {
    if (value) {
      throw new Error(message || `Expected falsy value, got ${value}`);
    }
  }

  /**
   * Assert that function throws an error
   * @param fn Function to test
   * @param expectedMessage Optional expected error message
   */
  static assertThrows(fn: () => void, expectedMessage?: string): void {
    let thrown = false;
    try {
      fn();
    } catch (error) {
      thrown = true;
      if (expectedMessage && error instanceof Error) {
        if (!error.message.includes(expectedMessage)) {
          throw new Error(`Expected error message to contain "${expectedMessage}", got "${error.message}"`);
        }
      }
    }
    if (!thrown) {
      throw new Error("Expected function to throw an error");
    }
  }

  /**
   * Wait for a specified amount of time
   * @param ms Milliseconds to wait
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}