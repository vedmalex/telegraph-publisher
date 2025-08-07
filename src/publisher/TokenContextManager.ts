/**
 * Creative Enhancement: State Machine Architecture для Token Resolution
 * Comprehensive token context management с Chain of Responsibility pattern
 */

import type { TokenResolutionContext, ResolvedToken, FileMetadata, PublishedPageInfo } from '../types/metadata.js';
import { TokenMetadataValidator } from '../utils/TokenMetadataValidator.js';
import { MetadataManager } from '../metadata/MetadataManager.js';
import { PagesCacheManager } from '../cache/PagesCacheManager.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TokenBackfillManager, type BackfillResult } from './TokenBackfillManager.js';

/**
 * Token resolution states for state machine
 */
export enum TokenResolutionState {
  INITIAL = 'initial',
  METADATA_CHECK = 'metadata_check',
  CACHE_CHECK = 'cache_check', 
  CONFIG_CHECK = 'config_check',
  SESSION_CHECK = 'session_check',
  RESOLVED = 'resolved',
  FAILED = 'failed'
}

/**
 * Abstract base class for token resolvers (Chain of Responsibility)
 */
abstract class TokenResolver {
  protected next?: TokenResolver;

  setNext(resolver: TokenResolver): TokenResolver {
    this.next = resolver;
    return resolver;
  }

  abstract resolve(context: TokenResolutionContext): Promise<ResolvedToken>;

  protected async callNext(context: TokenResolutionContext): Promise<ResolvedToken> {
    if (this.next) {
      return await this.next.resolve(context);
    }
    return {
      success: false,
      reason: 'No more resolvers in chain'
    };
  }
}

/**
 * Metadata-based token resolver (highest priority)
 */
class MetadataTokenResolver extends TokenResolver {
  async resolve(context: TokenResolutionContext): Promise<ResolvedToken> {
    if (context.metadata?.accessToken) {
      const validation = TokenMetadataValidator.validateAccessToken(
        context.metadata.accessToken,
        `file metadata: ${context.fileName}`
      );

      if (validation.valid) {
        return {
          success: true,
          token: context.metadata.accessToken,
          source: 'metadata',
          confidence: 'high',
          message: 'Token resolved from file metadata'
        };
      } else {
        console.warn(`⚠️ Invalid token in metadata: ${validation.message}`);
      }
    }

    return await this.callNext(context);
  }
}

/**
 * Cache-based token resolver (high priority)
 */
class CacheTokenResolver extends TokenResolver {
  async resolve(context: TokenResolutionContext): Promise<ResolvedToken> {
    if (context.cacheInfo?.accessToken) {
      const validation = TokenMetadataValidator.validateAccessToken(
        context.cacheInfo.accessToken,
        `cache: ${context.fileName}`
      );

      if (validation.valid) {
        return {
          success: true,
          token: context.cacheInfo.accessToken,
          source: 'cache',
          confidence: 'high',
          message: 'Token resolved from pages cache'
        };
      } else {
        console.warn(`⚠️ Invalid token in cache: ${validation.message}`);
      }
    }

    return await this.callNext(context);
  }
}

/**
 * Configuration-based token resolver (medium priority)
 */
class ConfigTokenResolver extends TokenResolver {
  async resolve(context: TokenResolutionContext): Promise<ResolvedToken> {
    if (context.hierarchicalConfig?.accessToken) {
      const validation = TokenMetadataValidator.validateAccessToken(
        context.hierarchicalConfig.accessToken,
        `hierarchical config: ${context.fileName}`
      );

      if (validation.valid) {
        return {
          success: true,
          token: context.hierarchicalConfig.accessToken,
          source: 'config',
          confidence: 'medium',
          message: 'Token resolved from hierarchical configuration'
        };
      } else {
        console.warn(`⚠️ Invalid token in config: ${validation.message}`);
      }
    }

    return await this.callNext(context);
  }
}

/**
 * Session-based token resolver (lowest priority)
 */
class SessionTokenResolver extends TokenResolver {
  async resolve(context: TokenResolutionContext): Promise<ResolvedToken> {
    if (context.sessionToken) {
      const validation = TokenMetadataValidator.validateAccessToken(
        context.sessionToken,
        `session: ${context.fileName}`
      );

      if (validation.valid) {
        return {
          success: true,
          token: context.sessionToken,
          source: 'session',
          confidence: 'low',
          message: 'Token resolved from CLI session'
        };
      } else {
        console.warn(`⚠️ Invalid session token: ${validation.message}`);
      }
    }

    return await this.callNext(context);
  }
}

/**
 * Error handling resolver (final fallback)
 */
class ErrorTokenResolver extends TokenResolver {
  async resolve(context: TokenResolutionContext): Promise<ResolvedToken> {
    return {
      success: false,
      reason: `No valid access token found for ${context.fileName}`,
      message: 'Try adding accessToken to file metadata or configuration'
    };
  }
}

/**
 * Token Resolution State Machine with intelligent context loading
 */
export class TokenResolutionStateMachine {
  private state: TokenResolutionState = TokenResolutionState.INITIAL;
  private resolverChain: TokenResolver;

  constructor() {
    // Build resolver chain (highest to lowest priority)
    const metadataResolver = new MetadataTokenResolver();
    const cacheResolver = new CacheTokenResolver();
    const configResolver = new ConfigTokenResolver();
    const sessionResolver = new SessionTokenResolver();
    const errorResolver = new ErrorTokenResolver();

    // Chain resolvers
    metadataResolver
      .setNext(cacheResolver)
      .setNext(configResolver)  
      .setNext(sessionResolver)
      .setNext(errorResolver);

    this.resolverChain = metadataResolver;
  }

  /**
   * Resolve token using state machine logic
   * @param filePath File path for context
   * @param sessionToken Optional session token
   * @returns Resolved token with metadata
   */
  async resolveToken(filePath: string, sessionToken?: string): Promise<ResolvedToken> {
    try {
      this.state = TokenResolutionState.INITIAL;

      // Creative Enhancement: Parallel context loading для performance
      const context = await this.loadIntegratedContext(filePath, sessionToken);

      this.state = TokenResolutionState.METADATA_CHECK;
      
      // Execute resolver chain
      const result = await this.resolverChain.resolve(context);
      
      this.state = result.success ? TokenResolutionState.RESOLVED : TokenResolutionState.FAILED;
      
      return result;

    } catch (error) {
      this.state = TokenResolutionState.FAILED;
      console.error('Token resolution failed:', error);
      
      return {
        success: false,
        reason: `Token resolution error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Load integrated context for token resolution (parallel loading)
   * @param filePath File path
   * @param sessionToken Session token
   * @returns Complete resolution context
   */
  private async loadIntegratedContext(
    filePath: string, 
    sessionToken?: string
  ): Promise<TokenResolutionContext> {
    const fileName = filePath.split('/').pop() || 'unknown';

    try {
      // Creative Intelligence: Parallel context loading для optimization
      const [metadata, cacheInfo, hierarchicalConfig] = await Promise.allSettled([
        this.loadFileMetadata(filePath),
        this.loadCacheInfo(filePath),
        ConfigManager.loadHierarchicalConfig(filePath)
      ]);

      return {
        filePath,
        fileName,
        metadata: metadata.status === 'fulfilled' ? metadata.value : null,
        cacheInfo: cacheInfo.status === 'fulfilled' ? cacheInfo.value : null,
        hierarchicalConfig: hierarchicalConfig.status === 'fulfilled' ? hierarchicalConfig.value : undefined,
        sessionToken,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.warn('⚠️ Failed to load complete context, using partial:', error);
      
      // Fallback to minimal context
      return {
        filePath,
        fileName,
        metadata: null,
        cacheInfo: null,
        hierarchicalConfig: undefined,
        sessionToken,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Load file metadata safely
   * @param filePath File path
   * @returns Metadata or null
   */
  private async loadFileMetadata(filePath: string): Promise<FileMetadata | null> {
    try {
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(filePath, 'utf-8');
      return MetadataManager.parseMetadata(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Load cache information safely
   * @param filePath File path
   * @returns Cache info or null
   */
  private async loadCacheInfo(filePath: string): Promise<PublishedPageInfo | null> {
    try {
      // This would need to be enhanced to work without instantiating PagesCacheManager
      // For now, return null - will be enhanced in integration phase
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current state for debugging
   * @returns Current state
   */
  getCurrentState(): TokenResolutionState {
    return this.state;
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.state = TokenResolutionState.INITIAL;
  }
}

/**
 * Creative Enhancement: Context Isolation Pattern
 * Immutable context switching с automatic cleanup
 */
export class TokenContextManager {
  private static contextStack: TokenResolutionContext[] = [];
  private static stateMachine = new TokenResolutionStateMachine();

  /**
   * Execute operation with isolated token context
   * @param filePath File path for context
   * @param sessionToken Session token
   * @param operation Operation to execute with context
   * @returns Operation result
   */
  static async withTokenContext<T>(
    filePath: string,
    sessionToken: string | undefined,
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    // Resolve token for this context
    const resolved = await this.stateMachine.resolveToken(filePath, sessionToken);
    
    if (!resolved.success || !resolved.token) {
      throw new Error(resolved.reason || 'Failed to resolve access token');
    }

    // Create context and push to stack
    const context: TokenResolutionContext = {
      filePath,
      fileName: filePath.split('/').pop() || 'unknown',
      metadata: null, // Will be populated if needed
      cacheInfo: null,
      hierarchicalConfig: undefined,
      sessionToken,
      timestamp: new Date().toISOString()
    };

    this.contextStack.push(context);

    try {
      // Execute operation with resolved token
      console.log(`🔑 Using ${resolved.source} token for ${context.fileName} (confidence: ${resolved.confidence})`);
      
      const result = await operation(resolved.token);
      
      return result;

    } catch (error) {
      console.error(`❌ Operation failed with ${resolved.source} token:`, error);
      throw error;

    } finally {
      // Automatic cleanup - pop context from stack
      this.contextStack.pop();
    }
  }

  /**
   * Get current context for debugging
   * @returns Current context or null
   */
  static getCurrentContext(): TokenResolutionContext | null {
    if (this.contextStack.length > 0) {
      const context = this.contextStack[this.contextStack.length - 1];
      return context || null;
    }
    return null;
  }

  /**
   * Validate context integrity (defensive programming)
   * @returns Validation results
   */
  static validateContextIntegrity(): {
    valid: boolean;
    issues: string[];
    stackDepth: number;
  } {
    const issues: string[] = [];

    // Check for stack leaks
    if (this.contextStack.length > 10) {
      issues.push(`Context stack depth excessive: ${this.contextStack.length}`);
    }

    // Check for duplicate contexts
    const paths = this.contextStack.map(ctx => ctx.filePath);
    const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
    if (duplicates.length > 0) {
      issues.push(`Duplicate contexts detected: ${duplicates.join(', ')}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      stackDepth: this.contextStack.length
    };
  }

  /**
   * Clear context stack (for cleanup)
   */
  static clearContextStack(): void {
    this.contextStack = [];
    this.stateMachine.reset();
    console.log('🧹 Token context stack cleared');
  }

  /**
   * Get effective access token для file (main API method)
   * @param filePath File path to resolve token for
   * @param sessionToken Optional session token
   * @returns Resolved access token
   */
  static async getEffectiveAccessToken(
    filePath: string,
    sessionToken?: string
  ): Promise<string> {
    const resolved = await this.stateMachine.resolveToken(filePath, sessionToken);
    
    if (!resolved.success || !resolved.token) {
      throw new Error(resolved.reason || 'Failed to resolve access token');
    }

    console.log(`🔑 Resolved token from ${resolved.source} for ${filePath.split('/').pop()}`);
    
    return resolved.token;
  }

  /**
   * Creative Enhancement: Execute operation with token context and automatic backfill
   * @param filePath File path for context
   * @param sessionToken Session token
   * @param operation Operation to execute with context
   * @param operationType Type of operation for backfill
   * @param urgency Backfill urgency
   * @returns Operation result with backfill information
   */
  static async withTokenContextAndBackfill<T>(
    filePath: string,
    sessionToken: string | undefined,
    operation: (token: string) => Promise<T>,
    operationType: 'publish' | 'edit',
    urgency: 'immediate' | 'normal' | 'background' = 'normal'
  ): Promise<{ result: T; backfill?: BackfillResult }> {
    // Resolve token for this context
    const resolved = await this.stateMachine.resolveToken(filePath, sessionToken);
    
    if (!resolved.success || !resolved.token) {
      throw new Error(resolved.reason || 'Failed to resolve access token');
    }

    // Create context and push to stack
    const context: TokenResolutionContext = {
      filePath,
      fileName: filePath.split('/').pop() || 'unknown',
      metadata: null,
      cacheInfo: null,
      hierarchicalConfig: undefined,
      sessionToken,
      timestamp: new Date().toISOString()
    };

    this.contextStack.push(context);

    try {
      // Execute operation with resolved token
      console.log(`🔑 Using ${resolved.source} token for ${context.fileName} (confidence: ${resolved.confidence})`);
      
      const result = await operation(resolved.token);
      
      // Operation successful - trigger backfill if needed
      let backfillResult: BackfillResult | undefined;
      
      try {
        const backfill = await TokenBackfillManager.processSuccessfulOperation(
          filePath,
          resolved.token,
          operationType,
          urgency
        );
        
        if (backfill) {
          backfillResult = backfill;
          console.log(`🔄 Token backfill: ${backfill.strategy} strategy (${backfill.message})`);
        }
        
      } catch (backfillError) {
        console.warn('⚠️ Backfill failed but operation succeeded:', backfillError);
      }
      
      return { result, backfill: backfillResult };

    } catch (error) {
      console.error(`❌ Operation failed with ${resolved.source} token:`, error);
      throw error;

    } finally {
      // Automatic cleanup - pop context from stack
      this.contextStack.pop();
    }
  }

  /**
   * Enhanced version of getEffectiveAccessToken with operation tracking
   * @param filePath File path to resolve token for
   * @param sessionToken Optional session token
   * @param trackOperation Whether to track this as an operation for analytics
   * @returns Resolved access token with operation metadata
   */
  static async getEffectiveAccessTokenWithTracking(
    filePath: string,
    sessionToken?: string,
    trackOperation: boolean = false
  ): Promise<{ token: string; source: string; confidence: string }> {
    const resolved = await this.stateMachine.resolveToken(filePath, sessionToken);
    
    if (!resolved.success || !resolved.token) {
      throw new Error(resolved.reason || 'Failed to resolve access token');
    }

    if (trackOperation) {
      console.log(`📊 Token operation tracked: ${resolved.source} → ${filePath.split('/').pop()} (${resolved.confidence})`);
    }
    
    return {
      token: resolved.token,
      source: resolved.source || 'unknown',
      confidence: resolved.confidence || 'unknown'
    };
  }
} 