/**
 * Creative Enhancement: Contextual Error Intelligence
 * Multi-dimensional error analysis с personalized solutions и actionable diagnostics
 */

import { basename, dirname } from 'node:path';
import type { FileMetadata } from '../types/metadata.js';
import { TokenMetadataValidator } from '../utils/TokenMetadataValidator.js';

/**
 * Error context for multi-dimensional analysis
 */
export interface ErrorContext {
  /** Error message or code */
  error: string | Error;
  /** File being processed */
  filePath: string;
  /** Operation being performed */
  operation: 'publish' | 'edit' | 'validate' | 'cache' | 'config';
  /** File metadata if available */
  metadata?: FileMetadata;
  /** Access token used */
  accessToken?: string;
  /** Token source information */
  tokenSource?: 'metadata' | 'cache' | 'config' | 'session';
  /** Additional context */
  additionalContext?: Record<string, any>;
}

/**
 * Enhanced error solution with actionable steps
 */
export interface ErrorSolution {
  /** Solution category */
  category: 'token' | 'configuration' | 'network' | 'file' | 'permission' | 'validation';
  /** Priority level */
  priority: 'immediate' | 'high' | 'medium' | 'low';
  /** Confidence in solution */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Step-by-step action items */
  actions: string[];
  /** Technical details for advanced users */
  technicalDetails?: string;
  /** Expected outcome */
  expectedOutcome?: string;
}

/**
 * Multi-dimensional error analysis result
 */
export interface ErrorAnalysisResult {
  /** Original error context */
  context: ErrorContext;
  /** Error classification */
  classification: {
    type: 'FLOOD_WAIT' | 'PAGE_ACCESS_DENIED' | 'INVALID_TOKEN' | 'NETWORK_ERROR' | 'FILE_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN';
    severity: 'critical' | 'error' | 'warning' | 'info';
    category: 'authentication' | 'rate_limit' | 'permission' | 'configuration' | 'network' | 'data' | 'system';
  };
  /** Contextual factors */
  factors: {
    tokenMismatch?: boolean;
    configurationIssue?: boolean;
    networkConnectivity?: boolean;
    fileAccess?: boolean;
    userError?: boolean;
  };
  /** Suggested solutions (ordered by priority) */
  solutions: ErrorSolution[];
  /** Quick fixes (immediate actions) */
  quickFixes: string[];
  /** Preventive measures */
  prevention: string[];
}

/**
 * Contextual Error Analyzer with intelligent diagnostics
 */
export class ContextualErrorAnalyzer {
  /**
   * Analyze error with multi-dimensional context analysis
   * @param context Complete error context
   * @returns Comprehensive analysis with actionable solutions
   */
  static analyzeError(context: ErrorContext): ErrorAnalysisResult {
    const errorMessage = context.error instanceof Error ? context.error.message : context.error;
    const fileName = basename(context.filePath);
    
    // Phase 1: Error Classification
    const classification = this.classifyError(errorMessage, context);
    
    // Phase 2: Contextual Factor Analysis
    const factors = this.analyzeContextualFactors(context, classification);
    
    // Phase 3: Solution Generation
    const solutions = this.generateSolutions(context, classification, factors);
    
    // Phase 4: Quick Fixes & Prevention
    const quickFixes = this.generateQuickFixes(classification, factors);
    const prevention = this.generatePreventiveMeasures(classification, context);
    
    console.log(`🔍 Error analyzed: ${classification.type} (${classification.severity}) for ${fileName}`);
    
    return {
      context,
      classification,
      factors,
      solutions,
      quickFixes,
      prevention
    };
  }

  /**
   * Classify error type and severity
   * @param errorMessage Error message
   * @param context Error context
   * @returns Error classification
   */
  private static classifyError(errorMessage: string, context: ErrorContext): ErrorAnalysisResult['classification'] {
    const message = errorMessage.toLowerCase();
    
    // FLOOD_WAIT detection
    if (message.includes('flood') || message.includes('too many requests') || message.includes('rate limit')) {
      return {
        type: 'FLOOD_WAIT',
        severity: 'warning',
        category: 'rate_limit'
      };
    }
    
    // PAGE_ACCESS_DENIED detection
    if (message.includes('access denied') || message.includes('forbidden') || message.includes('unauthorized')) {
      return {
        type: 'PAGE_ACCESS_DENIED', 
        severity: 'error',
        category: 'permission'
      };
    }
    
    // Invalid token detection
    if (message.includes('token') && (message.includes('invalid') || message.includes('expired') || message.includes('unauthorized'))) {
      return {
        type: 'INVALID_TOKEN',
        severity: 'error', 
        category: 'authentication'
      };
    }
    
    // Network errors
    if (message.includes('network') || message.includes('connection') || message.includes('timeout') || message.includes('econnrefused')) {
      return {
        type: 'NETWORK_ERROR',
        severity: 'error',
        category: 'network'
      };
    }
    
    // File errors
    if (message.includes('file not found') || message.includes('enoent') || message.includes('permission denied')) {
      return {
        type: 'FILE_ERROR',
        severity: 'error',
        category: 'data'
      };
    }
    
    // Validation errors
    if (message.includes('validation') || message.includes('invalid format') || message.includes('required field')) {
      return {
        type: 'VALIDATION_ERROR',
        severity: 'warning',
        category: 'data'
      };
    }
    
    // Unknown error
    return {
      type: 'UNKNOWN',
      severity: 'error',
      category: 'system'
    };
  }

  /**
   * Analyze contextual factors that may contribute to the error
   * @param context Error context
   * @param classification Error classification
   * @returns Contextual factors
   */
  private static analyzeContextualFactors(
    context: ErrorContext, 
    classification: ErrorAnalysisResult['classification']
  ): ErrorAnalysisResult['factors'] {
    const factors: ErrorAnalysisResult['factors'] = {};
    
    // Token mismatch analysis
    if (context.metadata?.accessToken && context.accessToken && 
        context.metadata.accessToken !== context.accessToken) {
      factors.tokenMismatch = true;
    }
    
    // Configuration issue analysis
    if (!context.accessToken || (context.tokenSource === 'session' && classification.type === 'PAGE_ACCESS_DENIED')) {
      factors.configurationIssue = true;
    }
    
    // Network connectivity (heuristic)
    if (classification.category === 'network') {
      factors.networkConnectivity = true;
    }
    
    // File access issues
    if (classification.type === 'FILE_ERROR') {
      factors.fileAccess = true;
    }
    
    // User error indicators
    if (classification.type === 'VALIDATION_ERROR' || 
        (classification.type === 'PAGE_ACCESS_DENIED' && factors.tokenMismatch)) {
      factors.userError = true;
    }
    
    return factors;
  }

  /**
   * Generate contextual and personalized solutions
   * @param context Error context
   * @param classification Error classification
   * @param factors Contextual factors
   * @returns Ordered list of solutions
   */
  static generateSolutions(
    context: ErrorContext,
    classification: ErrorAnalysisResult['classification'],
    factors: ErrorAnalysisResult['factors']
  ): ErrorSolution[] {
    const solutions: ErrorSolution[] = [];
    
    switch (classification.type) {
      case 'PAGE_ACCESS_DENIED':
        solutions.push(...this.generateTokenMismatchSolutions(context, factors));
        break;
        
      case 'FLOOD_WAIT':
        solutions.push(...this.generateRateLimitSolutions(context));
        break;
        
      case 'INVALID_TOKEN':
        solutions.push(...this.generateTokenValidationSolutions(context));
        break;
        
      case 'NETWORK_ERROR':
        solutions.push(...this.generateNetworkSolutions(context));
        break;
        
      case 'FILE_ERROR':
        solutions.push(...this.generateFileAccessSolutions(context));
        break;
        
      default:
        solutions.push(this.generateGenericSolution(context, classification));
    }
    
    return solutions.sort((a, b) => {
      const priorityOrder = { 'immediate': 0, 'high': 1, 'medium': 2, 'low': 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate solutions for PAGE_ACCESS_DENIED errors
   * @param context Error context
   * @param factors Contextual factors
   * @returns Token-related solutions
   */
  static generateTokenMismatchSolutions(context: ErrorContext, factors: ErrorAnalysisResult['factors']): ErrorSolution[] {
    const fileName = basename(context.filePath);
    const solutions: ErrorSolution[] = [];
    
    if (factors.tokenMismatch) {
      solutions.push({
        category: 'token',
        priority: 'immediate',
        confidence: 'high',
        title: 'Token Mismatch Detected',
        description: `The access token in ${fileName} metadata doesn't match the token being used for the operation.`,
        actions: [
          `Update the accessToken field in ${fileName} front-matter`,
          'Or remove the accessToken field to use the current session token',
          'Or use the --token CLI flag to override both'
        ],
        technicalDetails: `File token: ${context.metadata?.accessToken?.substring(0, 8)}..., Session token: ${context.accessToken?.substring(0, 8)}...`,
        expectedOutcome: 'Page access will be restored with the correct token'
      });
    }
    
    if (!context.accessToken) {
      solutions.push({
        category: 'configuration',
        priority: 'high',
        confidence: 'high',
        title: 'Missing Access Token',
        description: 'No access token configured for this operation.',
        actions: [
          'Add accessToken to file front-matter',
          'Or configure .telegraph-publisher-config.json in project directory',
          'Or use --token CLI flag'
        ],
        expectedOutcome: 'Authentication will be enabled for Telegraph API access'
      });
    }
    
    if (context.tokenSource === 'session' && context.metadata?.accessToken) {
      solutions.push({
        category: 'token',
        priority: 'medium',
        confidence: 'medium',
        title: 'Use File Token Instead of Session',
        description: 'The file has an access token but session token is being used.',
        actions: [
          'Ensure file metadata token is being prioritized',
          'Check token resolution configuration',
          'Verify TokenContextManager is working correctly'
        ],
        technicalDetails: 'Token resolution should prioritize: File Metadata > Cache > Config > Session',
        expectedOutcome: 'File-specific token will be used for access'
      });
    }
    
    return solutions;
  }

  /**
   * Generate solutions for FLOOD_WAIT errors
   * @param context Error context
   * @returns Rate limit solutions
   */
  private static generateRateLimitSolutions(context: ErrorContext): ErrorSolution[] {
    return [{
      category: 'configuration',
      priority: 'medium',
      confidence: 'high',
      title: 'Rate Limit Management',
      description: 'Telegraph API rate limit exceeded. The system will handle this automatically.',
      actions: [
        'Wait for the intelligent queue manager to handle the delay',
        'Consider using --delay option to increase base delay between requests',
        'Use --max-retries to adjust retry behavior'
      ],
      technicalDetails: 'IntelligentRateLimitQueueManager will postpone files with long wait times and continue with others',
      expectedOutcome: 'Files will be processed efficiently despite rate limits'
    }];
  }

  /**
   * Generate solutions for invalid token errors
   * @param context Error context
   * @returns Token validation solutions
   */
  private static generateTokenValidationSolutions(context: ErrorContext): ErrorSolution[] {
    return [{
      category: 'token',
      priority: 'immediate',
      confidence: 'high',
      title: 'Invalid Access Token',
      description: 'The access token format is invalid or the token has expired.',
      actions: [
        'Generate a new access token from Telegraph account settings',
        'Update the token in configuration files or file metadata',
        'Verify token format matches Telegraph requirements (32+ hex characters)'
      ],
      expectedOutcome: 'Valid token will restore API access'
    }];
  }

  /**
   * Generate solutions for network errors
   * @param context Error context
   * @returns Network-related solutions
   */
  private static generateNetworkSolutions(context: ErrorContext): ErrorSolution[] {
    return [{
      category: 'network',
      priority: 'high',
      confidence: 'medium',
      title: 'Network Connectivity Issue',
      description: 'Unable to connect to Telegraph API servers.',
      actions: [
        'Check internet connection',
        'Verify Telegraph API is accessible (telegra.ph)',
        'Try again in a few minutes',
        'Check if firewall or proxy is blocking access'
      ],
      expectedOutcome: 'Network connectivity will be restored'
    }];
  }

  /**
   * Generate solutions for file access errors
   * @param context Error context
   * @returns File access solutions
   */
  private static generateFileAccessSolutions(context: ErrorContext): ErrorSolution[] {
    const fileName = basename(context.filePath);
    const dirName = dirname(context.filePath);
    
    return [{
      category: 'file',
      priority: 'immediate',
      confidence: 'high',
      title: 'File Access Problem',
      description: `Cannot access file ${fileName}.`,
      actions: [
        `Verify ${fileName} exists in ${dirName}`,
        'Check file permissions (readable/writable)',
        'Ensure the file path is correct',
        'Check if file is locked by another process'
      ],
      expectedOutcome: 'File will be accessible for processing'
    }];
  }

  /**
   * Generate generic solution for unknown errors
   * @param context Error context
   * @param classification Error classification
   * @returns Generic solution
   */
  private static generateGenericSolution(
    context: ErrorContext, 
    classification: ErrorAnalysisResult['classification']
  ): ErrorSolution {
    const errorMessage = context.error instanceof Error ? context.error.message : context.error;
    
    return {
      category: 'validation',
      priority: 'medium',
      confidence: 'low',
      title: 'Unknown Error',
      description: `An unexpected error occurred: ${errorMessage}`,
      actions: [
        'Check the full error message for clues',
        'Verify all configuration settings',
        'Try the operation again',
        'Report this error if it persists'
      ],
      technicalDetails: `Error type: ${classification.type}, Category: ${classification.category}`,
      expectedOutcome: 'Issue may resolve with retry or configuration adjustment'
    };
  }

  /**
   * Generate immediate quick fixes
   * @param classification Error classification
   * @param factors Contextual factors
   * @returns List of quick fix actions
   */
  private static generateQuickFixes(
    classification: ErrorAnalysisResult['classification'],
    factors: ErrorAnalysisResult['factors']
  ): string[] {
    const quickFixes: string[] = [];
    
    if (factors.tokenMismatch) {
      quickFixes.push('Remove accessToken from file metadata to use session token');
    }
    
    if (factors.configurationIssue) {
      quickFixes.push('Use --token CLI flag to override configuration');
    }
    
    if (classification.type === 'FLOOD_WAIT') {
      quickFixes.push('Wait for automatic rate limit handling');
    }
    
    if (classification.type === 'NETWORK_ERROR') {
      quickFixes.push('Check internet connection and retry');
    }
    
    return quickFixes;
  }

  /**
   * Generate preventive measures
   * @param classification Error classification
   * @param context Error context
   * @returns List of prevention strategies
   */
  private static generatePreventiveMeasures(
    classification: ErrorAnalysisResult['classification'],
    context: ErrorContext
  ): string[] {
    const prevention: string[] = [];
    
    switch (classification.category) {
      case 'authentication':
        prevention.push('Configure persistent access tokens in project configuration');
        prevention.push('Use token backfill to automatically maintain token consistency');
        break;
        
      case 'rate_limit':
        prevention.push('Use appropriate --delay settings for bulk operations');
        prevention.push('Enable intelligent queue management for large file sets');
        break;
        
      case 'permission':
        prevention.push('Maintain consistent token usage across files and sessions');
        prevention.push('Use hierarchical configuration for team collaboration');
        break;
        
      case 'network':
        prevention.push('Use retry mechanisms for network-related operations');
        prevention.push('Consider batch processing for multiple files');
        break;
    }
    
    return prevention;
  }

  /**
   * Format error analysis as human-readable report
   * @param analysis Error analysis result
   * @returns Formatted diagnostic report
   */
  static formatDiagnosticReport(analysis: ErrorAnalysisResult): string {
    const fileName = basename(analysis.context.filePath);
    const lines = [
      `🔍 Error Diagnostic Report for ${fileName}`,
      '=====================================',
      `Error Type: ${analysis.classification.type} (${analysis.classification.severity})`,
      `Category: ${analysis.classification.category}`,
      '',
      '🎯 Primary Solutions:'
    ];

    // Add top 3 solutions
    analysis.solutions.slice(0, 3).forEach((solution, i) => {
      lines.push(`${i + 1}. ${solution.title} (${solution.priority} priority)`);
      lines.push(`   ${solution.description}`);
      solution.actions.forEach(action => {
        lines.push(`   • ${action}`);
      });
      lines.push('');
    });

    // Add quick fixes if available
    if (analysis.quickFixes.length > 0) {
      lines.push('⚡ Quick Fixes:');
      analysis.quickFixes.forEach(fix => {
        lines.push(`   • ${fix}`);
      });
      lines.push('');
    }

    // Add prevention if available
    if (analysis.prevention.length > 0) {
      lines.push('🛡️ Prevention:');
      analysis.prevention.forEach(measure => {
        lines.push(`   • ${measure}`);
      });
    }

    return lines.join('\n');
  }
} 