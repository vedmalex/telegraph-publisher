import { readFileSync } from "node:fs";
import { LinkResolver } from "../links/LinkResolver";
import { MetadataManager } from "../metadata/MetadataManager";
import type { DependencyNode, LocalLink, MetadataConfig } from "../types/metadata";
import { PublicationStatus } from "../types/metadata";

/**
 * Manages dependency trees and recursive publishing
 */
export class DependencyManager {
  private config: MetadataConfig;
  private visitedFiles: Set<string>;
  private processingStack: Set<string>;

  constructor(config: MetadataConfig) {
    this.config = config;
    this.visitedFiles = new Set();
    this.processingStack = new Set();
  }

  /**
   * Build dependency tree for a file
   * @param filePath Root file path
   * @param maxDepth Maximum recursion depth
   * @returns Dependency tree root node
   */
  buildDependencyTree(filePath: string, maxDepth?: number): DependencyNode {
    const depth = maxDepth ?? this.config.maxDependencyDepth;
    this.visitedFiles.clear();
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
    this.visitedFiles.add(filePath);
  }

  /**
   * Check if file has been processed
   * @param filePath File path to check
   * @returns True if file has been processed
   */
  isProcessed(filePath: string): boolean {
    return this.visitedFiles.has(filePath);
  }

  /**
   * Reset processing state
   */
  reset(): void {
    this.visitedFiles.clear();
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
    // Check for circular dependency
    if (this.processingStack.has(filePath)) {
      console.warn(`Circular dependency detected: ${filePath}`);
      return this.createNode(filePath, currentDepth, []);
    }

    // Check depth limit
    if (currentDepth >= maxDepth) {
      console.warn(`Maximum dependency depth reached at ${filePath}`);
      return this.createNode(filePath, currentDepth, []);
    }

    // Check if already visited
    if (this.visitedFiles.has(filePath)) {
      return this.createNode(filePath, currentDepth, []);
    }

    this.processingStack.add(filePath);
    this.visitedFiles.add(filePath);

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
      const localLinks = LinkResolver.findLocalLinks(contentWithoutMetadata, filePath);
      const markdownLinks = LinkResolver.filterMarkdownLinks(localLinks);

      // Build dependency nodes for linked files
      const dependencies: DependencyNode[] = [];
      for (const link of markdownLinks) {
        if (LinkResolver.validateLinkTarget(link.resolvedPath)) {
          const depNode = this.buildNodeRecursive(
            link.resolvedPath,
            currentDepth + 1,
            maxDepth
          );
          dependencies.push(depNode);
        }
      }

      const node = this.createNode(filePath, currentDepth, dependencies);
      this.processingStack.delete(filePath);
      return node;

    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      this.processingStack.delete(filePath);
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