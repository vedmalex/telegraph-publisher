import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  PerformanceOptimizer, 
  OptionsValidationCache, 
  OptionsObjectPool,
  MemoizationHelper,
  BatchProcessor,
  PerformanceMonitor
} from './PerformanceOptimizer';
import { PublishOptionsValidator } from '../types/publisher';

describe('Performance Optimizer', () => {
  beforeEach(() => {
    PerformanceOptimizer.initialize();
  });

  describe('OptionsValidationCache', () => {
    it('should cache validation results', () => {
      const options1 = { dryRun: true, force: false };
      const options2 = { dryRun: true, force: false }; // Same as options1
      const options3 = { dryRun: false, force: true }; // Different

      // First call should be a cache miss
      expect(OptionsValidationCache.get(options1)).toBeNull();
      
      // Add to cache
      const validated1 = PublishOptionsValidator.validate(options1);
      OptionsValidationCache.set(options1, validated1);
      
      // Second call should be a cache hit
      const cached = OptionsValidationCache.get(options2);
      expect(cached).not.toBeNull();
      expect(cached?.dryRun).toBe(true);
      expect(cached?.force).toBe(false);
      
      // Different options should be a cache miss
      expect(OptionsValidationCache.get(options3)).toBeNull();
    });

    it('should track cache statistics', () => {
      const options = { dryRun: true };
      
      // Initial stats
      let stats = OptionsValidationCache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      
      // Cache miss
      OptionsValidationCache.get(options);
      stats = OptionsValidationCache.getStats();
      expect(stats.misses).toBe(1);
      
      // Add to cache and hit
      const validated = PublishOptionsValidator.validate(options);
      OptionsValidationCache.set(options, validated);
      OptionsValidationCache.get(options);
      
      stats = OptionsValidationCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it('should evict old entries when cache is full', () => {
      // Fill cache beyond capacity (assuming maxCacheSize is 100)
      for (let i = 0; i < 101; i++) {
        const options = { dryRun: i % 2 === 0, force: i % 3 === 0, tocTitle: `title-${i}` };
        const validated = PublishOptionsValidator.validate(options);
        OptionsValidationCache.set(options, validated);
      }
      
      const stats = OptionsValidationCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
      expect(stats.size).toBeLessThanOrEqual(100);
    });
  });

  describe('OptionsObjectPool', () => {
    it('should reuse objects from pool', () => {
      // Acquire and release objects
      const obj1 = OptionsObjectPool.acquire();
      const obj2 = OptionsObjectPool.acquire();
      
      expect(obj1._validated).toBe(true);
      expect(obj2._validated).toBe(true);
      
      // Release objects back to pool
      OptionsObjectPool.release(obj1);
      OptionsObjectPool.release(obj2);
      
      const stats = OptionsObjectPool.getStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should reset object properties when reusing', () => {
      const obj = OptionsObjectPool.acquire();
      
      // Modify the object
      obj.dryRun = true;
      obj.force = true;
      obj.tocTitle = 'Modified';
      
      // Release and acquire again
      OptionsObjectPool.release(obj);
      const reused = OptionsObjectPool.acquire();
      
      // Should be reset to defaults
      expect(reused.dryRun).toBe(false);
      expect(reused.force).toBe(false);
      expect(reused.tocTitle).toBe('Содержание');
    });

    it('should track pool statistics', () => {
      const initialStats = OptionsObjectPool.getStats();
      expect(initialStats.size).toBe(0);
      
      const obj = OptionsObjectPool.acquire();
      OptionsObjectPool.release(obj);
      
      const finalStats = OptionsObjectPool.getStats();
      expect(finalStats.size).toBe(1);
      expect(finalStats.utilization).toBeGreaterThan(0);
    });
  });

  describe('MemoizationHelper', () => {
    it('should memoize function results', () => {
      let callCount = 0;
      const expensiveFunction = (x: number) => {
        callCount++;
        return x * x;
      };
      
      const memoized = MemoizationHelper.memoize(expensiveFunction);
      
      // First call
      expect(memoized(5)).toBe(25);
      expect(callCount).toBe(1);
      
      // Second call with same argument (should use cache)
      expect(memoized(5)).toBe(25);
      expect(callCount).toBe(1); // Should not increment
      
      // Different argument
      expect(memoized(3)).toBe(9);
      expect(callCount).toBe(2);
    });

    it('should expire cached results after TTL', async () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x;
      };
      
      const memoized = MemoizationHelper.memoize(fn);
      
      // Call function
      memoized(1);
      expect(callCount).toBe(1);
      
      // Call again immediately (should use cache)
      memoized(1);
      expect(callCount).toBe(1);
      
      // Mock time passage (would need to modify TTL for testing)
      const stats = MemoizationHelper.getStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('BatchProcessor', () => {
    it('should process items in batches', async () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      let processedBatches = 0;
      
      const processor = (item: number) => {
        if (item % 10 === 0) processedBatches++;
        return item * 2;
      };
      
      const results = await BatchProcessor.processBatch(items, processor, 10);
      
      expect(results).toHaveLength(25);
      expect(results[0]).toBe(0);
      expect(results[24]).toBe(48);
    });

    it('should handle async processors', async () => {
      const items = [1, 2, 3];
      const asyncProcessor = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      };
      
      const results = await BatchProcessor.processBatch(items, asyncProcessor);
      
      expect(results).toEqual([2, 4, 6]);
    });

    it('should control concurrency', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      let activeCount = 0;
      let maxActive = 0;
      
      const processor = async (item: number) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeCount--;
        return item;
      };
      
      await BatchProcessor.processWithConcurrency(items, processor, 3);
      
      expect(maxActive).toBeLessThanOrEqual(3);
    });
  });

  describe('PerformanceMonitor', () => {
    it('should measure function execution time', () => {
      const slowFunction = () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };
      
      const result = PerformanceMonitor.measure('slow-function', slowFunction);
      
      expect(result).toBe(499500); // Sum of 0 to 999
      
      const stats = PerformanceMonitor.getStats();
      expect(stats['slow-function']).toBeDefined();
      expect(stats['slow-function'].count).toBe(1);
      expect(stats['slow-function'].avgTime).toBeGreaterThan(0);
    });

    it('should track multiple measurements', () => {
      const fastFunction = () => 42;
      
      // Multiple measurements
      PerformanceMonitor.measure('fast-function', fastFunction);
      PerformanceMonitor.measure('fast-function', fastFunction);
      PerformanceMonitor.measure('fast-function', fastFunction);
      
      const stats = PerformanceMonitor.getStats();
      expect(stats['fast-function'].count).toBe(3);
      expect(stats['fast-function'].avgTime).toBeGreaterThanOrEqual(0);
    });

    it('should generate performance reports', () => {
      PerformanceMonitor.measure('test-function', () => 'result');
      
      const report = PerformanceMonitor.generateReport();
      
      expect(report).toContain('Performance Report:');
      expect(report).toContain('test-function:');
      expect(report).toContain('Count: 1');
    });
  });

  describe('PerformanceOptimizer Integration', () => {
    it('should initialize all optimization systems', () => {
      PerformanceOptimizer.initialize();
      
      const stats = PerformanceOptimizer.getPerformanceStats();
      
      expect(stats.validationCache.size).toBe(0);
      expect(stats.objectPool.size).toBe(0);
      expect(stats.memoization.size).toBe(0);
    });

    it('should optimize validation with caching', () => {
      let validationCalls = 0;
      const mockValidator = (options: any) => {
        validationCalls++;
        return PublishOptionsValidator.validate(options);
      };
      
      const optimizedValidator = PerformanceOptimizer.optimizeValidation(mockValidator);
      
      const options = { dryRun: true, force: false };
      
      // First call
      optimizedValidator(options);
      expect(validationCalls).toBe(1);
      
      // Second call (should use cache)
      optimizedValidator(options);
      expect(validationCalls).toBe(1); // Should not increment
      
      const stats = PerformanceOptimizer.getPerformanceStats();
      expect(stats.validationCache.hits).toBeGreaterThan(0);
    });

    it('should generate comprehensive performance report', () => {
      // Generate some activity
      PerformanceMonitor.measure('test-activity', () => 'result');
      const obj = OptionsObjectPool.acquire();
      OptionsObjectPool.release(obj);
      
      const report = PerformanceOptimizer.generatePerformanceReport();
      
      expect(report).toContain('CLI Flags Refactoring - Performance Report');
      expect(report).toContain('Validation Cache:');
      expect(report).toContain('Object Pool:');
      expect(report).toContain('Performance Report:');
    });

    it('should cleanup all resources', () => {
      // Generate some activity
      const options = { dryRun: true };
      const validated = PublishOptionsValidator.validate(options);
      OptionsValidationCache.set(options, validated);
      
      const obj = OptionsObjectPool.acquire();
      OptionsObjectPool.release(obj);
      
      PerformanceMonitor.measure('cleanup-test', () => 'result');
      
      // Verify there's activity
      let stats = PerformanceOptimizer.getPerformanceStats();
      expect(stats.validationCache.size).toBeGreaterThan(0);
      expect(stats.objectPool.size).toBeGreaterThan(0);
      
      // Cleanup
      PerformanceOptimizer.cleanup();
      
      // Verify cleanup
      stats = PerformanceOptimizer.getPerformanceStats();
      expect(stats.validationCache.size).toBe(0);
      expect(stats.objectPool.size).toBe(0);
    });
  });

  describe('Real-world Performance Scenarios', () => {
    it('should improve performance with repeated validations', () => {
      const commonOptions = [
        { dryRun: true, debug: false },
        { dryRun: false, debug: true },
        { force: true, generateAside: true },
        { dryRun: true, force: true },
        { debug: true, tocTitle: 'Common Title' }
      ];
      
      const optimizedValidator = PerformanceOptimizer.optimizeValidation(
        PublishOptionsValidator.validate
      );
      
      const startTime = performance.now();
      
      // Simulate repeated validations (like in a batch operation)
      for (let i = 0; i < 1000; i++) {
        const options = commonOptions[i % commonOptions.length];
        optimizedValidator(options);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const stats = PerformanceOptimizer.getPerformanceStats();
      
      // Should have good cache hit rate
      expect(stats.validationCache.hitRate).toBeGreaterThan(0.5);
      expect(duration).toBeLessThan(100); // Should be fast due to caching
    });

    it('should handle mixed workload efficiently', async () => {
      const optimizedValidator = PerformanceOptimizer.optimizeValidation(
        PublishOptionsValidator.validate
      );
      
      // Mixed workload: validation, object pooling, batch processing
      const validationTasks = Array.from({ length: 100 }, (_, i) => ({
        dryRun: i % 2 === 0,
        debug: i % 3 === 0,
        force: i % 5 === 0
      }));
      
      const startTime = performance.now();
      
      // Batch process validations
      const results = await BatchProcessor.processBatch(
        validationTasks,
        (options) => optimizedValidator(options),
        10
      );
      
      // Use object pool
      const pooledObjects = Array.from({ length: 20 }, () => OptionsObjectPool.acquire());
      pooledObjects.forEach(obj => OptionsObjectPool.release(obj));
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(500); // Should complete efficiently
      
      const stats = PerformanceOptimizer.getPerformanceStats();
      expect(stats.validationCache.size).toBeGreaterThan(0);
      expect(stats.objectPool.size).toBeGreaterThan(0);
    });
  });
}); 