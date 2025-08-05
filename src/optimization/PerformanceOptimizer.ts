/**
 * Performance Optimizer for CLI Flags Refactoring
 * 
 * This module provides performance optimizations for the new unified options system
 * including caching, memoization, and efficient object creation patterns.
 */

import type { PublishDependenciesOptions, ValidatedPublishDependenciesOptions } from '../types/publisher';

/**
 * Cache for validated options to avoid repeated validation
 */
class OptionsValidationCache {
  private static cache = new Map<string, ValidatedPublishDependenciesOptions>();
  private static maxCacheSize = 100; // Reasonable cache size
  private static cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Generate cache key from options object
   */
  private static generateCacheKey(options: PublishDependenciesOptions): string {
    const sortedKeys = Object.keys(options).sort();
    const keyValuePairs = sortedKeys.map(key => `${key}:${JSON.stringify(options[key as keyof PublishDependenciesOptions])}`);
    return keyValuePairs.join('|');
  }

  /**
   * Get validated options from cache or return null
   */
  static get(options: PublishDependenciesOptions): ValidatedPublishDependenciesOptions | null {
    const key = this.generateCacheKey(options);
    const cached = this.cache.get(key);
    
    if (cached) {
      this.cacheStats.hits++;
      return { ...cached }; // Return copy to prevent mutation
    }
    
    this.cacheStats.misses++;
    return null;
  }

  /**
   * Store validated options in cache
   */
  static set(options: PublishDependenciesOptions, validated: ValidatedPublishDependenciesOptions): void {
    const key = this.generateCacheKey(options);
    
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.cacheStats.evictions++;
    }
    
    this.cache.set(key, { ...validated }); // Store copy to prevent mutation
  }

  /**
   * Clear cache (useful for testing)
   */
  static clear(): void {
    this.cache.clear();
    this.cacheStats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get cache statistics
   */
  static getStats(): { hits: number; misses: number; evictions: number; size: number; hitRate: number } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? this.cacheStats.hits / total : 0;
    
    return {
      ...this.cacheStats,
      size: this.cache.size,
      hitRate: parseFloat(hitRate.toFixed(3))
    };
  }
}

/**
 * Object pool for frequently created options objects
 */
class OptionsObjectPool {
  private static pool: ValidatedPublishDependenciesOptions[] = [];
  private static maxPoolSize = 50;

  /**
   * Get an options object from the pool or create a new one
   */
  static acquire(): ValidatedPublishDependenciesOptions {
    const pooled = this.pool.pop();
    if (pooled) {
      // Reset all properties to defaults
      return this.resetObject(pooled);
    }
    
    // Create new object if pool is empty
    return this.createNewObject();
  }

  /**
   * Return an options object to the pool
   */
  static release(options: ValidatedPublishDependenciesOptions): void {
    if (this.pool.length < this.maxPoolSize) {
      this.pool.push(options);
    }
    // Otherwise let it be garbage collected
  }

  /**
   * Clear the object pool
   */
  static clear(): void {
    this.pool.length = 0;
  }

  /**
   * Get pool statistics
   */
  static getStats(): { size: number; maxSize: number; utilization: number } {
    return {
      size: this.pool.length,
      maxSize: this.maxPoolSize,
      utilization: parseFloat((this.pool.length / this.maxPoolSize).toFixed(3))
    };
  }

  private static resetObject(obj: ValidatedPublishDependenciesOptions): ValidatedPublishDependenciesOptions {
    obj.dryRun = false;
    obj.debug = false;
    obj.force = false;
    obj.generateAside = true;
    obj.tocTitle = 'Содержание';
    obj.tocSeparators = true;
    obj._validated = true;
    obj._defaults = {};
    return obj;
  }

  private static createNewObject(): ValidatedPublishDependenciesOptions {
    return {
      dryRun: false,
      debug: false,
      force: false,
      generateAside: true,
      tocTitle: 'Содержание',
      tocSeparators: true,
      _validated: true as const,
      _defaults: {}
    };
  }
}

/**
 * Memoization decorator for expensive operations
 */
class MemoizationHelper {
  private static memoCache = new Map<string, { result: any; timestamp: number }>();
  private static cacheTTL = 60000; // 1 minute TTL

  /**
   * Memoize a function with TTL support
   */
  static memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
      const now = Date.now();
      
      // Check if we have a valid cached result
      const cached = this.memoCache.get(key);
      if (cached && (now - cached.timestamp) < this.cacheTTL) {
        return cached.result;
      }
      
      // Compute and cache the result
      const result = fn(...args);
      this.memoCache.set(key, { result, timestamp: now });
      
      // Clean up expired entries periodically
      if (this.memoCache.size > 100) {
        this.cleanupExpiredEntries();
      }
      
      return result;
    }) as T;
  }

  /**
   * Clear memoization cache
   */
  static clearCache(): void {
    this.memoCache.clear();
  }

  /**
   * Get memoization statistics
   */
  static getStats(): { size: number; ttl: number } {
    return {
      size: this.memoCache.size,
      ttl: this.cacheTTL
    };
  }

  private static cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoCache.entries()) {
      if ((now - entry.timestamp) >= this.cacheTTL) {
        this.memoCache.delete(key);
      }
    }
  }
}

/**
 * Batch processor for multiple options validations
 */
class BatchProcessor {
  /**
   * Process multiple options validations in batches for better performance
   */
  static async processBatch<T>(
    items: T[],
    processor: (item: T) => Promise<any> | any,
    batchSize: number = 10
  ): Promise<any[]> {
    const results: any[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(item => {
        const result = processor(item);
        return Promise.resolve(result);
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Process items with concurrency control
   */
  static async processWithConcurrency<T>(
    items: T[],
    processor: (item: T) => Promise<any> | any,
    maxConcurrency: number = 5
  ): Promise<any[]> {
    const results: any[] = new Array(items.length);
    const executing: Promise<void>[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const promise = (async (index: number) => {
        results[index] = await processor(items[index]);
      })(i);
      
      executing.push(promise);
      
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        const finishedIndex = executing.findIndex(p => 
          p === Promise.resolve(p).then(() => p)
        );
        if (finishedIndex !== -1) {
          executing.splice(finishedIndex, 1);
        }
      }
    }
    
    await Promise.all(executing);
    return results;
  }
}

/**
 * Performance monitoring utilities
 */
class PerformanceMonitor {
  private static metrics = new Map<string, {
    count: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    avgTime: number;
  }>();

  /**
   * Measure execution time of a function
   */
  static measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    this.recordMetric(name, duration);
    return result;
  }

  /**
   * Measure async function execution time
   */
  static async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    
    this.recordMetric(name, duration);
    return result;
  }

  /**
   * Record a performance metric
   */
  private static recordMetric(name: string, duration: number): void {
    const existing = this.metrics.get(name);
    
    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.minTime = Math.min(existing.minTime, duration);
      existing.maxTime = Math.max(existing.maxTime, duration);
      existing.avgTime = existing.totalTime / existing.count;
    } else {
      this.metrics.set(name, {
        count: 1,
        totalTime: duration,
        minTime: duration,
        maxTime: duration,
        avgTime: duration
      });
    }
  }

  /**
   * Get performance statistics
   */
  static getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, metric] of this.metrics.entries()) {
      stats[name] = {
        ...metric,
        avgTime: parseFloat(metric.avgTime.toFixed(3)),
        minTime: parseFloat(metric.minTime.toFixed(3)),
        maxTime: parseFloat(metric.maxTime.toFixed(3)),
        totalTime: parseFloat(metric.totalTime.toFixed(3))
      };
    }
    
    return stats;
  }

  /**
   * Clear all metrics
   */
  static clearStats(): void {
    this.metrics.clear();
  }

  /**
   * Generate performance report
   */
  static generateReport(): string {
    const stats = this.getStats();
    const lines = ['Performance Report:', '=================='];
    
    for (const [name, metric] of Object.entries(stats)) {
      lines.push(`${name}:`);
      lines.push(`  Count: ${metric.count}`);
      lines.push(`  Avg Time: ${metric.avgTime}ms`);
      lines.push(`  Min Time: ${metric.minTime}ms`);
      lines.push(`  Max Time: ${metric.maxTime}ms`);
      lines.push(`  Total Time: ${metric.totalTime}ms`);
      lines.push('');
    }
    
    return lines.join('\n');
  }
}

/**
 * Main performance optimizer class
 */
export class PerformanceOptimizer {
  /**
   * Initialize performance optimizations
   */
  static initialize(): void {
    // Clear all caches
    OptionsValidationCache.clear();
    OptionsObjectPool.clear();
    MemoizationHelper.clearCache();
    PerformanceMonitor.clearStats();
  }

  /**
   * Get comprehensive performance statistics
   */
  static getPerformanceStats(): {
    validationCache: ReturnType<typeof OptionsValidationCache.getStats>;
    objectPool: ReturnType<typeof OptionsObjectPool.getStats>;
    memoization: ReturnType<typeof MemoizationHelper.getStats>;
    monitoring: ReturnType<typeof PerformanceMonitor.getStats>;
  } {
    return {
      validationCache: OptionsValidationCache.getStats(),
      objectPool: OptionsObjectPool.getStats(),
      memoization: MemoizationHelper.getStats(),
      monitoring: PerformanceMonitor.getStats()
    };
  }

  /**
   * Generate comprehensive performance report
   */
  static generatePerformanceReport(): string {
    const stats = this.getPerformanceStats();
    
    const lines = [
      'CLI Flags Refactoring - Performance Report',
      '==========================================',
      '',
      'Validation Cache:',
      `  Cache Size: ${stats.validationCache.size}`,
      `  Hit Rate: ${(stats.validationCache.hitRate * 100).toFixed(1)}%`,
      `  Cache Hits: ${stats.validationCache.hits}`,
      `  Cache Misses: ${stats.validationCache.misses}`,
      `  Evictions: ${stats.validationCache.evictions}`,
      '',
      'Object Pool:',
      `  Pool Size: ${stats.objectPool.size}`,
      `  Max Size: ${stats.objectPool.maxSize}`,
      `  Utilization: ${(stats.objectPool.utilization * 100).toFixed(1)}%`,
      '',
      'Memoization:',
      `  Cache Size: ${stats.memoization.size}`,
      `  TTL: ${stats.memoization.ttl}ms`,
      '',
      PerformanceMonitor.generateReport()
    ];
    
    return lines.join('\n');
  }

  /**
   * Optimize options validation with caching
   */
  static optimizeValidation<T extends (options: any) => ValidatedPublishDependenciesOptions>(
    validatorFn: T
  ): T {
    return ((options: PublishDependenciesOptions): ValidatedPublishDependenciesOptions => {
      // Try to get from cache first
      const cached = OptionsValidationCache.get(options);
      if (cached) {
        return cached;
      }
      
      // Measure validation performance
      const result = PerformanceMonitor.measure('options-validation', () => {
        return validatorFn(options);
      });
      
      // Cache the result
      OptionsValidationCache.set(options, result);
      
      return result;
    }) as T;
  }

  /**
   * Clean up all performance optimization resources
   */
  static cleanup(): void {
    OptionsValidationCache.clear();
    OptionsObjectPool.clear();
    MemoizationHelper.clearCache();
  }
}

// Export utility classes for external use
export {
  OptionsValidationCache,
  OptionsObjectPool,
  MemoizationHelper,
  BatchProcessor,
  PerformanceMonitor
}; 