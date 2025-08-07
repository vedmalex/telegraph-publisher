/**
 * Creative Enhancement: Intelligent Configuration Merging
 * Context-Aware Merging с Conflict Resolution для hierarchical configs
 */

import { ConflictReport, MergeContext } from '../types/metadata.js';

/**
 * Advanced configuration merger with intelligent conflict resolution
 */
export class IntelligentConfigMerger {
  /**
   * Deep merge two configuration objects with conflict detection
   * @param target Base configuration object
   * @param source Configuration to merge into target
   * @param mergeContext Context information for logging and debugging
   * @returns Merged configuration with conflict logging
   */
  static deepMerge<T extends Record<string, any>>(
    target: T, 
    source: Partial<T>,
    mergeContext: MergeContext = {}
  ): T {
    const result = { ...target };
    
    for (const [key, sourceValue] of Object.entries(source)) {
      if (sourceValue === undefined) continue;
      
      const targetValue = result[key];
      const currentPath = mergeContext.path ? `${mergeContext.path}.${key}` : key;
      
      // Creative Intelligence: Type-aware merging
      if (this.isObject(targetValue) && this.isObject(sourceValue)) {
        result[key] = this.deepMerge(targetValue, sourceValue, {
          ...mergeContext,
          path: currentPath
        });
      } else {
        // Creative Feature: Conflict logging
        if (targetValue !== undefined && targetValue !== sourceValue) {
          const fromPath = mergeContext.sourcePath || 'source';
          const toPath = mergeContext.targetPath || 'target';
          console.log(`🔧 Config override: ${currentPath} = ${this.formatValue(sourceValue)} (was: ${this.formatValue(targetValue)}) [${fromPath} → ${toPath}]`);
        }
        result[key] = sourceValue;
      }
    }
    
    return result;
  }

  /**
   * Detect conflicts between multiple configuration objects
   * @param configs Array of configurations with their paths
   * @returns Array of conflict reports
   */
  static detectConflicts(configs: Array<{ path: string; config: any }>): ConflictReport[] {
    const conflicts: ConflictReport[] = [];
    
    for (let i = 1; i < configs.length; i++) {
      const parentConfig = configs[i - 1];
      const childConfig = configs[i];
      
      const configConflicts = this.findValueConflicts(
        parentConfig.config, 
        childConfig.config,
        parentConfig.path,
        childConfig.path
      );
      
      conflicts.push(...configConflicts);
    }
    
    return conflicts;
  }

  /**
   * Smart merge with automatic conflict resolution
   * @param configs Array of configurations in priority order (lowest to highest)
   * @returns Merged configuration with conflict report
   */
  static smartMerge<T extends Record<string, any>>(
    configs: Array<{ path: string; config: T }>
  ): { merged: T; conflicts: ConflictReport[] } {
    if (configs.length === 0) {
      throw new Error('No configurations provided for merging');
    }

    if (configs.length === 1) {
      return { merged: configs[0].config, conflicts: [] };
    }

    let merged = { ...configs[0].config };
    const allConflicts: ConflictReport[] = [];

    // Process configurations in order (each overwrites previous)
    for (let i = 1; i < configs.length; i++) {
      const current = configs[i];
      const previous = { path: 'merged', config: merged };
      
      // Detect conflicts before merging
      const conflicts = this.findValueConflicts(
        previous.config,
        current.config,
        previous.path,
        current.path
      );
      
      allConflicts.push(...conflicts);
      
      // Perform merge
      merged = this.deepMerge(merged, current.config, {
        sourcePath: current.path,
        targetPath: 'merged'
      });
    }

    return { merged, conflicts: allConflicts };
  }

  /**
   * Find value conflicts between two configuration objects
   */
  private static findValueConflicts(
    parent: any,
    child: any,
    parentPath: string,
    childPath: string,
    objectPath: string = ''
  ): ConflictReport[] {
    const conflicts: ConflictReport[] = [];

    if (!this.isObject(parent) || !this.isObject(child)) {
      return conflicts;
    }

    for (const [key, childValue] of Object.entries(child)) {
      const parentValue = parent[key];
      const currentPath = objectPath ? `${objectPath}.${key}` : key;

      if (parentValue === undefined) {
        // No conflict - new value in child
        continue;
      }

      if (this.isObject(parentValue) && this.isObject(childValue)) {
        // Recursively check nested objects
        conflicts.push(...this.findValueConflicts(
          parentValue,
          childValue,
          parentPath,
          childPath,
          currentPath
        ));
      } else if (parentValue !== childValue) {
        // Value conflict detected
        conflicts.push({
          path: currentPath,
          parentValue,
          childValue,
          parentSource: parentPath,
          childSource: childPath,
          resolution: 'child_wins'
        });
      }
    }

    return conflicts;
  }

  /**
   * Check if a value is a plain object
   */
  private static isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Format value for logging
   */
  private static formatValue(value: any): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Validate merged configuration for common issues
   * @param config Merged configuration to validate
   * @returns Validation results with warnings/errors
   */
  static validateMergedConfig(config: any): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for circular references
    try {
      JSON.stringify(config);
    } catch (error) {
      errors.push('Configuration contains circular references');
    }

    // Check for conflicting boolean flags
    if (config.autoPublishDependencies === false && config.replaceLinksinContent === true) {
      warnings.push('replaceLinksinContent is enabled but autoPublishDependencies is disabled - links may not resolve correctly');
    }

    // Check rate limiting configuration
    if (config.rateLimiting) {
      if (config.rateLimiting.maxRetries < 0) {
        errors.push('rateLimiting.maxRetries cannot be negative');
      }
      if (config.rateLimiting.baseDelayMs < 100) {
        warnings.push('rateLimiting.baseDelayMs is very low - may trigger rate limits');
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Generate conflict resolution report for debugging
   * @param conflicts Array of detected conflicts
   * @returns Human-readable report
   */
  static generateConflictReport(conflicts: ConflictReport[]): string {
    if (conflicts.length === 0) {
      return '✅ No configuration conflicts detected';
    }

    const lines = [
      `⚠️  Configuration Conflicts Detected (${conflicts.length})`,
      '=================================================='
    ];

    conflicts.forEach((conflict, index) => {
      lines.push(`${index + 1}. Path: ${conflict.path}`);
      lines.push(`   Parent (${conflict.parentSource}): ${this.formatValue(conflict.parentValue)}`);
      lines.push(`   Child  (${conflict.childSource}): ${this.formatValue(conflict.childValue)}`);
      lines.push(`   Resolution: ${conflict.resolution}`);
      lines.push('');
    });

    lines.push('💡 Child configuration values take precedence in hierarchical loading');

    return lines.join('\n');
  }
} 