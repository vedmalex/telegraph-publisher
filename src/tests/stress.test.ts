import { describe, it, expect, vi } from 'vitest';
import { PublishOptionsValidator, PublishOptionsBuilder } from '../types/publisher';
import { OptionsPropagationChain, LayerIntegrationPattern } from '../patterns/OptionsPropagation';

describe('Stress Testing and Performance', () => {
  describe('High Load Options Processing', () => {
    it('should handle 10,000 options validations without performance degradation', () => {
      const startTime = performance.now();
      const results: any[] = [];
      
      for (let i = 0; i < 10000; i++) {
        const options = {
          dryRun: i % 2 === 0,
          debug: i % 3 === 0,
          force: i % 5 === 0,
          generateAside: i % 7 === 0,
          tocTitle: `Test Title ${i}`,
          tocSeparators: i % 11 === 0
        };
        
        const validated = PublishOptionsValidator.validate(options);
        results.push(validated);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(results).toHaveLength(10000);
      expect(results.every(r => r._validated === true)).toBe(true);
      expect(duration).toBeLessThan(500); // Should complete in less than 500ms
    });

    it('should handle 1,000 concurrent builder operations', async () => {
      const startTime = performance.now();
      
      const promises = Array.from({ length: 1000 }, async (_, i) => {
        return PublishOptionsBuilder.create()
          .force(i % 2 === 0)
          .debug(i % 3 === 0)
          .dryRun(i % 5 === 0)
          .tableOfContents({
            enabled: i % 7 === 0,
            title: `Concurrent Title ${i}`,
            separators: i % 11 === 0
          })
          .buildValidated();
      });
      
      const results = await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(results).toHaveLength(1000);
      expect(results.every(r => r._validated === true)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should handle rapid propagation chain operations', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 5000; i++) {
        const cliOptions = {
          file: `test-${i}.md`,
          force: i % 2 === 0,
          debug: i % 3 === 0,
          aside: i % 5 === 0,
          tocTitle: `Title ${i}`
        };
        
        const result = OptionsPropagationChain.fromCLIOptions(cliOptions);
        expect(result._validated).toBe(true);
        
        const recursiveResult = OptionsPropagationChain.forRecursiveCall(result, {
          force: !result.force
        });
        expect(recursiveResult._validated).toBe(true);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(300); // Should complete in less than 300ms
    });
  });

  describe('Memory Pressure Testing', () => {
    it('should handle large options objects without memory leaks', () => {
      const getMemoryUsage = () => {
        if (global.gc) {
          global.gc();
        }
        return process.memoryUsage();
      };
      
      const initialMemory = getMemoryUsage();
      const largeObjects: any[] = [];
      
      // Create large options objects
      for (let i = 0; i < 100; i++) {
        const largeOptions = {
          dryRun: true,
          debug: false,
          force: true,
          generateAside: true,
          tocTitle: 'Large Title: ' + 'A'.repeat(1000),
          tocSeparators: true,
          // Add many additional properties
          ...Object.fromEntries(
            Array.from({ length: 100 }, (_, j) => [`prop${j}`, `value${j}`])
          )
        };
        
        const validated = PublishOptionsValidator.validate(largeOptions);
        largeObjects.push(validated);
      }
      
      const midMemory = getMemoryUsage();
      
      // Clear references
      largeObjects.length = 0;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = getMemoryUsage();
      
      // Memory should not have increased drastically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });

    it('should handle options with very large string values', () => {
      const veryLargeString = 'A'.repeat(1000000); // 1MB string
      
      const options = {
        dryRun: true,
        tocTitle: veryLargeString
      };
      
      const startTime = performance.now();
      const validated = PublishOptionsValidator.validate(options);
      const endTime = performance.now();
      
      expect(validated.tocTitle).toBe(veryLargeString);
      expect(validated._validated).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should process quickly
    });
  });

  describe('Error Handling Under Load', () => {
    it('should maintain error handling quality under high load', () => {
      const startTime = performance.now();
      let errorCount = 0;
      let successCount = 0;
      
      for (let i = 0; i < 1000; i++) {
        try {
          const options = {
            dryRun: i % 10 === 0 ? 'invalid' : i % 2 === 0,
            debug: i % 15 === 0 ? null : i % 3 === 0,
            force: i % 20 === 0 ? undefined : i % 5 === 0
          };
          
          const validated = PublishOptionsValidator.validate(options);
          
          if (validated._validated) {
            successCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(successCount).toBeGreaterThan(900); // Most should succeed with graceful handling
      expect(errorCount).toBeLessThan(100); // Errors should be minimal
      expect(duration).toBeLessThan(200); // Should be fast
    });

    it('should handle malformed options gracefully at scale', () => {
      const malformedInputs = [
        { dryRun: 'not-boolean', debug: [] },
        { force: {}, generateAside: Symbol('test') },
        { tocTitle: null, tocSeparators: new Date() },
        { dryRun: Infinity, debug: -Infinity },
        { force: NaN, generateAside: undefined }
      ];
      
      const startTime = performance.now();
      
      for (let i = 0; i < 200; i++) {
        malformedInputs.forEach(input => {
          expect(() => PublishOptionsValidator.validate(input)).not.toThrow();
          const result = PublishOptionsValidator.validate(input);
          expect(result._validated).toBe(true);
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(300); // Should handle gracefully and quickly
    });
  });

  describe('Concurrent Access Patterns', () => {
    it('should handle concurrent validator access safely', async () => {
      const concurrentOperations = 100;
      const operationsPerTask = 50;
      
      const tasks = Array.from({ length: concurrentOperations }, async (_, taskId) => {
        const results = [];
        
        for (let i = 0; i < operationsPerTask; i++) {
          const options = {
            dryRun: (taskId + i) % 2 === 0,
            debug: (taskId + i) % 3 === 0,
            force: (taskId + i) % 5 === 0,
            tocTitle: `Task ${taskId} Operation ${i}`
          };
          
          const validated = PublishOptionsValidator.validate(options);
          results.push(validated);
        }
        
        return results;
      });
      
      const startTime = performance.now();
      const allResults = await Promise.all(tasks);
      const endTime = performance.now();
      
      const flatResults = allResults.flat();
      
      expect(flatResults).toHaveLength(concurrentOperations * operationsPerTask);
      expect(flatResults.every(r => r._validated === true)).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete in reasonable time
    });

    it('should handle mixed read/write operations safely', async () => {
      const sharedBuilder = PublishOptionsBuilder.create();
      
      const readOperations = Array.from({ length: 50 }, async () => {
        // Read current state
        const current = sharedBuilder.build();
        return current;
      });
      
      const writeOperations = Array.from({ length: 50 }, async (_, i) => {
        // Modify builder state
        return sharedBuilder
          .force(i % 2 === 0)
          .debug(i % 3 === 0)
          .build();
      });
      
      const allOperations = [...readOperations, ...writeOperations];
      const startTime = performance.now();
      
      // Should not throw even with concurrent access
      const results = await Promise.allSettled(allOperations);
      
      const endTime = performance.now();
      
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Resource Cleanup Testing', () => {
    it('should clean up resources properly after intensive usage', () => {
      const initialHandles = process.getActiveResourcesInfo?.() || [];
      
      // Intensive usage simulation
      for (let i = 0; i < 1000; i++) {
        const builder = PublishOptionsBuilder.create();
        
        for (let j = 0; j < 10; j++) {
          builder
            .force(j % 2 === 0)
            .debug(j % 3 === 0)
            .tableOfContents({
              enabled: true,
              title: `Test ${i}-${j}`,
              separators: j % 2 === 0
            });
        }
        
        const result = builder.buildValidated();
        expect(result._validated).toBe(true);
      }
      
      // Force cleanup
      if (global.gc) {
        global.gc();
      }
      
      const finalHandles = process.getActiveResourcesInfo?.() || [];
      
      // Should not have significantly more active handles
      if (initialHandles.length > 0 && finalHandles.length > 0) {
        const handleIncrease = finalHandles.length - initialHandles.length;
        expect(handleIncrease).toBeLessThan(10); // Minimal handle increase
      }
    });

    it('should handle rapid create/destroy cycles efficiently', () => {
      const cycles = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < cycles; i++) {
        // Create
        const builder = PublishOptionsBuilder.create();
        const options = builder
          .force(true)
          .debug(i % 2 === 0)
          .buildValidated();
        
        // Use
        expect(options._validated).toBe(true);
        
        // Destroy (goes out of scope)
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should handle create/destroy cycles efficiently
      expect(duration).toBeLessThan(500);
      expect(duration / cycles).toBeLessThan(1); // Less than 1ms per cycle
    });
  });

  describe('Edge Case Performance', () => {
    it('should maintain performance with deeply nested option objects', () => {
      const createDeepObject = (depth: number): any => {
        if (depth === 0) {
          return { value: 'deep' };
        }
        return { nested: createDeepObject(depth - 1) };
      };
      
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        const deepOptions = {
          dryRun: true,
          debug: false,
          force: true,
          ...createDeepObject(20) // 20 levels deep
        };
        
        const validated = PublishOptionsValidator.validate(deepOptions);
        expect(validated._validated).toBe(true);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should handle deep objects efficiently
    });

    it('should handle options with many properties efficiently', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        const manyPropsOptions = {
          dryRun: true,
          debug: false,
          force: true,
          generateAside: true,
          tocTitle: 'Test',
          tocSeparators: true,
          // Add 1000 additional properties
          ...Object.fromEntries(
            Array.from({ length: 1000 }, (_, j) => [`prop${j}`, `value${j}`])
          )
        };
        
        const validated = PublishOptionsValidator.validate(manyPropsOptions);
        expect(validated._validated).toBe(true);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(200); // Should handle many properties efficiently
    });
  });
}); 