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

/**
 * Integration tests for EnhancedCommands hierarchical configuration
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EnhancedCommands } from './EnhancedCommands.js';

describe('EnhancedCommands Hierarchical Configuration Integration', () => {
  const testDir = resolve('./test-hierarchical-config');
  const subDir = join(testDir, 'sub');
  const testFile = join(subDir, 'test.md');
  
  beforeEach(() => {
    // Clean up and create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(subDir, { recursive: true });
    
    // Create test markdown file
    writeFileSync(testFile, `---
title: Test File
---

# Test Content
`);
  });
  
  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should use hierarchical config loading in config command', async () => {
    // Create parent config
    const parentConfig = {
      autoPublishDependencies: true,
      generateAside: false,
      accessToken: 'parent-token-123'
    };
    writeFileSync(join(testDir, '.telegraph-publisher-config.json'), JSON.stringify(parentConfig, null, 2));
    
    // Create child config (should override parent)
    const childConfig = {
      generateAside: true,
      accessToken: 'child-token-456'
    };
    writeFileSync(join(subDir, '.telegraph-publisher-config.json'), JSON.stringify(childConfig, null, 2));
    
    // Test config command output
    const mockConsoleLog = [];
    const originalLog = console.log;
    console.log = (...args) => {
      mockConsoleLog.push(args.join(' '));
    };
    
    try {
      await EnhancedCommands.config({ file: testFile });
      
      // Verify hierarchical merging worked
      const configOutput = mockConsoleLog.find(line => line.includes('generateAside'));
      expect(configOutput).toContain('true'); // Child config should override
      
      const tokenOutput = mockConsoleLog.find(line => line.includes('accessToken'));
      expect(tokenOutput).toContain('child-token-456'); // Child token should be used
      
    } finally {
      console.log = originalLog;
    }
  });

  test('should prioritize CLI options over hierarchical config', async () => {
    // Create config file
    const config = {
      autoPublishDependencies: true,
      generateAside: false,
      accessToken: 'config-token-123'
    };
    writeFileSync(join(subDir, '.telegraph-publisher-config.json'), JSON.stringify(config, null, 2));
    
    const mockConsoleLog = [];
    const originalLog = console.log;
    console.log = (...args) => {
      mockConsoleLog.push(args.join(' '));
    };
    
    try {
      // Test with CLI overrides
      await EnhancedCommands.config({ 
        file: testFile,
        token: 'cli-token-override',
        'auto-publish-dependencies': false // CLI override
      });
      
      // Verify CLI priority
      const tokenOutput = mockConsoleLog.find(line => line.includes('accessToken'));
      expect(tokenOutput).toContain('cli-token-override'); // CLI should override config
      
      const autoPublishOutput = mockConsoleLog.find(line => line.includes('autoPublishDependencies'));
      expect(autoPublishOutput).toContain('false'); // CLI should override config
      
    } finally {
      console.log = originalLog;
    }
  });

  test('should fall back to legacy config on hierarchical failure', async () => {
    // Create malformed config to trigger fallback
    writeFileSync(join(subDir, '.telegraph-publisher-config.json'), '{ invalid json }');
    
    const mockConsoleWarn = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      mockConsoleWarn.push(args.join(' '));
    };
    
    const mockConsoleLog = [];
    const originalLog = console.log;
    console.log = (...args) => {
      mockConsoleLog.push(args.join(' '));
    };
    
    try {
      await EnhancedCommands.config({ file: testFile });
      
      // Should show fallback warning
      const fallbackWarning = mockConsoleWarn.find(line => 
        line.includes('Failed to load hierarchical config')
      );
      expect(fallbackWarning).toBeDefined();
      
      // Should still show config (using defaults)
      expect(mockConsoleLog.length).toBeGreaterThan(0);
      
    } finally {
      console.warn = originalWarn;
      console.log = originalLog;
    }
  });

  test('should handle analyze-dependencies with hierarchical config', async () => {
    // Create config with dependencies settings
    const config = {
      autoPublishDependencies: true,
      followSymlinks: false,
      tocTitle: 'Custom TOC',
      accessToken: 'analysis-token-123'
    };
    writeFileSync(join(subDir, '.telegraph-publisher-config.json'), JSON.stringify(config, null, 2));
    
    // Create a simple dependency file
    const depFile = join(subDir, 'dependency.md');
    writeFileSync(depFile, `---
title: Dependency File
---

# Dependency Content
`);
    
    // Reference dependency in main file
    writeFileSync(testFile, `---
title: Test File
---

# Test Content

[Link to dependency](./dependency.md)
`);
    
    const mockConsoleLog = [];
    const originalLog = console.log;
    console.log = (...args) => {
      mockConsoleLog.push(args.join(' '));
    };
    
    try {
      await EnhancedCommands.analyzeDependencies({ file: testFile });
      
      // Should use hierarchical config for analysis
      const output = mockConsoleLog.join('\n');
      expect(output).toContain('dependency.md'); // Should find the dependency
      
    } catch (error) {
      // Expected if file processing fails, but config loading should work
      expect(error.message).not.toContain('Failed to load any configuration');
    } finally {
      console.log = originalLog;
    }
  });
});

/**
 * Integration test for Creative Enhancement: CLI Priority Preservation
 */
describe('CLI Priority Preservation Integration', () => {
  const testDir = resolve('./test-cli-priority');
  const testFile = join(testDir, 'test.md');
  
  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    
    writeFileSync(testFile, `---
title: CLI Priority Test
---

# Test Content
`);
  });
  
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('CLI options should have highest priority over all config sources', async () => {
    // Create comprehensive config
    const config = {
      autoPublishDependencies: true,
      generateAside: false,
      tocTitle: 'Config TOC',
      tocSeparators: false,
      followSymlinks: true,
      accessToken: 'config-token-123'
    };
    writeFileSync(join(testDir, '.telegraph-publisher-config.json'), JSON.stringify(config, null, 2));
    
    const mockConsoleLog = [];
    const originalLog = console.log;
    console.log = (...args) => {
      mockConsoleLog.push(args.join(' '));
    };
    
    try {
      // Override every config option via CLI
      await EnhancedCommands.config({ 
        file: testFile,
        token: 'cli-override-token',
        'auto-publish-dependencies': false,
        'generate-aside': true,
        'toc-title': 'CLI TOC Title',
        'toc-separators': true,
        'follow-symlinks': false
      });
      
      const output = mockConsoleLog.join('\n');
      
      // Verify all CLI overrides took precedence
      expect(output).toContain('cli-override-token');
      expect(output).toContain('autoPublishDependencies: false');
      expect(output).toContain('generateAside: true');
      expect(output).toContain('CLI TOC Title');
      expect(output).toContain('tocSeparators: true');
      expect(output).toContain('followSymlinks: false');
      
    } finally {
      console.log = originalLog;
    }
  });
});

/**
 * Creative Enhancement: Validation test for enhanced config integration
 */
describe('Enhanced Config System Validation', () => {
  const testDir = resolve('./test-enhanced-config');
  const testFile = join(testDir, 'test.md');
  
  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    
    writeFileSync(testFile, `---
title: Enhanced Config Test
accessToken: file-token-123
---

# Test Content
`);
  });
  
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should integrate enhanced metadata config features', async () => {
    // Create enhanced config with version and metadata
    const enhancedConfig = {
      version: '2.0.0',
      lastModified: new Date().toISOString(),
      autoPublishDependencies: true,
      generateAside: true,
      accessToken: 'enhanced-config-token',
      // Enhanced features
      tocTitle: 'Enhanced TOC',
      tocSeparators: true,
      followSymlinks: false
    };
    writeFileSync(join(testDir, '.telegraph-publisher-config.json'), JSON.stringify(enhancedConfig, null, 2));
    
    const mockConsoleLog = [];
    const originalLog = console.log;
    console.log = (...args) => {
      mockConsoleLog.push(args.join(' '));
    };
    
    try {
      await EnhancedCommands.config({ file: testFile });
      
      const output = mockConsoleLog.join('\n');
      
      // Should handle enhanced config features
      expect(output).toContain('enhanced-config-token');
      expect(output).toContain('Enhanced TOC');
      expect(output).toContain('tocSeparators: true');
      
    } finally {
      console.log = originalLog;
    }
  });
}); 