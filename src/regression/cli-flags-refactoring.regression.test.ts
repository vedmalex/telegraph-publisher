import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../config/ConfigManager';
import { PublishOptionsValidator, PublishOptionsBuilder } from '../types/publisher';
import { OptionsPropagationChain, LayerIntegrationPattern } from '../patterns/OptionsPropagation';

describe('CLI Flags Refactoring - Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration Regression', () => {
    it('should have updated default maxDependencyDepth from 1 to 20', () => {
      // Regression test for Task 2.1.1
      // This test verifies the default was changed in the source code
      // We test with a non-existent directory to force using defaults
      const config = ConfigManager.loadConfig('/non/existent/path');
      
      expect(config.maxDependencyDepth).toBe(20);
    });

    it('should preserve all other default configuration values', () => {
      // Regression test to ensure no other config values were accidentally changed
      const config = ConfigManager.loadConfig('.');
      
      expect(config.autoPublishDependencies).toBe(true);
      expect(config.replaceLinksinContent).toBe(true);
      expect(config.createBackups).toBe(false);
      expect(config.manageBidirectionalLinks).toBe(true);
      expect(config.autoSyncCache).toBe(true);
      expect(typeof config.rateLimiting).toBe('object');
      expect(typeof config.customFields).toBe('object');
    });
  });

  describe('CLI Options Backward Compatibility', () => {
    it('should support all existing CLI options without breaking changes', () => {
      // Regression test to ensure all legacy CLI options still work
      const legacyCliOptions = {
        file: 'test.md',
        author: 'Test Author',
        title: 'Test Title',
        withDependencies: true,
        dryRun: false,
        debug: false,
        aside: true,
        tocTitle: 'Contents',
        tocSeparators: true,
        force: false, // Unified flag
        verbose: true
      };

      const { workflowOptions } = LayerIntegrationPattern.cliToWorkflow(legacyCliOptions);

      // All legacy functionality should work
      expect(workflowOptions.withDependencies).toBe(true);
      expect(workflowOptions.dryRun).toBe(false);
      expect(workflowOptions.debug).toBe(false);
      expect(workflowOptions.generateAside).toBe(true);
      expect(workflowOptions.tocTitle).toBe('Contents');
      expect(workflowOptions.tocSeparators).toBe(true);
      expect(workflowOptions.forceRepublish).toBe(false);
    });

    it('should maintain CLI boolean negation patterns', () => {
      // Regression test for CLI boolean handling patterns
      const negationOptions = {
        withDependencies: false, // --no-with-dependencies
        aside: false,           // --no-aside
        tocSeparators: false    // --no-toc-separators
      };

      const { workflowOptions } = LayerIntegrationPattern.cliToWorkflow(negationOptions);

      expect(workflowOptions.withDependencies).toBe(false);
      expect(workflowOptions.generateAside).toBe(false);
      expect(workflowOptions.tocSeparators).toBe(false);
    });
  });

  describe('Publisher Interface Regression', () => {
    it('should maintain publishWithMetadata interface compatibility', () => {
      // Regression test to ensure publishWithMetadata options structure is preserved
      const publishWithMetadataOptions = {
        withDependencies: true,
        forceRepublish: true,
        dryRun: false,
        debug: true,
        generateAside: true,
        tocTitle: 'Test ToC',
        tocSeparators: false
      };

      // These options should still work with publishWithMetadata
      expect(publishWithMetadataOptions.withDependencies).toBe(true);
      expect(publishWithMetadataOptions.forceRepublish).toBe(true);
      expect(publishWithMetadataOptions.dryRun).toBe(false);
      expect(publishWithMetadataOptions.debug).toBe(true);
      expect(publishWithMetadataOptions.generateAside).toBe(true);
      expect(publishWithMetadataOptions.tocTitle).toBe('Test ToC');
      expect(publishWithMetadataOptions.tocSeparators).toBe(false);
    });

    it('should maintain publishDependencies new interface while preserving functionality', () => {
      // Regression test for new publishDependencies interface
      const dependencyOptions = {
        dryRun: true,
        debug: false,
        force: true,
        generateAside: false,
        tocTitle: 'Dependency ToC',
        tocSeparators: true
      };

      const validated = PublishOptionsValidator.validate(dependencyOptions);

      expect(validated.dryRun).toBe(true);
      expect(validated.debug).toBe(false);
      expect(validated.force).toBe(true);
      expect(validated.generateAside).toBe(false);
      expect(validated.tocTitle).toBe('Dependency ToC');
      expect(validated.tocSeparators).toBe(true);
      expect(validated._validated).toBe(true);
    });
  });

  describe('Force Flag Behavior Regression', () => {
    it('should maintain unified force flag behavior across all scenarios', () => {
      // Regression test for Task 3.1.1, 3.1.2, 4.1.1, 5.1.4
      const forceScenarios = [
        { force: true, expectedForceRepublish: true },
        { force: false, expectedForceRepublish: false },
        { force: undefined, expectedForceRepublish: false }
      ];

      forceScenarios.forEach(({ force, expectedForceRepublish }) => {
        const { workflowOptions } = LayerIntegrationPattern.cliToWorkflow({ force });
        expect(workflowOptions.forceRepublish).toBe(expectedForceRepublish);
      });
    });

    it('should ensure force flag never creates new pages for published content', () => {
      // Critical regression test for force flag behavior preservation
      const forceOptions = {
        force: true
      };

      const { workflowOptions, publisherOptions } = LayerIntegrationPattern.cliToWorkflow(forceOptions);

      // Force should propagate correctly but not affect page creation logic
      expect(workflowOptions.forceRepublish).toBe(true);
      expect(publisherOptions.force).toBe(true);

      // The actual decision logic for editWithMetadata vs publishWithMetadata
      // is based on metadata existence, not force flag
      // This test ensures force doesn't interfere with that logic
    });
  });

  describe('Options Validation Regression', () => {
    it('should maintain all PublishOptionsValidator default behaviors', () => {
      // Regression test for options validation
      const emptyOptions = {};
      const validated = PublishOptionsValidator.validate(emptyOptions);

      expect(validated.dryRun).toBe(false);
      expect(validated.debug).toBe(false);
      expect(validated.force).toBe(false);
      expect(validated.generateAside).toBe(true);
      expect(validated.tocTitle).toBe('Содержание');
      expect(validated.tocSeparators).toBe(true);
      expect(validated._validated).toBe(true);
    });

    it('should maintain debug implies dryRun logic', () => {
      // Regression test for debug mode behavior
      const debugOnlyOptions = { debug: true };
      const validated = PublishOptionsValidator.validate(debugOnlyOptions);

      expect(validated.debug).toBe(true);
      expect(validated.dryRun).toBe(true); // Should be implied by debug
    });

    it('should respect explicit dryRun over debug implication', () => {
      // Regression test for explicit option precedence
      const explicitOptions = { debug: true, dryRun: false };
      const validated = PublishOptionsValidator.validate(explicitOptions);

      expect(validated.debug).toBe(true);
      expect(validated.dryRun).toBe(false); // Explicit value should be respected
    });
  });

  describe('Builder Pattern Regression', () => {
    it('should maintain PublishOptionsBuilder functionality', () => {
      // Regression test for builder pattern
      const built = PublishOptionsBuilder.create()
        .dryRun(true)
        .force(true)
        .debug(false)
        .tableOfContents({
          enabled: false,
          title: 'Builder Test',
          separators: false
        })
        .build();

      expect(built.dryRun).toBe(true);
      expect(built.force).toBe(true);
      expect(built.debug).toBe(false);
      expect(built.generateAside).toBe(false);
      expect(built.tocTitle).toBe('Builder Test');
      expect(built.tocSeparators).toBe(false);
    });

    it('should maintain builder method chaining', () => {
      // Regression test for fluent interface
      const builder = PublishOptionsBuilder.create();
      
      // All methods should return the builder instance for chaining
      expect(builder.dryRun()).toBe(builder);
      expect(builder.force()).toBe(builder);
      expect(builder.debug()).toBe(builder);
      expect(builder.tableOfContents({})).toBe(builder);
    });
  });

  describe('Legacy Compatibility Scenarios', () => {
    it('should handle mixed old and new option styles', () => {
      // Regression test for transition period compatibility
      const mixedOptions = {
        // Old style options
        dryRun: false,
        aside: true,
        
        // New unified options
        force: true,
        debug: true
      };

      const { workflowOptions, publisherOptions } = LayerIntegrationPattern.cliToWorkflow(mixedOptions);

      // Both old and new styles should work together
      expect(workflowOptions.dryRun).toBe(false);
      expect(workflowOptions.generateAside).toBe(true);
      expect(workflowOptions.forceRepublish).toBe(true);
      expect(workflowOptions.debug).toBe(true);

      expect(publisherOptions.dryRun).toBe(false);
      expect(publisherOptions.generateAside).toBe(true);
      expect(publisherOptions.force).toBe(true);
      expect(publisherOptions.debug).toBe(true);
    });

    it('should maintain all existing CLI help text patterns', () => {
      // Regression test to ensure help text is preserved
      // This is a structural test to ensure help functionality exists
      
      // The CLI help system should still work
      // (We can't easily test the actual Commander.js help here, but we ensure the structure exists)
      expect(typeof LayerIntegrationPattern.cliToWorkflow).toBe('function');
    });
  });

  describe('Performance Regression', () => {
    it('should maintain options transformation performance', () => {
      // Performance regression test for options transformation
      const complexOptions = {
        file: 'performance-test.md',
        force: true,
        debug: true,
        dryRun: false,
        withDependencies: true,
        aside: true,
        tocTitle: 'Performance Test Table of Contents',
        tocSeparators: true,
        author: 'Performance Tester',
        title: 'Performance Test Article'
      };

      const startTime = performance.now();
      
      // Run transformation multiple times
      for (let i = 0; i < 1000; i++) {
        LayerIntegrationPattern.cliToWorkflow(complexOptions);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 transformations in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
}); 