# API Reference

## Overview

This document provides comprehensive API reference for `telegraph-publisher` v2.0, focusing on the new unified options system and improved TypeScript support.

## Core Interfaces

### PublishDependenciesOptions

The primary interface for configuring dependency publishing behavior.

```typescript
interface PublishDependenciesOptions {
  /** Enable dry-run mode (preview without making changes) */
  dryRun?: boolean;
  
  /** Enable debug mode (saves Telegraph JSON artifacts, implies dryRun) */
  debug?: boolean;
  
  /** Force republication of unchanged files and bypass link verification */
  force?: boolean;
  
  /** Generate table of contents (aside block) at article start */
  generateAside?: boolean;
  
  /** Render table of contents inline within the article text */
  inlineToC?: boolean;
  
  /** Custom title for the table of contents section */
  tocTitle?: string;
  
  /** Add horizontal separators before/after table of contents */
  tocSeparators?: boolean;
}
```

#### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dryRun` | `boolean` | `false` | Preview operations without making changes |
| `debug` | `boolean` | `false` | Save Telegraph JSON artifacts (implies `dryRun`) |
| `force` | `boolean` | `false` | Force republication and bypass link verification |
| `generateAside` | `boolean` | `true` | Generate table of contents at article start |
| `inlineToC` | `boolean` | `true` | Render table of contents inline within the article text |
| `tocTitle` | `string` | `'Содержание'` | Title for the table of contents section |
| `tocSeparators` | `boolean` | `true` | Add horizontal separators around ToC |

#### Special Behaviors

- **Debug Mode**: When `debug: true` and `dryRun` is not explicitly set, `dryRun` will be automatically set to `true`
- **Force Flag**: Combines functionality of legacy `--force` and `--force-republish` flags
- **ToC Inline**: When `inlineToC: false`, table of contents is generated for EPUB navigation but not rendered inline in text
- **ToC Generation**: When `generateAside: false`, `tocTitle` and `tocSeparators` are ignored

### ValidatedPublishDependenciesOptions

Extended interface with runtime validation and metadata.

```typescript
interface ValidatedPublishDependenciesOptions extends Required<PublishDependenciesOptions> {
  /** Validation metadata */
  readonly _validated: true;
  readonly _defaults: Partial<PublishDependenciesOptions>;
}
```

## Core Classes

### PublishOptionsValidator

Provides validation and default value management for publish options.

```typescript
class PublishOptionsValidator {
  /**
   * Validate and normalize options with defaults
   */
  static validate(options: PublishDependenciesOptions = {}): ValidatedPublishDependenciesOptions

  /**
   * Extract CLI-compatible parameters for backward compatibility
   */
  static toLegacyParameters(options: ValidatedPublishDependenciesOptions): {
    dryRun: boolean;
    generateAside: boolean;
    tocTitle: string;
    tocSeparators: boolean;
  }
}
```

#### Usage Example

```typescript
import { PublishOptionsValidator } from 'telegraph-publisher';

// Validate with defaults
const validated = PublishOptionsValidator.validate({
  force: true,
  debug: true
});

console.log(validated.dryRun); // true (implied by debug)
console.log(validated.force);  // true
console.log(validated.generateAside); // true (default)
console.log(validated._validated); // true
```

### PublishOptionsBuilder

Type-safe builder pattern for constructing complex publish options.

```typescript
class PublishOptionsBuilder {
  static create(): PublishOptionsBuilder
  
  dryRun(enabled?: boolean): this
  debug(enabled?: boolean): this
  force(enabled?: boolean): this
  
  tableOfContents(config?: {
    enabled?: boolean;
    title?: string;
    separators?: boolean;
  }): this
  
  build(): PublishDependenciesOptions
  buildValidated(): ValidatedPublishDependenciesOptions
}
```

#### Usage Example

```typescript
import { PublishOptionsBuilder } from 'telegraph-publisher';

// Build complex options
const options = PublishOptionsBuilder.create()
  .force(true)
  .debug(true)
  .inlineToC(false)  // For EPUB: don't render ToC inline
  .tableOfContents({
    enabled: true,
    title: 'Table of Contents',
    separators: false
  })
  .buildValidated();

// Use with publisher
await publisher.publishDependencies('article.md', 'author', options);
```

### OptionsPropagationChain

Handles clean options transformation between different system layers.

```typescript
class OptionsPropagationChain {
  /**
   * Create validated options from CLI options
   */
  static fromCLIOptions(cliOptions: any): ValidatedPublishDependenciesOptions

  /**
   * Create options for recursive dependency calls
   */
  static forRecursiveCall(
    parentOptions: ValidatedPublishDependenciesOptions,
    overrides?: Partial<PublishDependenciesOptions>
  ): ValidatedPublishDependenciesOptions

  /**
   * Convert to publisher method options format
   */
  static toPublisherOptions(
    options: ValidatedPublishDependenciesOptions,
    withDependencies?: boolean
  ): PublisherMethodOptions
}
```

#### Usage Example

```typescript
import { OptionsPropagationChain } from 'telegraph-publisher';

// Transform CLI options
const publisherOptions = OptionsPropagationChain.fromCLIOptions({
  force: true,
  debug: true,
  aside: true,
  tocTitle: 'Contents'
});

// Create recursive call options
const recursiveOptions = OptionsPropagationChain.forRecursiveCall(
  publisherOptions,
  { generateAside: false } // Override for recursion
);
```

### LayerIntegrationPattern

Provides clean integration between CLI, Workflow, and Publisher layers.

```typescript
class LayerIntegrationPattern {
  /**
   * Transform CLI options to workflow and publisher formats
   */
  static cliToWorkflow(cliOptions: any): {
    workflowOptions: WorkflowOptions;
    publisherOptions: ValidatedPublishDependenciesOptions;
  }

  /**
   * Transform workflow options to publisher call formats  
   */
  static workflowToPublisher(
    workflowOptions: WorkflowOptions,
    publisherOptions: ValidatedPublishDependenciesOptions
  ): {
    publishCall: PublishMethodOptions;
    dependencyCall: PublishDependenciesOptions;
  }
}
```

## Publisher Methods

### publishDependencies (Updated)

Enhanced method with new options-based signature.

```typescript
async publishDependencies(
  filePath: string,
  username: string,
  options: PublishDependenciesOptions = {}
): Promise<{
  success: boolean;
  error?: string;
  publishedFiles?: string[];
}>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `filePath` | `string` | Path to the root file |
| `username` | `string` | Author username |
| `options` | `PublishDependenciesOptions` | Publishing configuration |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `success` | `boolean` | Whether the operation succeeded |
| `error` | `string?` | Error message if operation failed |
| `publishedFiles` | `string[]?` | List of successfully published files |

#### Usage Examples

```typescript
// Basic usage
const result = await publisher.publishDependencies(
  'article.md',
  'author'
);

// With options
const result = await publisher.publishDependencies(
  'article.md', 
  'author',
  {
    force: true,
    debug: true,
    generateAside: true,
    inlineToC: true,  // Render ToC inline (default for Telegraph)
    tocTitle: 'Table of Contents'
  }
);

// For EPUB: Generate ToC but don't render inline
const epubOptions = PublishOptionsBuilder.create()
  .force(true)
  .inlineToC(false)  // Don't render ToC inline for EPUB navigation
  .tableOfContents({ title: 'Contents', separators: false })
  .build();

const result = await publisher.publishDependencies(
  'article.md',
  'author', 
  epubOptions
);
```

### publishWithMetadata (Enhanced)

Main publishing method now includes `inlineToC` option.

```typescript
async publishWithMetadata(
  filePath: string,
  username: string,
  options: {
    withDependencies?: boolean;
    dryRun?: boolean;
    debug?: boolean;
    forceRepublish?: boolean;
    generateAside?: boolean;
    inlineToC?: boolean;
    tocTitle?: string;
    tocSeparators?: boolean;
  } = {}
): Promise<PublicationResult>
```

## Error Handling

### DeprecatedFlagError

Specialized error for deprecated CLI flag usage.

```typescript
class DeprecatedFlagError extends Error {
  readonly code: 'DEPRECATED_FLAG';
  readonly deprecatedFlag: string;
  readonly replacementFlag: string;
  readonly migrationGuide: string;

  constructor(deprecatedFlag: string, replacementFlag: string)
  
  getHelpMessage(): string
}
```

#### Usage Example

```typescript
import { DeprecatedFlagError } from 'telegraph-publisher';

try {
  // This would be triggered by CLI validation
  throw new DeprecatedFlagError('--force-republish', '--force');
} catch (error) {
  if (error instanceof DeprecatedFlagError) {
    console.log(error.getHelpMessage());
    // Shows user-friendly migration guidance
  }
}
```

### UserFriendlyErrorReporter

Utility for formatting CLI errors with helpful suggestions.

```typescript
class UserFriendlyErrorReporter {
  static formatCLIError(error: Error): string
  
  static reportSuccessfulMigration(from: string, to: string): void
}
```

## Validation

### CrossLayerValidation

Provides consistent validation across CLI, Workflow, and Publisher layers.

```typescript
class CrossLayerValidation {
  /**
   * Validate CLI options before propagation
   */
  static validateCLIOptions(options: any): {
    valid: boolean;
    errors: string[];
  }

  /**
   * Create contextualized error messages
   */
  static propagateValidationError(
    layer: 'CLI' | 'Workflow' | 'Publisher',
    errors: string[]
  ): Error
}
```

#### Usage Example

```typescript
import { CrossLayerValidation } from 'telegraph-publisher';

const validation = CrossLayerValidation.validateCLIOptions({
  file: 'article.md',
  force: true,
  debug: 'invalid' // Wrong type
});

if (!validation.valid) {
  const error = CrossLayerValidation.propagateValidationError(
    'CLI',
    validation.errors
  );
  throw error;
}
```

## Migration Guide

### From Legacy API

```typescript
// ❌ Old publishDependencies usage
await publisher.publishDependencies(
  'article.md',
  'author',
  true,        // dryRun
  true,        // generateAside  
  'Contents',  // tocTitle
  false        // tocSeparators
);

// ✅ New publishDependencies usage
await publisher.publishDependencies(
  'article.md',
  'author',
  {
    dryRun: true,
    generateAside: true,
    tocTitle: 'Contents', 
    tocSeparators: false,
    force: true  // New unified flag
  }
);
```

### Backward Compatibility

- `publishWithMetadata` maintains full backward compatibility
- Legacy parameter order is preserved where possible
- New options are added as optional with sensible defaults

## TypeScript Support

### Type Guards

```typescript
import { ValidatedPublishDependenciesOptions } from 'telegraph-publisher';

function isValidatedOptions(options: any): options is ValidatedPublishDependenciesOptions {
  return options && options._validated === true;
}
```

### Utility Types

```typescript
// Extract specific option types
type ForceOption = PublishDependenciesOptions['force'];
type TocOptions = Pick<PublishDependenciesOptions, 'generateAside' | 'tocTitle' | 'tocSeparators'>;

// Create partial configurations
type MinimalOptions = Required<Pick<PublishDependenciesOptions, 'dryRun' | 'force'>>;
```

## Best Practices

### 1. Use Builder Pattern for Complex Options

```typescript
// ✅ Recommended for complex scenarios
const options = PublishOptionsBuilder.create()
  .force(true)
  .debug(process.env.NODE_ENV === 'development')
  .tableOfContents({
    enabled: !isSimpleArticle,
    title: getLocalizedTitle(),
    separators: shouldUseSeparators()
  })
  .buildValidated();
```

### 2. Validate Options Early

```typescript
// ✅ Validate at boundaries
const validation = CrossLayerValidation.validateCLIOptions(userInput);
if (!validation.valid) {
  throw CrossLayerValidation.propagateValidationError('CLI', validation.errors);
}
```

### 3. Use Type-Safe Options Propagation

```typescript
// ✅ Use propagation helpers instead of manual transformation
const { workflowOptions, publisherOptions } = LayerIntegrationPattern.cliToWorkflow(cliInput);
```

### 4. Handle Deprecated Flags Gracefully

```typescript
// ✅ Provide helpful migration guidance
try {
  await processCommand(args);
} catch (error) {
  if (error instanceof DeprecatedFlagError) {
    console.error(error.getHelpMessage());
    process.exit(1);
  }
  throw error;
}
```

## Examples

See [Examples Documentation](./EXAMPLES.md) for complete usage examples and common patterns.

---

**API Version:** 2.0.0  
**Last Updated:** 2025-08-05  
**Compatibility:** Node.js 16+ required 