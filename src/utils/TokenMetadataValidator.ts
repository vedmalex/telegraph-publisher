/**
 * Creative Enhancement: Smart Validation Pattern
 * Defensive Programming с Enhanced Feedback для token validation
 */

import { ValidationResult } from '../types/metadata.js';

/**
 * Smart validator for access tokens and metadata with enhanced diagnostics
 */
export class TokenMetadataValidator {
  /**
   * Validates access token with enhanced feedback and actionable suggestions
   */
  static validateAccessToken(token: string | undefined, context: string): ValidationResult {
    if (!token) {
      return { 
        valid: false, 
        severity: 'warning',
        message: `No access token available for ${context}`,
        suggestions: [
          'Add accessToken to file front-matter',
          'Configure .telegraph-publisher-config.json',
          'Use --token CLI flag'
        ]
      };
    }

    if (!this.isValidTokenFormat(token)) {
      return {
        valid: false,
        severity: 'error', 
        message: `Invalid token format for ${context}`,
        suggestions: ['Verify token from Telegraph account settings']
      };
    }

    if (this.isTokenExpired(token)) {
      return {
        valid: false,
        severity: 'error',
        message: `Access token appears to be expired for ${context}`,
        suggestions: [
          'Generate new token from Telegraph account',
          'Update token in configuration files'
        ]
      };
    }

    return { 
      valid: true, 
      severity: 'info',
      message: `Valid token for ${context}` 
    };
  }

  /**
   * Validates token source hierarchy for diagnostic purposes
   */
  static validateTokenSource(
    source: 'metadata' | 'cache' | 'config' | 'session' | 'backfilled',
    context: string
  ): ValidationResult {
    const sourceHierarchy = {
      'metadata': { priority: 1, description: 'File front-matter (highest priority)' },
      'cache': { priority: 2, description: 'Pages cache (high priority)' },
      'config': { priority: 3, description: 'Configuration file (medium priority)' },
      'session': { priority: 4, description: 'CLI session (lowest priority)' },
      'backfilled': { priority: 5, description: 'Auto-backfilled token' }
    };

    const sourceInfo = sourceHierarchy[source];
    
    return {
      valid: true,
      severity: 'info',
      message: `Token source: ${sourceInfo.description} for ${context}`,
      suggestions: source === 'session' ? [
        'Consider adding accessToken to file metadata for consistency',
        'Configure project-level token in .telegraph-publisher-config.json'
      ] : undefined
    };
  }

  /**
   * Validates metadata consistency between file and cache
   */
  static validateMetadataConsistency(
    fileToken: string | undefined,
    cacheToken: string | undefined,
    context: string
  ): ValidationResult {
    if (!fileToken && !cacheToken) {
      return {
        valid: false,
        severity: 'warning',
        message: `No token found in file or cache for ${context}`,
        suggestions: [
          'Add accessToken to file front-matter',
          'Republish file to update cache'
        ]
      };
    }

    if (fileToken && cacheToken && fileToken !== cacheToken) {
      return {
        valid: false,
        severity: 'warning',
        message: `Token mismatch between file and cache for ${context}`,
        suggestions: [
          'File token will take priority',
          'Cache will be updated on next publication',
          'Consider using --force flag to republish'
        ]
      };
    }

    return {
      valid: true,
      severity: 'info',
      message: `Token consistency verified for ${context}`
    };
  }

  /**
   * Checks if token follows Telegraph token format pattern
   */
  private static isValidTokenFormat(token: string): boolean {
    // Telegraph tokens are typically 32+ character hexadecimal strings
    return /^[a-f0-9]{32,}$/i.test(token);
  }

  /**
   * Basic heuristic check for token expiration
   * Note: This is a simple format check, actual validation requires API call
   */
  private static isTokenExpired(token: string): boolean {
    // Placeholder for future enhanced validation
    // Could be extended to check token timestamp if available
    return false;
  }

  /**
   * Generates comprehensive validation report for debugging
   */
  static generateValidationReport(
    token: string | undefined,
    source: string,
    context: string
  ): string {
    const tokenValidation = this.validateAccessToken(token, context);
    const lines = [
      `🔍 Token Validation Report for ${context}`,
      `📍 Source: ${source}`,
      `✅ Token Present: ${token ? 'Yes' : 'No'}`,
      `🎯 Validation: ${tokenValidation.valid ? '✅ Valid' : '❌ Invalid'}`,
      `📝 Message: ${tokenValidation.message}`
    ];

    if (tokenValidation.suggestions?.length) {
      lines.push(`💡 Suggestions:`);
      tokenValidation.suggestions.forEach(suggestion => {
        lines.push(`   • ${suggestion}`);
      });
    }

    return lines.join('\n');
  }
} 