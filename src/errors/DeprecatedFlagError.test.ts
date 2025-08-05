import { describe, it, expect, vi } from 'vitest';
import { DeprecatedFlagError, UserFriendlyErrorReporter } from './DeprecatedFlagError';

describe('DeprecatedFlagError', () => {
  it('should create error with correct properties', () => {
    const error = new DeprecatedFlagError('--force-republish', '--force');
    
    expect(error.name).toBe('DeprecatedFlagError');
    expect(error.code).toBe('DEPRECATED_FLAG');
    expect(error.deprecatedFlag).toBe('--force-republish');
    expect(error.replacementFlag).toBe('--force');
    expect(error.migrationGuide).toBe("Use '--force' instead of '--force-republish'");
    expect(error.message).toContain('--force-republish');
    expect(error.message).toContain('deprecated');
  });

  it('should extend Error properly', () => {
    const error = new DeprecatedFlagError('--force-republish', '--force');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof DeprecatedFlagError).toBe(true);
  });

  it('should generate helpful migration message', () => {
    const error = new DeprecatedFlagError('--force-republish', '--force');
    const helpMessage = error.getHelpMessage();
    
    expect(helpMessage).toContain('❌ Deprecated Flag Used: --force-republish');
    expect(helpMessage).toContain('✅ Migration Guide:');
    expect(helpMessage).toContain('Old: telegraph-publisher pub --file example.md --force-republish');
    expect(helpMessage).toContain('New: telegraph-publisher pub --file example.md --force');
    expect(helpMessage).toContain('The \'--force\' flag now handles both:');
    expect(helpMessage).toContain('• Bypassing link verification');
    expect(helpMessage).toContain('• Forcing republication of unchanged files');
    expect(helpMessage).toContain('telegraph-publisher pub --help');
  });

  it('should work with different flag combinations', () => {
    const error = new DeprecatedFlagError('--old-flag', '--new-flag');
    
    expect(error.deprecatedFlag).toBe('--old-flag');
    expect(error.replacementFlag).toBe('--new-flag');
    expect(error.migrationGuide).toBe("Use '--new-flag' instead of '--old-flag'");
  });
});

describe('UserFriendlyErrorReporter', () => {
  it('should format deprecated flag errors with help message', () => {
    const deprecatedError = new DeprecatedFlagError('--force-republish', '--force');
    const formatted = UserFriendlyErrorReporter.formatCLIError(deprecatedError);
    
    expect(formatted).toBe(deprecatedError.getHelpMessage());
  });

  it('should format regular errors with suggestions', () => {
    const regularError = new Error('Invalid file path');
    const formatted = UserFriendlyErrorReporter.formatCLIError(regularError);
    
    expect(formatted).toContain('❌ Command Error: Invalid file path');
    expect(formatted).toContain('💡 Suggestions:');
    expect(formatted).toContain('• Check your command syntax: telegraph-publisher pub --help');
    expect(formatted).toContain('• Verify file paths exist and are accessible');
    expect(formatted).toContain('• Ensure you have proper permissions');
    expect(formatted).toContain('📖 For detailed documentation: telegraph-publisher --help');
  });

  it('should report successful migration', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    UserFriendlyErrorReporter.reportSuccessfulMigration('--force-republish', '--force');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('✅ Successfully migrated from \'--force-republish\' to \'--force\'!')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('The new \'--force\' flag provides unified functionality:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('• Bypasses link verification when needed')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('• Forces republication of unchanged content')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Your workflow will continue to work as before.')
    );
    
    consoleSpy.mockRestore();
  });
}); 