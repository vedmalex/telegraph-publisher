import { describe, it, expect } from 'vitest';
import { 
  PublishOptionsValidator, 
  PublishOptionsBuilder,
  type PublishDependenciesOptions,
  type ValidatedPublishDependenciesOptions 
} from './publisher';

describe('PublishOptionsValidator', () => {
  it('should validate empty options with defaults', () => {
    const result = PublishOptionsValidator.validate();
    
    expect(result).toEqual({
      dryRun: false,
      debug: false,
      force: false,
      generateAside: true,
      tocTitle: 'Содержание',
      tocSeparators: true,
      _validated: true,
      _defaults: {
        dryRun: false,
        debug: false,
        force: false,
        generateAside: true,
        tocTitle: 'Содержание',
        tocSeparators: true
      }
    });
  });

  it('should validate partial options with remaining defaults', () => {
    const options: PublishDependenciesOptions = {
      dryRun: true,
      force: true
    };
    
    const result = PublishOptionsValidator.validate(options);
    
    expect(result.dryRun).toBe(true);
    expect(result.force).toBe(true);
    expect(result.debug).toBe(false); // default
    expect(result.generateAside).toBe(true); // default
    expect(result.tocTitle).toBe('Содержание'); // default
    expect(result.tocSeparators).toBe(true); // default
    expect(result._validated).toBe(true);
  });

  it('should apply debug implies dryRun logic', () => {
    const options: PublishDependenciesOptions = {
      debug: true
      // dryRun not specified
    };
    
    const result = PublishOptionsValidator.validate(options);
    
    expect(result.debug).toBe(true);
    expect(result.dryRun).toBe(true); // Should be set to true by debug
  });

  it('should not override explicit dryRun when debug is true', () => {
    const options: PublishDependenciesOptions = {
      debug: true,
      dryRun: false // Explicitly set to false
    };
    
    const result = PublishOptionsValidator.validate(options);
    
    expect(result.debug).toBe(true);
    expect(result.dryRun).toBe(false); // Should respect explicit value
  });

  it('should convert to legacy parameters correctly', () => {
    const validatedOptions: ValidatedPublishDependenciesOptions = {
      dryRun: true,
      debug: false,
      force: true,
      generateAside: false,
      tocTitle: 'Custom Title',
      tocSeparators: false,
      _validated: true,
      _defaults: {} as any
    };
    
    const legacy = PublishOptionsValidator.toLegacyParameters(validatedOptions);
    
    expect(legacy).toEqual({
      dryRun: true,
      generateAside: false,
      tocTitle: 'Custom Title',
      tocSeparators: false
    });
  });
});

describe('PublishOptionsBuilder', () => {
  it('should create empty builder', () => {
    const builder = PublishOptionsBuilder.create();
    const options = builder.build();
    
    expect(options).toEqual({});
  });

  it('should chain dryRun method', () => {
    const options = PublishOptionsBuilder.create()
      .dryRun(true)
      .build();
    
    expect(options.dryRun).toBe(true);
  });

  it('should default dryRun to true when called without parameter', () => {
    const options = PublishOptionsBuilder.create()
      .dryRun()
      .build();
    
    expect(options.dryRun).toBe(true);
  });

  it('should chain debug method and imply dryRun', () => {
    const options = PublishOptionsBuilder.create()
      .debug(true)
      .build();
    
    expect(options.debug).toBe(true);
    expect(options.dryRun).toBe(true); // Should be implied
  });

  it('should not override explicit dryRun when debug is enabled', () => {
    const options = PublishOptionsBuilder.create()
      .dryRun(false)
      .debug(true)
      .build();
    
    expect(options.debug).toBe(true);
    expect(options.dryRun).toBe(false); // Should not be overridden
  });

  it('should chain force method', () => {
    const options = PublishOptionsBuilder.create()
      .force(true)
      .build();
    
    expect(options.force).toBe(true);
  });

  it('should handle table of contents configuration', () => {
    const options = PublishOptionsBuilder.create()
      .tableOfContents({
        enabled: false,
        title: 'Contents',
        separators: false
      })
      .build();
    
    expect(options.generateAside).toBe(false);
    expect(options.tocTitle).toBe('Contents');
    expect(options.tocSeparators).toBe(false);
  });

  it('should handle partial table of contents configuration', () => {
    const options = PublishOptionsBuilder.create()
      .tableOfContents({
        title: 'Custom Contents'
      })
      .build();
    
    expect(options.tocTitle).toBe('Custom Contents');
    expect(options.generateAside).toBeUndefined(); // Not set
    expect(options.tocSeparators).toBeUndefined(); // Not set
  });

  it('should build validated options', () => {
    const validated = PublishOptionsBuilder.create()
      .dryRun(true)
      .force(true)
      .tableOfContents({
        enabled: true,
        title: 'Test Contents'
      })
      .buildValidated();
    
    expect(validated._validated).toBe(true);
    expect(validated.dryRun).toBe(true);
    expect(validated.force).toBe(true);
    expect(validated.generateAside).toBe(true);
    expect(validated.tocTitle).toBe('Test Contents');
  });

  it('should chain multiple method calls', () => {
    const options = PublishOptionsBuilder.create()
      .dryRun(true)
      .debug(false)
      .force(true)
      .tableOfContents({
        enabled: true,
        title: 'Multi-chain Test',
        separators: false
      })
      .build();
    
    expect(options).toEqual({
      dryRun: true,
      debug: false,
      force: true,
      generateAside: true,
      tocTitle: 'Multi-chain Test',
      tocSeparators: false
    });
  });
}); 