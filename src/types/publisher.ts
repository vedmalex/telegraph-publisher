/**
 * Result of dependency publishing operation
 * 
 * @interface PublishDependenciesResult
 * @description Enhanced result with link mappings for dependency tracking
 */
export interface PublishDependenciesResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** List of files that were published */
  publishedFiles?: string[];
  /** Map of original relative paths to published Telegraph URLs */
  linkMappings?: Record<string, string>;
}

/**
 * Configuration options for dependency publishing operations
 * 
 * @interface PublishDependenciesOptions
 * @description Unified options structure for controlling behavior during dependency publishing
 */
export interface PublishDependenciesOptions {
  /** Enable dry-run mode (preview without making changes) */
  dryRun?: boolean;
  
  /** Enable debug mode (saves Telegraph JSON artifacts, implies dryRun) */
  debug?: boolean;
  
  /** Force republication of unchanged files and bypass link verification */
  force?: boolean;
  
  /** Generate table of contents (aside block) at article start */
  generateAside?: boolean;
  
  /** Custom title for the table of contents section */
  tocTitle?: string;
  
  /** Add horizontal separators before/after table of contents */
  tocSeparators?: boolean;
}

/**
 * Extended options with runtime validation and defaults
 */
export interface ValidatedPublishDependenciesOptions extends Required<PublishDependenciesOptions> {
  /** Validation metadata */
  readonly _validated: true;
  readonly _defaults: Partial<PublishDependenciesOptions>;
}

/**
 * Options validator and defaults provider
 */
export class PublishOptionsValidator {
  private static readonly DEFAULT_OPTIONS: Required<PublishDependenciesOptions> = {
    dryRun: false,
    debug: false,
    force: false,
    generateAside: true,
    tocTitle: 'Содержание',
    tocSeparators: true
  };

  /**
   * Validate and normalize options with defaults
   */
  static validate(options: PublishDependenciesOptions = {}): ValidatedPublishDependenciesOptions {
    // Debug mode implies dry-run for safety
    if (options.debug && options.dryRun === undefined) {
      options.dryRun = true;
    }

    const validated = {
      ...this.DEFAULT_OPTIONS,
      ...options,
      _validated: true as const,
      _defaults: { ...this.DEFAULT_OPTIONS }
    };

    return validated;
  }

  /**
   * Extract original CLI-compatible parameters for backward compatibility
   */
  static toLegacyParameters(options: ValidatedPublishDependenciesOptions): {
    dryRun: boolean;
    generateAside: boolean;
    tocTitle: string;
    tocSeparators: boolean;
  } {
    return {
      dryRun: options.dryRun,
      generateAside: options.generateAside,
      tocTitle: options.tocTitle,
      tocSeparators: options.tocSeparators
    };
  }
}

/**
 * Type-safe options builder pattern for complex scenarios
 */
export class PublishOptionsBuilder {
  private options: Partial<PublishDependenciesOptions> = {};

  static create(): PublishOptionsBuilder {
    return new PublishOptionsBuilder();
  }

  dryRun(enabled: boolean = true): this {
    this.options.dryRun = enabled;
    return this;
  }

  debug(enabled: boolean = true): this {
    this.options.debug = enabled;
    if (enabled && this.options.dryRun === undefined) {
      this.options.dryRun = true; // Debug implies dry-run
    }
    return this;
  }

  force(enabled: boolean = true): this {
    this.options.force = enabled;
    return this;
  }

  tableOfContents(config?: {
    enabled?: boolean;
    title?: string;
    separators?: boolean;
  }): this {
    if (config?.enabled !== undefined) {
      this.options.generateAside = config.enabled;
    }
    if (config?.title !== undefined) {
      this.options.tocTitle = config.title;
    }
    if (config?.separators !== undefined) {
      this.options.tocSeparators = config.separators;
    }
    return this;
  }

  build(): PublishDependenciesOptions {
    return { ...this.options };
  }

  buildValidated(): ValidatedPublishDependenciesOptions {
    return PublishOptionsValidator.validate(this.options);
  }
} 