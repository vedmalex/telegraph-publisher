import type { PublishDependenciesOptions, ValidatedPublishDependenciesOptions } from '../types/publisher';
import { PublishOptionsValidator } from '../types/publisher';

/**
 * Options propagation middleware pattern
 */
export class OptionsPropagationChain {
  /**
   * Create options for dependency publishing from CLI options
   */
  static fromCLIOptions(cliOptions: any): ValidatedPublishDependenciesOptions {
    const publishOptions: PublishDependenciesOptions = {
      dryRun: cliOptions.dryRun || false,
      debug: cliOptions.debug || false,
      force: cliOptions.force || false, // Unified force flag
      generateAside: cliOptions.aside !== false,
      tocTitle: cliOptions.tocTitle || '',
      tocSeparators: cliOptions.tocSeparators !== false
    };

    return PublishOptionsValidator.validate(publishOptions);
  }

  /**
   * Create options for recursive dependency calls
   */
  static forRecursiveCall(
    parentOptions: ValidatedPublishDependenciesOptions,
    overrides: Partial<PublishDependenciesOptions> = {}
  ): ValidatedPublishDependenciesOptions {
    // Always disable withDependencies for recursive calls to prevent infinite loops
    const recursiveOptions: PublishDependenciesOptions = {
      ...parentOptions,
      ...overrides,
      // Preserve force/debug/dryRun behavior through recursion
      force: overrides.force ?? parentOptions.force,
      debug: overrides.debug ?? parentOptions.debug,
      dryRun: overrides.dryRun ?? parentOptions.dryRun
    };

    return PublishOptionsValidator.validate(recursiveOptions);
  }

  /**
   * Convert to publishWithMetadata/editWithMetadata options
   */
  static toPublisherOptions(
    options: ValidatedPublishDependenciesOptions,
    withDependencies: boolean = false
  ): {
    withDependencies: boolean;
    forceRepublish: boolean;
    dryRun: boolean;
    debug: boolean;
    generateAside: boolean;
    tocTitle: string;
    tocSeparators: boolean;
  } {
    return {
      withDependencies,
      forceRepublish: options.force, // Unified force behavior
      dryRun: options.dryRun,
      debug: options.debug,
      generateAside: options.generateAside,
      tocTitle: options.tocTitle,
      tocSeparators: options.tocSeparators
    };
  }
}

/**
 * Clean integration between CLI, Workflow, and Publisher layers
 */
export class LayerIntegrationPattern {
  /**
   * CLI to Workflow integration
   */
  static cliToWorkflow(cliOptions: any): {
    workflowOptions: any;
    publisherOptions: ValidatedPublishDependenciesOptions;
  } {
    // Transform CLI options to workflow format
    const workflowOptions = {
      withDependencies: cliOptions.withDependencies !== false,
      forceRepublish: cliOptions.force || false, // Simplified logic
      dryRun: cliOptions.dryRun || false,
      debug: cliOptions.debug || false,
      generateAside: cliOptions.aside !== false,
      tocTitle: cliOptions.tocTitle || '',
      tocSeparators: cliOptions.tocSeparators !== false
    };

    // Create publisher options for dependency publishing
    const publisherOptions = OptionsPropagationChain.fromCLIOptions(cliOptions);

    return { workflowOptions, publisherOptions };
  }

  /**
   * Workflow to Publisher integration
   */
  static workflowToPublisher(
    workflowOptions: any,
    publisherOptions: ValidatedPublishDependenciesOptions
  ): {
    publishCall: any;
    dependencyCall: PublishDependenciesOptions;
  } {
    return {
      publishCall: {
        withDependencies: workflowOptions.withDependencies,
        forceRepublish: workflowOptions.forceRepublish,
        dryRun: workflowOptions.dryRun,
        debug: workflowOptions.debug,
        generateAside: workflowOptions.generateAside,
        tocTitle: workflowOptions.tocTitle,
        tocSeparators: workflowOptions.tocSeparators
      },
      dependencyCall: publisherOptions
    };
  }
}

/**
 * Consistent validation across layers
 */
export class CrossLayerValidation {
  /**
   * Validate CLI options before propagation
   */
  static validateCLIOptions(options: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate file path if provided
    if (options.file && typeof options.file !== 'string') {
      errors.push('File path must be a string');
    }

    // Validate boolean flags
    const booleanFlags = ['force', 'debug', 'dryRun', 'aside', 'tocSeparators'];
    for (const flag of booleanFlags) {
      if (options[flag] !== undefined && typeof options[flag] !== 'boolean') {
        errors.push(`Flag '${flag}' must be a boolean`);
      }
    }

    // Validate string options
    if (options.tocTitle !== undefined && typeof options.tocTitle !== 'string') {
      errors.push('Table of contents title must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Propagate validation errors with context
   */
  static propagateValidationError(
    layer: 'CLI' | 'Workflow' | 'Publisher',
    errors: string[]
  ): Error {
    const context = {
      CLI: 'command line arguments',
      Workflow: 'workflow configuration', 
      Publisher: 'publisher options'
    }[layer];

    return new Error(`Invalid ${context}: ${errors.join(', ')}`);
  }
} 