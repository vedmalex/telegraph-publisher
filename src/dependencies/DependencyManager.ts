import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { LinkResolver } from "../links/LinkResolver";
import { LinkScanner } from "../links/LinkScanner";
import { MetadataManager } from "../metadata/MetadataManager";
import type { DependencyNode, LocalLink, MetadataConfig } from "../types/metadata";
import { PublicationStatus } from "../types/metadata";
import type { PathResolver } from "../utils/PathResolver";

/**
 * Manages dependency trees and recursive publishing
 */
export class DependencyManager {
  private config: MetadataConfig;
  private memoCache: Map<string, DependencyNode>;
  private processingStack: Set<string>;
  private pathResolver: PathResolver;

  constructor(config: MetadataConfig, pathResolver: PathResolver) {
    this.config = config;
    this.memoCache = new Map();
    this.processingStack = new Set();
    this.pathResolver = pathResolver;
  }

  /**
   * Build dependency tree for a file
   * @param filePath Root file path
   * @param maxDepth Maximum recursion depth
   * @returns Dependency tree root node
   */
  buildDependencyTree(filePath: string, maxDepth?: number): DependencyNode {
    const depth = maxDepth ?? this.config.maxDependencyDepth;
    this.memoCache.clear();
    this.processingStack.clear();

    return this.buildNodeRecursive(filePath, 0, depth);
  }

  /**
   * Detect circular dependencies in tree
   * @param root Root dependency node
   * @returns Array of circular dependency paths
   */
  detectCircularDependencies(root: DependencyNode): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    this.detectCyclesRecursive(root, visited, recursionStack, [], cycles);

    return cycles;
  }

  /**
   * Order dependencies for publishing (topological sort)
   * @param root Root dependency node
   * @returns Ordered array of file paths for publishing
   */
  orderDependencies(root: DependencyNode): string[] {
    const ordered: string[] = [];
    const visited = new Set<string>();
    const temporary = new Set<string>();

    this.topologicalSortRecursive(root, visited, temporary, ordered);

    return ordered.reverse(); // Reverse to get dependencies first
  }

  /**
   * Analyze dependency tree and return statistics
   * @param root Root dependency node
   * @returns Dependency analysis results
   */
  analyzeDependencyTree(root: DependencyNode): {
    totalFiles: number;
    publishedFiles: number;
    unpublishedFiles: number;
    maxDepth: number;
    circularDependencies: string[][];
    publishOrder: string[];
  } {
    const allNodes = this.getAllNodes(root);
    const circularDeps = this.detectCircularDependencies(root);
    const publishOrder = this.orderDependencies(root);

    return {
      totalFiles: allNodes.length,
      publishedFiles: allNodes.filter(node => node.status === PublicationStatus.PUBLISHED).length,
      unpublishedFiles: allNodes.filter(node => node.status === PublicationStatus.NOT_PUBLISHED).length,
      maxDepth: Math.max(...allNodes.map(node => node.depth)),
      circularDependencies: circularDeps,
      publishOrder
    };
  }

  /**
   * Get all files that need to be published
   * @param root Root dependency node
   * @returns Array of file paths that need publishing
   */
  getFilesToPublish(root: DependencyNode): string[] {
    const allNodes = this.getAllNodes(root);
    return allNodes
      .filter(node => node.status === PublicationStatus.NOT_PUBLISHED)
      .map(node => node.filePath);
  }

  /**
   * Mark node as processed
   * @param filePath File path to mark as processed
   */
  markAsProcessed(filePath: string): void {
    // Deprecated: Use memoization cache instead
    console.warn('markAsProcessed is deprecated with memoization approach');
  }

  /**
   * Check if file has been processed
   * @param filePath File path to check
   * @returns True if file has been processed
   */
  isProcessed(filePath: string): boolean {
    return this.memoCache.has(filePath);
  }

  /**
   * Reset processing state
   */
  reset(): void {
    this.memoCache.clear();
    this.processingStack.clear();
  }

  /**
   * Build dependency node recursively
   * @param filePath File path
   * @param currentDepth Current recursion depth
   * @param maxDepth Maximum allowed depth
   * @returns Dependency node
   */
  private buildNodeRecursive(
    filePath: string,
    currentDepth: number,
    maxDepth: number
  ): DependencyNode {
    // Check memoization cache first - return complete cached node if available
    if (this.memoCache.has(filePath)) {
      return this.memoCache.get(filePath)!;
    }

    // Check for circular dependency
    if (this.processingStack.has(filePath)) {
      console.warn(`Circular dependency detected: ${filePath}`);
      // Create shallow node but don't cache it to break the cycle
      return this.createNode(filePath, currentDepth, []);
    }

    // Check depth limit
    if (currentDepth >= maxDepth) {
      console.warn(`Maximum dependency depth reached at ${filePath}`);
      // Don't cache nodes truncated by depth limit
      return this.createNode(filePath, currentDepth, []);
    }

    this.processingStack.add(filePath);

    try {
      // Read file content and find local links
      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch (error) {
        // Try decoding URL-encoded characters
        const decodedPath = decodeURIComponent(filePath);
        content = readFileSync(decodedPath, 'utf-8');
      }
      const contentWithoutMetadata = MetadataManager.removeMetadata(content);

      // Extract all links using the new LinkScanner
      const allLinks = LinkScanner.extractLinks(contentWithoutMetadata);

      // Filter for local markdown links and create LocalLink objects
      const localLinks: LocalLink[] = allLinks
        .filter(link => !link.href.startsWith('http') && !link.href.startsWith('https') && !link.href.startsWith('mailto:') && !link.href.startsWith('#'))
        .filter(link => link.href.toLowerCase().endsWith('.md') || link.href.toLowerCase().endsWith('.markdown'))
        .map(link => ({
          text: link.text,
          href: link.href,
          lineNumber: link.lineNumber,
          columnStart: link.columnStart,
          columnEnd: link.columnEnd,
          originalPath: link.href,
          resolvedPath: this.pathResolver.resolve(filePath, link.href),
          isPublished: false,
          fullMatch: `[${link.text}](${link.href})`,
          startIndex: link.columnStart,
          endIndex: link.columnEnd,
        }));

      // Build dependency nodes for linked files
      const dependencies: DependencyNode[] = [];
      for (const link of localLinks) {
        try {
          // Check if the target file exists
          if (existsSync(link.resolvedPath)) {
            const depNode = this.buildNodeRecursive(
              link.resolvedPath,
              currentDepth + 1,
              maxDepth
            );
            dependencies.push(depNode);
          }
        } catch (error) {
        }
      }

      const node = this.createNode(filePath, currentDepth, dependencies);

      // Cache the fully constructed node before returning
      this.memoCache.set(filePath, node);

      this.processingStack.delete(filePath);
      return node;

    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      this.processingStack.delete(filePath);
      // Don't cache nodes created due to errors
      return this.createNode(filePath, currentDepth, []);
    }
  }

  /**
   * Create dependency node
   * @param filePath File path
   * @param depth Node depth
   * @param dependencies Child dependencies
   * @returns Dependency node
   */
  private createNode(
    filePath: string,
    depth: number,
    dependencies: DependencyNode[]
  ): DependencyNode {
    const status = MetadataManager.getPublicationStatus(filePath);
    const metadata = status === PublicationStatus.PUBLISHED
      ? MetadataManager.getPublicationInfo(filePath) || undefined
      : undefined;

    return {
      filePath,
      metadata,
      status,
      dependencies,
      processed: false,
      depth
    };
  }

  /**
   * Detect cycles recursively
   * @param node Current node
   * @param visited Visited nodes
   * @param recursionStack Current recursion stack
   * @param currentPath Current path
   * @param cycles Found cycles
   */
  private detectCyclesRecursive(
    node: DependencyNode,
    visited: Set<string>,
    recursionStack: Set<string>,
    currentPath: string[],
    cycles: string[][]
  ): void {
    if (recursionStack.has(node.filePath)) {
      // Found cycle
      const cycleStart = currentPath.indexOf(node.filePath);
      if (cycleStart !== -1) {
        cycles.push([...currentPath.slice(cycleStart), node.filePath]);
      }
      return;
    }

    if (visited.has(node.filePath)) {
      return;
    }

    visited.add(node.filePath);
    recursionStack.add(node.filePath);
    currentPath.push(node.filePath);

    for (const dependency of node.dependencies) {
      this.detectCyclesRecursive(dependency, visited, recursionStack, currentPath, cycles);
    }

    recursionStack.delete(node.filePath);
    currentPath.pop();
  }

  /**
   * Topological sort for dependency ordering
   * @param node Current node
   * @param visited Visited nodes
   * @param temporary Temporary marks
   * @param ordered Result array
   */
  private topologicalSortRecursive(
    node: DependencyNode,
    visited: Set<string>,
    temporary: Set<string>,
    ordered: string[]
  ): void {
    if (temporary.has(node.filePath)) {
      // Circular dependency detected during sort
      return;
    }

    if (visited.has(node.filePath)) {
      return;
    }

    temporary.add(node.filePath);

    for (const dependency of node.dependencies) {
      this.topologicalSortRecursive(dependency, visited, temporary, ordered);
    }

    temporary.delete(node.filePath);
    visited.add(node.filePath);
    ordered.push(node.filePath);
  }

  /**
   * Get all nodes in tree (depth-first)
   * @param root Root node
   * @returns Array of all nodes
   */
  private getAllNodes(root: DependencyNode): DependencyNode[] {
    const nodes: DependencyNode[] = [];
    const visited = new Set<string>();

    const traverse = (node: DependencyNode) => {
      if (visited.has(node.filePath)) {
        return;
      }

      visited.add(node.filePath);
      nodes.push(node);

      for (const dependency of node.dependencies) {
        traverse(dependency);
      }
    };

    traverse(root);
    return nodes;
  }
}