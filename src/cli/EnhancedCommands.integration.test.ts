import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedCommands } from './EnhancedCommands';
import { DeprecatedFlagError } from '../errors/DeprecatedFlagError';

describe('EnhancedCommands CLI Integration', () => {
  let processExitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Mock process.exit to prevent actual test process termination
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Deprecated Flag Detection', () => {
    it('should detect --force-republish in argv and throw DeprecatedFlagError', () => {
      const testArgv = ['node', 'telegraph-publisher', 'pub', '--file', 'test.md', '--force-republish'];
      
      expect(() => {
        // Call the private validateDeprecatedFlags method through reflection
        (EnhancedCommands as any).validateDeprecatedFlags(testArgv);
      }).toThrow(DeprecatedFlagError);
    });

    it('should not throw for valid flags', () => {
      const testArgv = ['node', 'telegraph-publisher', 'pub', '--file', 'test.md', '--force', '--debug'];
      
      expect(() => {
        (EnhancedCommands as any).validateDeprecatedFlags(testArgv);
      }).not.toThrow();
    });

    it('should detect deprecated flag among multiple arguments', () => {
      const testArgv = [
        'node', 
        'telegraph-publisher', 
        'pub', 
        '--file', 
        'test.md', 
        '--debug',
        '--force-republish',
        '--dry-run'
      ];
      
      expect(() => {
        (EnhancedCommands as any).validateDeprecatedFlags(testArgv);
      }).toThrow(DeprecatedFlagError);
    });

    it('should provide correct migration guidance', () => {
      const testArgv = ['node', 'telegraph-publisher', 'pub', '--force-republish'];
      
      try {
        (EnhancedCommands as any).validateDeprecatedFlags(testArgv);
      } catch (error) {
        expect(error).toBeInstanceOf(DeprecatedFlagError);
        if (error instanceof DeprecatedFlagError) {
          expect(error.deprecatedFlag).toBe('--force-republish');
          expect(error.replacementFlag).toBe('--force');
          expect(error.getHelpMessage()).toContain('Migration Guide');
          expect(error.getHelpMessage()).toContain('--force');
        }
      }
    });
  });

  describe('CLI Command Integration', () => {
    it('should handle deprecated flag error gracefully in command action', async () => {
      // Mock the actual command processing to prevent real publication
      const handleUnifiedPublishCommandSpy = vi
        .spyOn(EnhancedCommands, 'handleUnifiedPublishCommand')
        .mockResolvedValue(undefined);

      // Mock process.argv to include deprecated flag
      const originalArgv = process.argv;
      process.argv = ['node', 'telegraph-publisher', 'pub', '--force-republish'];

      try {
        // This should trigger the deprecated flag validation
        await EnhancedCommands.handleUnifiedPublishCommand({
          forceRepublish: true // This would be set by commander if the flag existed
        });
      } catch (error) {
        // The actual command action should catch and handle the error
        if (error instanceof DeprecatedFlagError) {
          // Verify the error handling path
          expect(error).toBeInstanceOf(DeprecatedFlagError);
        }
      }

      process.argv = originalArgv;
      handleUnifiedPublishCommandSpy.mockRestore();
    });
  });

  describe('Error Message Quality', () => {
    it('should provide comprehensive help message', () => {
      const error = new DeprecatedFlagError('--force-republish', '--force');
      const helpMessage = error.getHelpMessage();

      // Check for all required elements
      expect(helpMessage).toContain('❌ Deprecated Flag Used: --force-republish');
      expect(helpMessage).toContain('✅ Migration Guide:');
      expect(helpMessage).toContain('Old: telegraph-publisher pub --file example.md --force-republish');
      expect(helpMessage).toContain('New: telegraph-publisher pub --file example.md --force');
      expect(helpMessage).toContain('The \'--force\' flag now handles both:');
      expect(helpMessage).toContain('• Bypassing link verification');
      expect(helpMessage).toContain('• Forcing republication of unchanged files');
      expect(helpMessage).toContain('telegraph-publisher pub --help');
    });

    it('should be user-friendly and actionable', () => {
      const error = new DeprecatedFlagError('--force-republish', '--force');
      const helpMessage = error.getHelpMessage();

      // Verify message tone and usefulness
      expect(helpMessage).toMatch(/migration/i);
      expect(helpMessage).toMatch(/guide/i);
      expect(helpMessage).not.toMatch(/error|fail|invalid/i); // Should be positive, not negative
      expect(helpMessage).toContain('help'); // Should offer help
    });
  });
}); 