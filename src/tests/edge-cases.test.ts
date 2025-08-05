import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeprecatedFlagError, UserFriendlyErrorReporter } from '../errors/DeprecatedFlagError';
import { PublishOptionsValidator, PublishOptionsBuilder } from '../types/publisher';
import { OptionsPropagationChain, LayerIntegrationPattern } from '../patterns/OptionsPropagation';

describe('Edge Cases and Boundary Testing', () => {
  describe('Deprecated Flag Error Edge Cases', () => {
    it('should handle extremely long flag names gracefully', () => {
      const longFlag = '--' + 'a'.repeat(1000);
      const error = new DeprecatedFlagError(longFlag, '--force');
      
      expect(error.deprecatedFlag).toBe(longFlag);
      expect(error.getHelpMessage()).toContain('Migration Guide');
      expect(error.getHelpMessage().length).toBeLessThan(2000); // Reasonable message length
    });

    it('should handle special characters in flag names', () => {
      const specialFlag = '--force-republish@#$%^&*()';
      const error = new DeprecatedFlagError(specialFlag, '--force');
      
      expect(error.getHelpMessage()).toContain(specialFlag);
      expect(error.replacementFlag).toBe('--force');
    });

    it('should handle empty or minimal flag names', () => {
      const error = new DeprecatedFlagError('--a', '--b');
      
      expect(error.deprecatedFlag).toBe('--a');
      expect(error.replacementFlag).toBe('--b');
      expect(error.getHelpMessage()).toContain('Migration Guide');
    });

    it('should handle Unicode characters in flag names', () => {
      const unicodeFlag = '--强制-重新发布';
      const error = new DeprecatedFlagError(unicodeFlag, '--force');
      
      expect(error.getHelpMessage()).toContain(unicodeFlag);
      expect(() => error.getHelpMessage()).not.toThrow();
    });
  });

  describe('UserFriendlyErrorReporter Edge Cases', () => {
    it('should handle null and undefined errors gracefully', () => {
      expect(() => UserFriendlyErrorReporter.formatCLIError(null as any)).not.toThrow();
      expect(() => UserFriendlyErrorReporter.formatCLIError(undefined as any)).not.toThrow();
    });

    it('should handle errors with no message', () => {
      const error = new Error();
      error.message = '';
      
      const formatted = UserFriendlyErrorReporter.formatCLIError(error);
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should handle extremely long error messages', () => {
      const longMessage = 'Error: ' + 'a'.repeat(10000);
      const error = new Error(longMessage);
      
      const formatted = UserFriendlyErrorReporter.formatCLIError(error);
      expect(formatted).toContain('Error');
      expect(formatted.length).toBeLessThan(5000); // Should be truncated or summarized
    });
  });

  describe('PublishOptionsValidator Edge Cases', () => {
    it('should handle deeply nested object pollution', () => {
      const maliciousOptions = {
        __proto__: { malicious: true },
        constructor: { prototype: { evil: true } },
        dryRun: true,
        debug: false
      };

      const validated = PublishOptionsValidator.validate(maliciousOptions);
      
      expect(validated.dryRun).toBe(true);
      expect(validated.debug).toBe(false);
      expect(validated).not.toHaveProperty('malicious');
      expect(validated).not.toHaveProperty('evil');
    });

    it('should handle null prototype objects', () => {
      const nullProtoOptions = Object.create(null);
      nullProtoOptions.force = true;
      nullProtoOptions.generateAside = false;

      const validated = PublishOptionsValidator.validate(nullProtoOptions);
      
      expect(validated.force).toBe(true);
      expect(validated.generateAside).toBe(false);
      expect(validated._validated).toBe(true);
    });

    it('should handle circular references in options', () => {
      const circularOptions: any = { dryRun: true };
      circularOptions.self = circularOptions;

      expect(() => PublishOptionsValidator.validate(circularOptions)).not.toThrow();
      const validated = PublishOptionsValidator.validate(circularOptions);
      expect(validated.dryRun).toBe(true);
    });

    it('should handle options with getters and setters', () => {
      const optionsWithGetters = {
        get force() { return true; },
        set force(value) { /* intentionally empty */ },
        dryRun: false
      };

      const validated = PublishOptionsValidator.validate(optionsWithGetters);
      expect(validated.force).toBe(true);
      expect(validated.dryRun).toBe(false);
    });
  });

  describe('PublishOptionsBuilder Edge Cases', () => {
    it('should handle rapid method chaining with same options', () => {
      const builder = PublishOptionsBuilder.create();
      
      // Rapidly toggle the same option
      for (let i = 0; i < 100; i++) {
        builder.force(i % 2 === 0);
      }
      
      const options = builder.build();
      expect(options.force).toBe(false); // Last value should be false (99 % 2 === 1)
    });

    it('should handle table of contents with extreme values', () => {
      const veryLongTitle = 'Title: ' + 'A'.repeat(10000);
      
      const options = PublishOptionsBuilder.create()
        .tableOfContents({
          enabled: true,
          title: veryLongTitle,
          separators: true
        })
        .build();

      expect(options.generateAside).toBe(true);
      expect(options.tocTitle).toBe(veryLongTitle);
      expect(options.tocSeparators).toBe(true);
    });

    it('should handle concurrent builder usage', async () => {
      // Simulate concurrent usage of multiple builders
      const promises = Array.from({ length: 50 }, (_, i) => 
        Promise.resolve(
          PublishOptionsBuilder.create()
            .force(i % 2 === 0)
            .debug(i % 3 === 0)
            .dryRun(i % 5 === 0)
            .buildValidated()
        )
      );

      const results = await Promise.all(promises);
      
      results.forEach((result, i) => {
        expect(result.force).toBe(i % 2 === 0);
        expect(result.debug).toBe(i % 3 === 0);
        expect(result.dryRun).toBe(i % 5 === 0 || i % 3 === 0); // Debug implies dryRun
        expect(result._validated).toBe(true);
      });
    });
  });

  describe('OptionsPropagationChain Edge Cases', () => {
    it('should handle propagation with malformed CLI options', () => {
      const malformedOptions = {
        file: 'test.md',
        force: 'not-a-boolean',
        debug: null,
        aside: undefined,
        'weird-key': 'weird-value'
      };

      expect(() => OptionsPropagationChain.fromCLIOptions(malformedOptions)).not.toThrow();
      const result = OptionsPropagationChain.fromCLIOptions(malformedOptions);
      
      expect(result._validated).toBe(true);
      expect(typeof result.force).toBe('boolean');
      expect(typeof result.debug).toBe('boolean');
    });

    it('should handle recursive call with deeply nested overrides', () => {
      const baseOptions = PublishOptionsValidator.validate({
        dryRun: false,
        debug: true,
        force: false
      });

      const deepOverrides = {
        nested: {
          deep: {
            value: true
          }
        },
        force: true
      };

      const result = OptionsPropagationChain.forRecursiveCall(baseOptions, deepOverrides);
      
      expect(result.force).toBe(true); // Override applied
      expect(result.debug).toBe(true); // Base value preserved
      expect(result.dryRun).toBe(true); // Debug implies dryRun
    });

    it('should handle toPublisherOptions with undefined withDependencies', () => {
      const options = PublishOptionsValidator.validate({ force: true });
      
      const result = OptionsPropagationChain.toPublisherOptions(options, undefined);
      
      expect(result).toHaveProperty('force', true);
      expect(result).toHaveProperty('dryRun');
      expect(result).toHaveProperty('debug');
    });
  });

  describe('LayerIntegrationPattern Edge Cases', () => {
    it('should handle CLI options with unexpected data types', () => {
      const weirdCliOptions = {
        force: new Date(),
        debug: [],
        aside: {},
        tocTitle: 123,
        file: null
      };

      expect(() => LayerIntegrationPattern.cliToWorkflow(weirdCliOptions)).not.toThrow();
      const { workflowOptions, publisherOptions } = LayerIntegrationPattern.cliToWorkflow(weirdCliOptions);
      
      expect(publisherOptions._validated).toBe(true);
      expect(typeof publisherOptions.force).toBe('boolean');
      expect(typeof publisherOptions.debug).toBe('boolean');
    });

    it('should handle workflowToPublisher with mismatched options', () => {
      const workflowOptions = {
        withDependencies: true,
        forceRepublish: false
      };

      const publisherOptions = PublishOptionsValidator.validate({
        force: true,
        dryRun: false
      });

      expect(() => LayerIntegrationPattern.workflowToPublisher(workflowOptions, publisherOptions))
        .not.toThrow();
      
      const result = LayerIntegrationPattern.workflowToPublisher(workflowOptions, publisherOptions);
      expect(result).toHaveProperty('publishCall');
      expect(result).toHaveProperty('dependencyCall');
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should not leak memory with repeated options creation', () => {
      const initialMemory = process.memoryUsage();
      
      // Create many options objects
      for (let i = 0; i < 1000; i++) {
        const options = PublishOptionsBuilder.create()
          .force(i % 2 === 0)
          .debug(i % 3 === 0)
          .tableOfContents({
            enabled: true,
            title: `Title ${i}`,
            separators: i % 2 === 0
          })
          .buildValidated();
        
        // Use the options to ensure they're not optimized away
        expect(options._validated).toBe(true);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 10MB for 1000 objects)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should handle high-frequency validation calls efficiently', () => {
      const startTime = Date.now();
      
      // Perform many validation calls
      for (let i = 0; i < 10000; i++) {
        PublishOptionsValidator.validate({
          dryRun: i % 2 === 0,
          debug: i % 3 === 0,
          force: i % 5 === 0
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 10,000 validations in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Type Safety Edge Cases', () => {
    it('should maintain type safety with dynamic property access', () => {
      const options = PublishOptionsBuilder.create().force(true).buildValidated();
      
      // Dynamic property access should still maintain type information
      const dynamicKey = 'force' as keyof typeof options;
      expect(options[dynamicKey]).toBe(true);
      
      const anotherKey = '_validated' as keyof typeof options;
      expect(options[anotherKey]).toBe(true);
    });

    it('should handle options spreading and destructuring', () => {
      const baseOptions = { dryRun: true, debug: false };
      const extraOptions = { force: true, generateAside: false };
      
      const mergedOptions = { ...baseOptions, ...extraOptions };
      const validated = PublishOptionsValidator.validate(mergedOptions);
      
      const { dryRun, debug, force, generateAside } = validated;
      
      expect(dryRun).toBe(true);
      expect(debug).toBe(false);
      expect(force).toBe(true);
      expect(generateAside).toBe(false);
    });
  });

  describe('Error Recovery Edge Cases', () => {
    it('should recover gracefully from validation errors', () => {
      const invalidOptions = {
        dryRun: 'invalid-boolean',
        debug: NaN,
        force: Infinity,
        generateAside: Symbol('test'),
        tocTitle: { toString: () => { throw new Error('Bad toString'); } }
      };

      expect(() => PublishOptionsValidator.validate(invalidOptions)).not.toThrow();
      const validated = PublishOptionsValidator.validate(invalidOptions);
      
      expect(validated._validated).toBe(true);
      expect(typeof validated.dryRun).toBe('boolean');
      expect(typeof validated.debug).toBe('boolean');
      expect(typeof validated.force).toBe('boolean');
    });

    it('should handle partial option objects gracefully', () => {
      const partialOptions = { force: true }; // Only one property
      
      const validated = PublishOptionsValidator.validate(partialOptions);
      
      expect(validated.force).toBe(true);
      expect(typeof validated.dryRun).toBe('boolean');
      expect(typeof validated.debug).toBe('boolean');
      expect(typeof validated.generateAside).toBe('boolean');
      expect(typeof validated.tocTitle).toBe('string');
      expect(typeof validated.tocSeparators).toBe('boolean');
    });
  });
}); 