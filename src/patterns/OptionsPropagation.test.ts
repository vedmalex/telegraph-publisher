import { describe, it, expect } from 'vitest';
import { 
  OptionsPropagationChain, 
  LayerIntegrationPattern,
  CrossLayerValidation 
} from './OptionsPropagation';

describe('OptionsPropagationChain', () => {
  describe('fromCLIOptions', () => {
    it('should convert CLI options to validated publisher options', () => {
      const cliOptions = {
        dryRun: true,
        debug: false,
        force: true,
        aside: false,
        tocTitle: 'Custom Title',
        tocSeparators: false
      };

      const result = OptionsPropagationChain.fromCLIOptions(cliOptions);

      expect(result.dryRun).toBe(true);
      expect(result.debug).toBe(false);
      expect(result.force).toBe(true);
      expect(result.generateAside).toBe(false);
      expect(result.tocTitle).toBe('Custom Title');
      expect(result.tocSeparators).toBe(false);
      expect(result._validated).toBe(true);
    });

    it('should handle CLI boolean negations correctly', () => {
      const cliOptions = {
        aside: false, // aside: false should become generateAside: false
        tocSeparators: false // tocSeparators: false should become tocSeparators: false
      };

      const result = OptionsPropagationChain.fromCLIOptions(cliOptions);

      expect(result.generateAside).toBe(false);
      expect(result.tocSeparators).toBe(false);
    });

    it('should apply defaults for missing CLI options', () => {
      const cliOptions = {
        force: true
        // Other options missing
      };

      const result = OptionsPropagationChain.fromCLIOptions(cliOptions);

      expect(result.force).toBe(true);
      expect(result.dryRun).toBe(false); // default
      expect(result.debug).toBe(false); // default
      expect(result.generateAside).toBe(true); // default
      expect(result.tocTitle).toBe(''); // empty string from CLI
      expect(result.tocSeparators).toBe(true); // default
    });
  });

  describe('forRecursiveCall', () => {
    it('should preserve parent options for recursive calls', () => {
      const parentOptions = {
        dryRun: true,
        debug: false,
        force: true,
        generateAside: true,
        tocTitle: 'Parent Title',
        tocSeparators: false,
        _validated: true as const,
        _defaults: {} as any
      };

      const result = OptionsPropagationChain.forRecursiveCall(parentOptions);

      expect(result.dryRun).toBe(true);
      expect(result.force).toBe(true);
      expect(result.debug).toBe(false);
      expect(result.generateAside).toBe(true);
      expect(result.tocTitle).toBe('Parent Title');
      expect(result.tocSeparators).toBe(false);
    });

    it('should allow overrides for recursive calls', () => {
      const parentOptions = {
        dryRun: true,
        debug: false,
        force: true,
        generateAside: true,
        tocTitle: 'Parent Title',
        tocSeparators: false,
        _validated: true as const,
        _defaults: {} as any
      };

      const overrides = {
        dryRun: false,
        generateAside: false
      };

      const result = OptionsPropagationChain.forRecursiveCall(parentOptions, overrides);

      expect(result.dryRun).toBe(false); // overridden
      expect(result.generateAside).toBe(false); // overridden
      expect(result.force).toBe(true); // preserved
      expect(result.debug).toBe(false); // preserved
    });
  });

  describe('toPublisherOptions', () => {
    it('should convert to publisher format correctly', () => {
      const options = {
        dryRun: true,
        debug: false,
        force: true,
        generateAside: false,
        tocTitle: 'Test Title',
        tocSeparators: false,
        _validated: true as const,
        _defaults: {} as any
      };

      const result = OptionsPropagationChain.toPublisherOptions(options, true);

      expect(result).toEqual({
        withDependencies: true,
        forceRepublish: true, // force mapped to forceRepublish
        dryRun: true,
        debug: false,
        generateAside: false,
        tocTitle: 'Test Title',
        tocSeparators: false
      });
    });

    it('should default withDependencies to false', () => {
      const options = {
        dryRun: false,
        debug: false,
        force: false,
        generateAside: true,
        tocTitle: '',
        tocSeparators: true,
        _validated: true as const,
        _defaults: {} as any
      };

      const result = OptionsPropagationChain.toPublisherOptions(options);

      expect(result.withDependencies).toBe(false);
    });
  });
});

describe('LayerIntegrationPattern', () => {
  describe('cliToWorkflow', () => {
    it('should transform CLI options to workflow and publisher formats', () => {
      const cliOptions = {
        withDependencies: true,
        force: true,
        dryRun: false,
        debug: true,
        aside: true,
        tocTitle: 'Integration Test',
        tocSeparators: false
      };

      const { workflowOptions, publisherOptions } = LayerIntegrationPattern.cliToWorkflow(cliOptions);

      // Check workflow options
      expect(workflowOptions.withDependencies).toBe(true);
      expect(workflowOptions.forceRepublish).toBe(true); // simplified logic
      expect(workflowOptions.dryRun).toBe(false);
      expect(workflowOptions.debug).toBe(true);
      expect(workflowOptions.generateAside).toBe(true);
      expect(workflowOptions.tocTitle).toBe('Integration Test');
      expect(workflowOptions.tocSeparators).toBe(false);

      // Check publisher options
      expect(publisherOptions.force).toBe(true);
      expect(publisherOptions.dryRun).toBe(false);
      expect(publisherOptions.debug).toBe(true);
      expect(publisherOptions._validated).toBe(true);
    });

    it('should handle CLI boolean negations properly', () => {
      const cliOptions = {
        withDependencies: false, // should become false
        aside: false, // should become generateAside: false
        tocSeparators: false // should become tocSeparators: false
      };

      const { workflowOptions, publisherOptions } = LayerIntegrationPattern.cliToWorkflow(cliOptions);

      expect(workflowOptions.withDependencies).toBe(false);
      expect(workflowOptions.generateAside).toBe(false);
      expect(workflowOptions.tocSeparators).toBe(false);

      expect(publisherOptions.generateAside).toBe(false);
      expect(publisherOptions.tocSeparators).toBe(false);
    });
  });

  describe('workflowToPublisher', () => {
    it('should convert workflow options to publisher call formats', () => {
      const workflowOptions = {
        withDependencies: true,
        forceRepublish: true,
        dryRun: false,
        debug: true,
        generateAside: false,
        tocTitle: 'Workflow Test',
        tocSeparators: true
      };

      const publisherOptions = {
        dryRun: false,
        debug: true,
        force: true,
        generateAside: false,
        tocTitle: 'Workflow Test',
        tocSeparators: true,
        _validated: true as const,
        _defaults: {} as any
      };

      const { publishCall, dependencyCall } = LayerIntegrationPattern.workflowToPublisher(
        workflowOptions, 
        publisherOptions
      );

      expect(publishCall.withDependencies).toBe(true);
      expect(publishCall.forceRepublish).toBe(true);
      expect(publishCall.dryRun).toBe(false);
      expect(publishCall.debug).toBe(true);

      expect(dependencyCall.force).toBe(true);
      expect(dependencyCall.debug).toBe(true);
      expect(dependencyCall.dryRun).toBe(false);
    });
  });
});

describe('CrossLayerValidation', () => {
  describe('validateCLIOptions', () => {
    it('should validate correct CLI options', () => {
      const options = {
        file: 'test.md',
        force: true,
        debug: false,
        dryRun: true,
        aside: true,
        tocSeparators: false,
        tocTitle: 'Valid Title'
      };

      const result = CrossLayerValidation.validateCLIOptions(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid file path type', () => {
      const options = {
        file: 123, // Invalid: should be string
        force: true
      };

      const result = CrossLayerValidation.validateCLIOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File path must be a string');
    });

    it('should detect invalid boolean flags', () => {
      const options = {
        force: 'true', // Invalid: should be boolean
        debug: 1, // Invalid: should be boolean
        dryRun: true // Valid
      };

      const result = CrossLayerValidation.validateCLIOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Flag 'force' must be a boolean");
      expect(result.errors).toContain("Flag 'debug' must be a boolean");
      expect(result.errors).not.toContain("Flag 'dryRun' must be a boolean");
    });

    it('should detect invalid string options', () => {
      const options = {
        tocTitle: 123 // Invalid: should be string
      };

      const result = CrossLayerValidation.validateCLIOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Table of contents title must be a string');
    });
  });

  describe('propagateValidationError', () => {
    it('should create contextualized error messages', () => {
      const errors = ['Invalid file path', 'Invalid flag type'];
      
      const cliError = CrossLayerValidation.propagateValidationError('CLI', errors);
      expect(cliError.message).toBe('Invalid command line arguments: Invalid file path, Invalid flag type');

      const workflowError = CrossLayerValidation.propagateValidationError('Workflow', errors);
      expect(workflowError.message).toBe('Invalid workflow configuration: Invalid file path, Invalid flag type');

      const publisherError = CrossLayerValidation.propagateValidationError('Publisher', errors);
      expect(publisherError.message).toBe('Invalid publisher options: Invalid file path, Invalid flag type');
    });
  });
}); 