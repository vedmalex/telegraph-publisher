/**
 * Structured error for deprecated CLI flags
 */
export class DeprecatedFlagError extends Error {
  readonly code = 'DEPRECATED_FLAG';
  readonly deprecatedFlag: string;
  readonly replacementFlag: string;
  readonly migrationGuide: string;

  constructor(deprecatedFlag: string, replacementFlag: string) {
    const migrationGuide = `Use '${replacementFlag}' instead of '${deprecatedFlag}'`;
    super(`Flag '${deprecatedFlag}' has been deprecated. ${migrationGuide}`);
    
    this.deprecatedFlag = deprecatedFlag;
    this.replacementFlag = replacementFlag;
    this.migrationGuide = migrationGuide;
    this.name = 'DeprecatedFlagError';
  }

  /**
   * Generate user-friendly help message
   */
  getHelpMessage(): string {
    return `
❌ Deprecated Flag Used: ${this.deprecatedFlag}

The flag '${this.deprecatedFlag}' has been removed to simplify the CLI interface.

✅ Migration Guide:
   Old: telegraph-publisher pub --file example.md ${this.deprecatedFlag}
   New: telegraph-publisher pub --file example.md ${this.replacementFlag}

📖 The '${this.replacementFlag}' flag now handles both:
   • Bypassing link verification (original --force behavior)
   • Forcing republication of unchanged files (original --force-republish behavior)

For more information, run: telegraph-publisher pub --help
    `.trim();
  }
}

/**
 * Enhanced error reporting with context
 */
export class UserFriendlyErrorReporter {
  /**
   * Format CLI errors with helpful suggestions
   */
  static formatCLIError(error: Error): string {
    if (error instanceof DeprecatedFlagError) {
      return error.getHelpMessage();
    }

    // Enhanced error formatting for other CLI errors
    return `
❌ Command Error: ${error.message}

💡 Suggestions:
   • Check your command syntax: telegraph-publisher pub --help
   • Verify file paths exist and are accessible
   • Ensure you have proper permissions

📖 For detailed documentation: telegraph-publisher --help
    `.trim();
  }

  /**
   * Report successful migration from deprecated flags
   */
  static reportSuccessfulMigration(from: string, to: string): void {
    console.log(`
✅ Successfully migrated from '${from}' to '${to}'!

The new '${to}' flag provides unified functionality:
   • Bypasses link verification when needed
   • Forces republication of unchanged content
   • Maintains all existing behavior you expect

Your workflow will continue to work as before.
    `.trim());
  }
} 