/**
 * Creative Enhancement: Event-Driven Backfill Pattern
 * Smart token backfill management с parallel execution и batching optimization
 */

import { FileMetadata } from '../types/metadata.js';
import { MetadataManager } from '../metadata/MetadataManager.js';
import { TokenMetadataValidator } from '../utils/TokenMetadataValidator.js';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Backfill opportunity detection result
 */
export interface BackfillOpportunity {
  filePath: string;
  fileName: string;
  existingMetadata: FileMetadata | null;
  suggestedToken: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Backfill strategy types
 */
export type BackfillStrategy = 'immediate' | 'batched' | 'deferred';

/**
 * Backfill execution result
 */
export interface BackfillResult {
  filePath: string;
  success: boolean;
  strategy: BackfillStrategy;
  tokensUpdated: number;
  message: string;
  executionTime: number;
}

/**
 * Event-driven token backfill manager with intelligent batching
 */
export class TokenBackfillManager {
  private static pendingBackfills = new Map<string, BackfillOpportunity>();
  private static batchTimeout: NodeJS.Timeout | null = null;
  private static readonly BATCH_DELAY_MS = 2000; // 2 seconds
  private static readonly MAX_BATCH_SIZE = 10;

  /**
   * Detect backfill opportunity для file
   * @param filePath File path to analyze
   * @param accessToken Token that was successfully used
   * @param operationType Type of operation that succeeded
   * @returns Backfill opportunity or null
   */
  static detectBackfillOpportunity(
    filePath: string,
    accessToken: string,
    operationType: 'publish' | 'edit'
  ): BackfillOpportunity | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const existingMetadata = MetadataManager.parseMetadata(content);
      
      // Check if backfill is needed
      if (existingMetadata?.accessToken === accessToken) {
        // Token already present and correct
        return null;
      }

      const fileName = filePath.split('/').pop() || 'unknown';
      
      // Determine confidence based on operation type and existing metadata
      let confidence: 'high' | 'medium' | 'low' = 'medium';
      let reason = '';

      if (operationType === 'publish') {
        confidence = 'high';
        reason = 'Successfully published - token verified';
      } else if (operationType === 'edit') {
        confidence = 'high'; 
        reason = 'Successfully edited - token verified';
      }

      if (existingMetadata?.accessToken && existingMetadata.accessToken !== accessToken) {
        confidence = 'medium';
        reason += ' (replacing existing token)';
      }

      return {
        filePath,
        fileName,
        existingMetadata,
        suggestedToken: accessToken,
        confidence,
        reason
      };

    } catch (error) {
      console.warn(`⚠️ Failed to detect backfill opportunity for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Select optimal backfill strategy based on conditions
   * @param opportunity Backfill opportunity
   * @param urgency Operation urgency
   * @returns Selected strategy
   */
  static selectBackfillStrategy(
    opportunity: BackfillOpportunity,
    urgency: 'immediate' | 'normal' | 'background' = 'normal'
  ): BackfillStrategy {
    // High confidence + immediate urgency = immediate backfill
    if (opportunity.confidence === 'high' && urgency === 'immediate') {
      return 'immediate';
    }

    // Low confidence = defer for user review
    if (opportunity.confidence === 'low') {
      return 'deferred';
    }

    // Default to batched for efficiency
    return 'batched';
  }

  /**
   * Execute backfill using selected strategy
   * @param opportunity Backfill opportunity
   * @param strategy Backfill strategy
   * @returns Execution result
   */
  static async executeBackfill(
    opportunity: BackfillOpportunity,
    strategy: BackfillStrategy
  ): Promise<BackfillResult> {
    const startTime = Date.now();

    try {
      switch (strategy) {
        case 'immediate':
          return await this.executeImmediateBackfill(opportunity, startTime);
        
        case 'batched':
          return await this.executeBatchedBackfill(opportunity, startTime);
        
        case 'deferred':
          return this.executeDeferredBackfill(opportunity, startTime);
        
        default:
          throw new Error(`Unknown backfill strategy: ${strategy}`);
      }

    } catch (error) {
      return {
        filePath: opportunity.filePath,
        success: false,
        strategy,
        tokensUpdated: 0,
        message: `Backfill failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Execute immediate backfill for urgent cases
   * @param opportunity Backfill opportunity
   * @param startTime Start timestamp
   * @returns Execution result
   */
  private static async executeImmediateBackfill(
    opportunity: BackfillOpportunity,
    startTime: number
  ): Promise<BackfillResult> {
    const content = readFileSync(opportunity.filePath, 'utf-8');
    
    // Create enhanced metadata with token source tracking
    let updatedMetadata: FileMetadata;
    
    if (opportunity.existingMetadata) {
      // Update existing metadata
      updatedMetadata = {
        ...opportunity.existingMetadata,
        accessToken: opportunity.suggestedToken,
        tokenSource: 'backfilled',
        tokenUpdatedAt: new Date().toISOString()
      };
    } else {
      // This shouldn't happen for backfill, but handle gracefully
      throw new Error('Cannot backfill token without existing metadata');
    }

    // Update file with enhanced metadata
    const updatedContent = MetadataManager.injectMetadata(content, updatedMetadata);
    writeFileSync(opportunity.filePath, updatedContent, 'utf-8');

    console.log(`🔄 Immediate backfill: ${opportunity.fileName} (${opportunity.confidence} confidence)`);

    return {
      filePath: opportunity.filePath,
      success: true,
      strategy: 'immediate',
      tokensUpdated: 1,
      message: `Token backfilled immediately (${opportunity.reason})`,
      executionTime: Date.now() - startTime
    };
  }

  /**
   * Execute batched backfill for efficiency
   * @param opportunity Backfill opportunity
   * @param startTime Start timestamp  
   * @returns Execution result
   */
  private static async executeBatchedBackfill(
    opportunity: BackfillOpportunity,
    startTime: number
  ): Promise<BackfillResult> {
    // Add to pending batch
    this.pendingBackfills.set(opportunity.filePath, opportunity);

    // Setup batch execution timer if not already set
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.executeBatchBackfill();
      }, this.BATCH_DELAY_MS);
    }

    // Check if batch is full and should execute immediately
    if (this.pendingBackfills.size >= this.MAX_BATCH_SIZE) {
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      await this.executeBatchBackfill();
    }

    return {
      filePath: opportunity.filePath,
      success: true,
      strategy: 'batched',
      tokensUpdated: 0, // Will be updated when batch executes
      message: 'Added to batch queue',
      executionTime: Date.now() - startTime
    };
  }

  /**
   * Execute deferred backfill (log for user review)
   * @param opportunity Backfill opportunity
   * @param startTime Start timestamp
   * @returns Execution result
   */
  private static executeDeferredBackfill(
    opportunity: BackfillOpportunity,
    startTime: number
  ): BackfillResult {
    console.log(`📋 Deferred backfill opportunity: ${opportunity.fileName} - ${opportunity.reason}`);
    console.log(`💡 Consider adding: accessToken: "${opportunity.suggestedToken}"`);

    return {
      filePath: opportunity.filePath,
      success: true,
      strategy: 'deferred',
      tokensUpdated: 0,
      message: `Deferred for manual review (${opportunity.reason})`,
      executionTime: Date.now() - startTime
    };
  }

  /**
   * Execute batch backfill operation (parallel processing)
   * @returns Execution results for all files in batch
   */
  private static async executeBatchBackfill(): Promise<BackfillResult[]> {
    const batch = Array.from(this.pendingBackfills.values());
    this.pendingBackfills.clear();
    this.batchTimeout = null;

    if (batch.length === 0) {
      return [];
    }

    console.log(`🔄 Executing batch backfill for ${batch.length} files...`);

    // Creative Enhancement: Parallel execution для performance
    const results = await Promise.allSettled(
      batch.map(async (opportunity) => {
        const startTime = Date.now();
        
        try {
          const content = readFileSync(opportunity.filePath, 'utf-8');
          
          if (!opportunity.existingMetadata) {
            throw new Error('No existing metadata for backfill');
          }

          // Create enhanced metadata с diagnostic information
          const updatedMetadata: FileMetadata = {
            ...opportunity.existingMetadata,
            accessToken: opportunity.suggestedToken,
            tokenSource: 'backfilled',
            tokenUpdatedAt: new Date().toISOString()
          };

          const updatedContent = MetadataManager.injectMetadata(content, updatedMetadata);
          writeFileSync(opportunity.filePath, updatedContent, 'utf-8');

          return {
            filePath: opportunity.filePath,
            success: true,
            strategy: 'batched' as BackfillStrategy,
            tokensUpdated: 1,
            message: `Batch backfill successful (${opportunity.reason})`,
            executionTime: Date.now() - startTime
          };

        } catch (error) {
          return {
            filePath: opportunity.filePath,
            success: false,
            strategy: 'batched' as BackfillStrategy,
            tokensUpdated: 0,
            message: `Batch backfill failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            executionTime: Date.now() - startTime
          };
        }
      })
    );

    // Process results
    const backfillResults: BackfillResult[] = [];
    let successCount = 0;

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        backfillResults.push(result.value);
        if (result.value.success) {
          successCount++;
        }
      } else {
        console.error('Batch backfill error:', result.reason);
      }
    });

    console.log(`✅ Batch backfill completed: ${successCount}/${batch.length} successful`);

    return backfillResults;
  }

  /**
   * Process successful operation для token backfill (main API)
   * @param filePath File that was successfully processed
   * @param accessToken Token that was used
   * @param operationType Type of operation
   * @param urgency Operation urgency
   * @returns Backfill result or null if no backfill needed
   */
  static async processSuccessfulOperation(
    filePath: string,
    accessToken: string,
    operationType: 'publish' | 'edit',
    urgency: 'immediate' | 'normal' | 'background' = 'normal'
  ): Promise<BackfillResult | null> {
    // Detect backfill opportunity
    const opportunity = this.detectBackfillOpportunity(filePath, accessToken, operationType);
    
    if (!opportunity) {
      return null; // No backfill needed
    }

    // Select strategy
    const strategy = this.selectBackfillStrategy(opportunity, urgency);

    // Execute backfill
    const result = await this.executeBackfill(opportunity, strategy);

    return result;
  }

  /**
   * Flush pending batch immediately (for cleanup)
   * @returns Results of any pending backfills
   */
  static async flushPendingBackfills(): Promise<BackfillResult[]> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    return await this.executeBatchBackfill();
  }

  /**
   * Get pending backfill statistics
   * @returns Statistics about pending backfills
   */
  static getPendingStats(): {
    count: number;
    files: string[];
    strategies: Record<string, number>;
  } {
    const files = Array.from(this.pendingBackfills.keys());
    const opportunities = Array.from(this.pendingBackfills.values());
    
    const strategies: Record<string, number> = {};
    opportunities.forEach(opp => {
      const strategy = this.selectBackfillStrategy(opp);
      strategies[strategy] = (strategies[strategy] || 0) + 1;
    });

    return {
      count: files.length,
      files,
      strategies
    };
  }

  /**
   * Clear all pending backfills (for cleanup)
   */
  static clearPendingBackfills(): void {
    this.pendingBackfills.clear();
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    console.log('🧹 Pending backfills cleared');
  }
} 