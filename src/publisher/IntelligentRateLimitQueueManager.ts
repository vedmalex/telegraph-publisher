/**
 * Creative Enhancement: Intelligent Rate Limit Queue Manager
 * Implements Predictive Queue Intelligence с ML-inspired decision making
 * Self-Healing Queue Pattern с Circuit Breaker и adaptive thresholds
 */

import { basename } from "node:path";
import type { PublicationResult } from "../types/metadata";
import { ProgressIndicator } from "../cli/ProgressIndicator";

export interface PostponedFileInfo {
  originalWaitTime: number;
  retryAfter: number; // timestamp
  postponedAt: number; // timestamp
  attempts: number;
  reason: 'FLOOD_WAIT' | 'API_ERROR';
  // Creative Enhancement: Enhanced tracking
  confidence?: 'high' | 'medium' | 'low';
  priority?: number;
  complexity?: 'simple' | 'medium' | 'complex';
  lastErrorCode?: string;
  accessToken?: string;
}

export interface QueueDecision {
  action: 'wait' | 'postpone';
  waitSeconds?: number;
  nextFile?: string | null;
  // Creative Enhancement: Decision metadata
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
  strategy?: 'immediate' | 'adaptive' | 'predictive';
}

export interface QueueStats {
  total: number;
  processed: number;
  postponed: number;
  remaining: number;
  // Creative Enhancement: Enhanced analytics
  successRate?: number;
  averageWaitTime?: number;
  totalDelayReduction?: number;
}

/**
 * Creative Enhancement: Queue Decision History для ML-inspired learning
 */
interface DecisionHistory {
  decision: QueueDecision;
  filePath: string;
  timestamp: number;
  actualWaitTime: number;
  outcome: 'success' | 'retry' | 'failure';
  delayReduction: number;
}

/**
 * Creative Enhancement: Circuit Breaker State for Self-Healing Queue
 */
enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failures detected, preventing operations
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Intelligent Rate Limit Queue Manager
 * Creative Enhancement: Predictive Intelligence + Self-Healing Architecture
 */
export class IntelligentRateLimitQueueManager {
  private static readonly POSTPONE_THRESHOLD = 30; // seconds - threshold для postponement decision
  private static readonly MAX_RETRY_ATTEMPTS = 3; // maximum retry attempts for postponed files
  private static readonly QUEUE_LOG_INTERVAL = 5; // log progress every N files
  private static readonly MAX_RETRY_DELAY = 30; // seconds - cap for retry-after to avoid long stalls

  // Creative Enhancement: Predictive Intelligence properties
  private static readonly DECISION_HISTORY_LIMIT = 100;
  private static readonly ADAPTIVE_THRESHOLD_MIN = 10; // seconds
  private static readonly ADAPTIVE_THRESHOLD_MAX = 120; // seconds
  private static readonly SUCCESS_RATE_THRESHOLD = 0.7; // 70% success rate

  // Creative Enhancement: Circuit Breaker properties
  private static readonly CIRCUIT_FAILURE_THRESHOLD = 5;
  private static readonly CIRCUIT_TIMEOUT = 60000; // 1 minute
  private static readonly CIRCUIT_HALF_OPEN_MAX_REQUESTS = 3;

  private postponedFiles: Map<string, PostponedFileInfo> = new Map();
  private processedCount = 0;
  private totalFiles = 0;

  // Creative Enhancement: Predictive Intelligence state
  private decisionHistory: DecisionHistory[] = [];
  private adaptiveThreshold = IntelligentRateLimitQueueManager.POSTPONE_THRESHOLD;
  private successRate = 1.0;
  private totalDelayReduction = 0;

  // Creative Enhancement: Circuit Breaker state
  private circuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenRequestCount = 0;

  // Progress Indicators
  private queueProgress?: ProgressIndicator;
  private retryProgress?: ProgressIndicator;

  /**
   * Initialize queue manager with total files count
   * @param totalFiles Total number of files to process
   */
  initialize(totalFiles: number): void {
    this.totalFiles = totalFiles;
    this.processedCount = 0;
    this.postponedFiles.clear();
    
    // Initialize progress indicator
    this.queueProgress = new ProgressIndicator(totalFiles, "📦 Queue Processing");
    
    console.log(`🎯 Queue manager initialized: ${totalFiles} files to process`);
  }

  /**
   * Handle rate limit by making intelligent decision: postpone vs wait
   * @param filePath File that encountered rate limit
   * @param waitSeconds Wait time from FLOOD_WAIT error
   * @param processingQueue Current processing queue (mutable)
   * @returns Decision on how to handle the rate limit
   */
  async handleRateLimit(filePath: string, waitSeconds: number, processingQueue: string[], accessToken: string = ''): Promise<QueueDecision> {
    const fileName = basename(filePath);
    
    // 🎯 Smart decision logic
    const shouldPostpone = this.shouldPostponeFile(waitSeconds, processingQueue, filePath);
    
    if (shouldPostpone) {
      return this.postponeFile(filePath, waitSeconds, processingQueue, accessToken);
    } else {
      // Short wait or single file - handle normally
      this.queueProgress?.increment(`⏱️ ${fileName} (waiting ${waitSeconds}s)`);
      return { action: 'wait', waitSeconds };
    }
  }

  /**
   * Determine if file should be postponed based on intelligent criteria
   */
  private shouldPostponeFile(waitSeconds: number, queue: string[], filePath: string): boolean {
    const currentPosition = queue.indexOf(filePath);
    const filesRemaining = queue.length - currentPosition - 1;
    
    // 🔍 Decision criteria
    const exceedsThreshold = waitSeconds > IntelligentRateLimitQueueManager.POSTPONE_THRESHOLD;
    const hasOtherFiles = filesRemaining > 0;
    const notTooManyAttempts = (this.postponedFiles.get(filePath)?.attempts || 0) < IntelligentRateLimitQueueManager.MAX_RETRY_ATTEMPTS;
    
    const shouldPostpone = exceedsThreshold && hasOtherFiles && notTooManyAttempts;
    
    return shouldPostpone;
  }

  /**
   * Postpone file и reorder queue
   */
  private postponeFile(filePath: string, waitSeconds: number, queue: string[], accessToken: string = ''): QueueDecision {
    const fileName = basename(filePath);
    const currentIndex = queue.indexOf(filePath);
    
    // 📋 Remove from current position
    queue.splice(currentIndex, 1);
    
    // ⏰ Schedule for retry (cap excessively long waits)
    const cappedWait = Math.min(waitSeconds, IntelligentRateLimitQueueManager.MAX_RETRY_DELAY);
    const retryAfter = Date.now() + (cappedWait * 1000);
    const existingInfo = this.postponedFiles.get(filePath);
    const attempts = (existingInfo?.attempts || 0) + 1;
    
    this.postponedFiles.set(filePath, {
      originalWaitTime: waitSeconds,
      retryAfter,
      postponedAt: Date.now(),
      attempts,
      reason: 'FLOOD_WAIT',
      accessToken: accessToken || existingInfo?.accessToken
    });
    
    // 🔼 Add to FRONT of queue to retry as soon as possible (non-blocking approach)
    queue.unshift(filePath);
    
    // Compact logging through progress bar
    this.queueProgress?.increment(`⏭️ ${fileName} (postponed ${waitSeconds}s→${cappedWait}s, attempt ${attempts})`);
    
    const nextFile = queue[currentIndex + 1] || null;
    return { 
      action: 'postpone', 
      nextFile 
    };
  }

  /**
   * Check if file should be retried now
   */
  shouldRetryNow(filePath: string): boolean {
    const info = this.postponedFiles.get(filePath);
    if (!info) return true;
    
    const shouldRetry = Date.now() >= info.retryAfter;
    
    if (shouldRetry) {
      const timeWaited = Date.now() - info.postponedAt;
      QueueProgressLogger.logRetryAttempt(filePath, info.attempts, timeWaited);
    }
    
    return shouldRetry;
  }

  /**
   * Check if file is in postponed state
   */
  isPostponed(filePath: string): boolean {
    return this.postponedFiles.has(filePath);
  }

  /**
   * Mark file as successfully processed
   */
  markSuccessful(filePath: string): void {
    this.processedCount++;
    const fileName = basename(filePath);
    
    if (this.postponedFiles.has(filePath)) {
      this.postponedFiles.delete(filePath);
      this.queueProgress?.increment(`✅ ${fileName} (retry success)`);
    } else {
      this.queueProgress?.increment(`✅ ${fileName}`);
    }
  }

  /**
   * Mark file as failed
   */
  markFailed(filePath: string, error: string): void {
    this.processedCount++;
    const fileName = basename(filePath);
    
    if (this.postponedFiles.has(filePath)) {
      const info = this.postponedFiles.get(filePath)!;
      if (info.attempts >= IntelligentRateLimitQueueManager.MAX_RETRY_ATTEMPTS) {
        this.postponedFiles.delete(filePath);
        this.queueProgress?.increment(`❌ ${fileName} (max retries)`);
      } else {
        this.queueProgress?.increment(`⚠️ ${fileName} (retry later)`);
      }
    } else {
      this.queueProgress?.increment(`❌ ${fileName}`);
    }
  }

  /**
   * Complete queue processing
   */
  completeQueue(message?: string): void {
    if (this.queueProgress) {
      this.queueProgress.complete(message || `Queue complete: ${this.processedCount}/${this.totalFiles} files processed`);
    }
  }

  /**
   * Process final retries for any remaining postponed files
   * @param publishFunction Function to call for publishing each file
   */
  async processFinalRetries(
    publishFunction: (filePath: string) => Promise<PublicationResult>,
    getAccessToken?: (filePath: string) => string | undefined
  ): Promise<PublicationResult[]> {
    const results: PublicationResult[] = [];

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    // Nothing to do
    if (this.postponedFiles.size === 0) {
      return results;
    }

    // Reuse main queue progress bar for postponed processing (no separate final phase UI)
    this.retryProgress = undefined;

    // Loop until all postponed files are processed (silent mode)
    while (this.postponedFiles.size > 0) {
      let progressThisRound = 0;

      for (const [filePath, info] of Array.from(this.postponedFiles.entries())) {
        const fileName = basename(filePath);

        // Skip if not yet time to retry
        if (Date.now() < info.retryAfter) {
          continue;
        }

        // During final retries: for FLOOD_WAIT we do not enforce max attempts cap
        if (info.reason !== 'FLOOD_WAIT' && info.attempts >= IntelligentRateLimitQueueManager.MAX_RETRY_ATTEMPTS) {
          // Silent mode: no progress bar updates
          this.postponedFiles.delete(filePath);
          this.processedCount++;
          progressThisRound++;
          continue;
        }

        try {
          const result = await publishFunction(filePath);
          results.push(result);

          if (result.success) {
            // Success: remove from postponed
            this.postponedFiles.delete(filePath);
            this.processedCount++;
            progressThisRound++;
          } else if (result.error && /FLOOD_WAIT_(\d+)/.test(result.error)) {
            // Treat as FLOOD_WAIT: reschedule exactly as told (no cap)
            const match = result.error.match(/FLOOD_WAIT_(\d+)/);
            const waitSeconds = match ? parseInt(match[1], 10) : 5;
            const token = getAccessToken ? (getAccessToken(filePath) ?? '') : (info.accessToken ?? '');
            this.postponedFiles.set(filePath, {
              ...info,
              originalWaitTime: waitSeconds,
              retryAfter: Date.now() + waitSeconds * 1000,
              postponedAt: Date.now(),
              attempts: info.attempts + 1,
              reason: 'FLOOD_WAIT',
              accessToken: token
            });
          } else {
            // Non-FLOOD failures: mark processed and remove
            this.postponedFiles.delete(filePath);
            this.processedCount++;
            progressThisRound++;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // FLOOD_WAIT handling: reschedule instead of failing (no cap on final phase)
          const match = message.match(/FLOOD_WAIT_(\d+)/);
          if (match) {
            const waitSeconds = parseInt(match[1], 10);
            const token = getAccessToken ? (getAccessToken(filePath) ?? '') : (info.accessToken ?? '');
            this.postponedFiles.set(filePath, {
              ...info,
              originalWaitTime: waitSeconds,
              retryAfter: Date.now() + waitSeconds * 1000,
              postponedAt: Date.now(),
              attempts: info.attempts + 1,
              reason: 'FLOOD_WAIT',
              accessToken: token
            });
            // Do not count as processed; will retry in a future round
          } else {
            // Other errors: mark and remove
            results.push({ success: false, error: message, isNewPublication: false });
            this.postponedFiles.delete(filePath);
            this.processedCount++;
            progressThisRound++;
          }
        }
      }

      // If progress made, continue another round immediately
      if (progressThisRound > 0) {
        continue;
      }

      // No progress: compute next wait using token grouping
      if (this.postponedFiles.size === 0) break;

      const tokenToEarliest: Map<string, number> = new Map();
      for (const [fp, info] of this.postponedFiles.entries()) {
        const token = info.accessToken || '';
        if (!tokenToEarliest.has(token)) {
          tokenToEarliest.set(token, info.retryAfter);
        } else {
          tokenToEarliest.set(token, Math.min(tokenToEarliest.get(token)!, info.retryAfter));
        }
      }

      // Determine waiting strategy
      const distinctTokens = [...tokenToEarliest.keys()];
      const now = Date.now();

      if (distinctTokens.length <= 1) {
        // Single token: wait exactly until earliest retry
        const nextTs = tokenToEarliest.get(distinctTokens[0] || '') || now;
        const waitMs = Math.max(0, nextTs - now);
        await new Promise(res => setTimeout(res, waitMs));
      } else {
        // Multiple tokens: wait until nearest retry
        const earliestRetry = Math.min(...distinctTokens.map(t => tokenToEarliest.get(t) || now));
        const waitMs = Math.max(0, earliestRetry - now);
        await new Promise(res => setTimeout(res, waitMs));
      }
    }

    // No explicit final progress output in silent mode

    return results;
  }

  /**
   * Get summary of postponed files
   */
  getPostponedSummary(): string[] {
    return Array.from(this.postponedFiles.entries()).map(([filePath, info]) => {
      const fileName = basename(filePath);
      const timeLeft = Math.max(0, info.retryAfter - Date.now());
      const minutesLeft = Math.ceil(timeLeft / 60000);
      
      return `${fileName} (${info.attempts} attempts, ${minutesLeft}min remaining)`;
    });
  }

  /**
   * Get basic queue statistics
   */
  getStats(): QueueStats {
    const postponed = this.postponedFiles.size;
    const remaining = this.totalFiles - this.processedCount;
    
    return {
      total: this.totalFiles,
      processed: this.processedCount,
      postponed,
      remaining
    };
  }

  // ============================================================================
  // Creative Enhancement: Predictive Queue Intelligence
  // ============================================================================

  /**
   * Make intelligent queue decision using ML-inspired algorithms
   * @param filePath File being processed
   * @param waitSeconds Wait time from rate limit
   * @param processingQueue Current queue
   * @returns Enhanced decision with confidence and reasoning
   */
  makeQueueDecision(filePath: string, waitSeconds: number, processingQueue: string[]): QueueDecision {
    // Circuit breaker check
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      return {
        action: 'postpone',
        confidence: 'high',
        reasoning: 'Circuit breaker open - preventing cascading failures',
        strategy: 'adaptive'
      };
    }

    // Predictive decision based on historical data
    const predictedDecision = this.predictOptimalDecision(waitSeconds, processingQueue.length);
    
    // Adaptive threshold consideration
    const useAdaptiveThreshold = waitSeconds > this.adaptiveThreshold;
    
    if (useAdaptiveThreshold || predictedDecision.action === 'postpone') {
      return {
        action: 'postpone',
        confidence: predictedDecision.confidence,
        reasoning: `Adaptive threshold: ${this.adaptiveThreshold}s, Wait: ${waitSeconds}s`,
        strategy: 'predictive'
      };
    }

    return {
      action: 'wait',
      waitSeconds,
      confidence: 'medium',
      reasoning: `Below adaptive threshold, queue size: ${processingQueue.length}`,
      strategy: 'immediate'
    };
  }

  /**
   * Predict optimal decision using historical data (ML-inspired)
   * @param waitSeconds Current wait time
   * @param queueSize Current queue size
   * @returns Predicted decision with confidence
   */
  private predictOptimalDecision(waitSeconds: number, queueSize: number): QueueDecision {
    if (this.decisionHistory.length === 0) {
      // No history - use default logic
      return {
        action: waitSeconds > IntelligentRateLimitQueueManager.POSTPONE_THRESHOLD ? 'postpone' : 'wait',
        confidence: 'low',
        reasoning: 'No historical data available'
      };
    }

    // Analyze similar situations from history
    const similarSituations = this.decisionHistory.filter(h => 
      Math.abs(h.actualWaitTime - waitSeconds) <= 10 &&
      h.outcome === 'success'
    );

    if (similarSituations.length >= 3) {
      // High confidence based on historical success
      const avgDelayReduction = similarSituations.reduce((sum, s) => sum + s.delayReduction, 0) / similarSituations.length;
      
      return {
        action: avgDelayReduction > 0 ? 'postpone' : 'wait',
        confidence: 'high',
        reasoning: `Based on ${similarSituations.length} similar cases, avg delay reduction: ${avgDelayReduction.toFixed(1)}s`
      };
    }

    // Medium confidence based on success rate
    const recentSuccesses = this.decisionHistory.slice(-20).filter(h => h.outcome === 'success');
    const successRate = recentSuccesses.length / Math.min(20, this.decisionHistory.length);

    return {
      action: successRate > IntelligentRateLimitQueueManager.SUCCESS_RATE_THRESHOLD ? 'postpone' : 'wait',
      confidence: 'medium',
      reasoning: `Success rate: ${(successRate * 100).toFixed(1)}%`
    };
  }

  /**
   * Update adaptive threshold based on success patterns
   */
  private updateAdaptiveThreshold(): void {
    if (this.decisionHistory.length < 10) return;

    const oldThreshold = this.adaptiveThreshold;
    const recentDecisions = this.decisionHistory.slice(-20);
    const successfulPostpones = recentDecisions.filter(h => 
      h.decision.action === 'postpone' && h.outcome === 'success' && h.delayReduction > 0
    );

    if (successfulPostpones.length >= 5) {
      // Lower threshold if postponing is working well
      this.adaptiveThreshold = Math.max(
        IntelligentRateLimitQueueManager.ADAPTIVE_THRESHOLD_MIN,
        this.adaptiveThreshold - 5
      );
    } else if (this.successRate < IntelligentRateLimitQueueManager.SUCCESS_RATE_THRESHOLD) {
      // Raise threshold if not working well
      this.adaptiveThreshold = Math.min(
        IntelligentRateLimitQueueManager.ADAPTIVE_THRESHOLD_MAX,
        this.adaptiveThreshold + 10
      );
    }

    // Reduced logging - threshold updates logged only when significant
    if (Math.abs(oldThreshold - this.adaptiveThreshold) >= 5) {
      console.log(`🎯 Adaptive threshold: ${this.adaptiveThreshold}s (success: ${(this.successRate * 100).toFixed(1)}%)`);
    }
  }

  /**
   * Record decision outcome for learning
   * @param decision Original decision
   * @param filePath File path
   * @param actualWaitTime Actual time waited
   * @param outcome Result of the decision
   * @param delayReduction Time saved by the decision
   */
  recordDecisionOutcome(
    decision: QueueDecision,
    filePath: string,
    actualWaitTime: number,
    outcome: 'success' | 'retry' | 'failure',
    delayReduction: number = 0
  ): void {
    const historyEntry: DecisionHistory = {
      decision,
      filePath,
      timestamp: Date.now(),
      actualWaitTime,
      outcome,
      delayReduction
    };

    this.decisionHistory.push(historyEntry);

    // Maintain history size limit
    if (this.decisionHistory.length > IntelligentRateLimitQueueManager.DECISION_HISTORY_LIMIT) {
      this.decisionHistory.shift();
    }

    // Update success rate
    const recentOutcomes = this.decisionHistory.slice(-20);
    this.successRate = recentOutcomes.filter(h => h.outcome === 'success').length / recentOutcomes.length;

    // Update total delay reduction
    this.totalDelayReduction += delayReduction;

    // Update adaptive threshold
    this.updateAdaptiveThreshold();

    // Circuit breaker logic
    this.updateCircuitBreakerState(outcome);

    // Reduced logging - only log significant decisions
    if (delayReduction > 10 || outcome === 'failure') {
      console.log(`📊 Decision: ${outcome} (delay: ${delayReduction.toFixed(1)}s, success: ${(this.successRate * 100).toFixed(1)}%)`);
    }
  }

  // ============================================================================
  // Creative Enhancement: Self-Healing Queue Pattern (Circuit Breaker)
  // ============================================================================

  /**
   * Update circuit breaker state based on outcomes
   * @param outcome Latest operation outcome
   */
  private updateCircuitBreakerState(outcome: 'success' | 'retry' | 'failure'): void {
    const now = Date.now();

    if (outcome === 'failure') {
      this.failureCount++;
      this.lastFailureTime = now;

      if (this.failureCount >= IntelligentRateLimitQueueManager.CIRCUIT_FAILURE_THRESHOLD) {
        if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
          this.circuitBreakerState = CircuitBreakerState.OPEN;
          console.log(`⚠️ Circuit breaker OPEN: ${this.failureCount} failures`);
        }
      }
    } else if (outcome === 'success') {
      if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
        this.halfOpenRequestCount++;
        
        if (this.halfOpenRequestCount >= IntelligentRateLimitQueueManager.CIRCUIT_HALF_OPEN_MAX_REQUESTS) {
          this.circuitBreakerState = CircuitBreakerState.CLOSED;
          this.failureCount = 0;
          this.halfOpenRequestCount = 0;
          console.log(`✅ Circuit breaker CLOSED: Service recovered`);
        }
      } else if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
        // Reset failure count on success
        this.failureCount = Math.max(0, this.failureCount - 1);
      }
    }

    // Check if circuit should move to half-open
    if (this.circuitBreakerState === CircuitBreakerState.OPEN &&
        now - this.lastFailureTime > IntelligentRateLimitQueueManager.CIRCUIT_TIMEOUT) {
      this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
      this.halfOpenRequestCount = 0;
                console.log(`🔄 Circuit breaker HALF_OPEN: Testing recovery`);
    }
  }

  /**
   * Check if circuit breaker allows operation
   * @returns true if operation is allowed
   */
  isOperationAllowed(): boolean {
    return this.circuitBreakerState !== CircuitBreakerState.OPEN;
  }

  /**
   * Get circuit breaker status for monitoring
   * @returns Current circuit breaker state and metrics
   */
  getCircuitBreakerStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
    halfOpenRequestCount: number;
  } {
    return {
      state: this.circuitBreakerState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenRequestCount: this.halfOpenRequestCount
    };
  }

  // ============================================================================
  // Creative Enhancement: Enhanced Analytics and Optimization
  // ============================================================================

  /**
   * Optimize queue order based on complexity and success patterns
   * @param queue Current file queue
   * @returns Optimized queue order
   */
  optimizeQueueOrder(queue: string[]): string[] {
    if (queue.length <= 1) return queue;

    // Sort by predicted success probability (complex files last)
    return queue.sort((a, b) => {
      const aComplexity = this.estimateFileComplexity(a);
      const bComplexity = this.estimateFileComplexity(b);
      
      // Simple files first (higher success probability)
      const complexityOrder = { 'simple': 0, 'medium': 1, 'complex': 2 };
      return complexityOrder[aComplexity] - complexityOrder[bComplexity];
    });
  }

  /**
   * Estimate file complexity based on name patterns
   * @param filePath File path
   * @returns Estimated complexity
   */
  private estimateFileComplexity(filePath: string): 'simple' | 'medium' | 'complex' {
    const fileName = basename(filePath);
    
    // Simple heuristics - can be enhanced with actual file analysis
    if (fileName.includes('index') || fileName.includes('readme')) {
      return 'simple';
    }
    
    if (fileName.includes('config') || fileName.includes('setup')) {
      return 'medium';
    }
    
    return 'complex';
  }

  /**
   * Get enhanced queue statistics with predictive insights
   * @returns Comprehensive queue analytics
   */
  getEnhancedStats(): QueueStats & {
    adaptiveThreshold: number;
    circuitBreakerState: CircuitBreakerState;
    predictiveAccuracy: number;
    totalOptimizationGains: number;
  } {
    const baseStats = this.getStats();
    
    // Calculate predictive accuracy
    const recentDecisions = this.decisionHistory.slice(-20);
    const correctPredictions = recentDecisions.filter(h => 
      (h.decision.action === 'postpone' && h.delayReduction > 0) ||
      (h.decision.action === 'wait' && h.delayReduction >= 0)
    );
    
    const predictiveAccuracy = recentDecisions.length > 0 ? 
      correctPredictions.length / recentDecisions.length : 0;

    return {
      ...baseStats,
      successRate: this.successRate,
      averageWaitTime: this.calculateAverageWaitTime(),
      totalDelayReduction: this.totalDelayReduction,
      adaptiveThreshold: this.adaptiveThreshold,
      circuitBreakerState: this.circuitBreakerState,
      predictiveAccuracy,
      totalOptimizationGains: this.totalDelayReduction
    };
  }

  /**
   * Calculate average wait time from decision history
   * @returns Average wait time in seconds
   */
  private calculateAverageWaitTime(): number {
    if (this.decisionHistory.length === 0) return 0;
    
    const totalWaitTime = this.decisionHistory.reduce((sum, h) => sum + h.actualWaitTime, 0);
    return totalWaitTime / this.decisionHistory.length;
  }

  /**
   * Generate comprehensive queue intelligence report
   * @returns Detailed analytics report
   */
  generateIntelligenceReport(): string {
    const stats = this.getEnhancedStats();
    const circuitStatus = this.getCircuitBreakerStatus();
    
    const lines = [
      '🎯 Intelligent Queue Analytics Report',
      '=====================================',
      `📊 Queue Status: ${stats.processed}/${stats.total} processed (${((stats.processed/stats.total)*100).toFixed(1)}%)`,
      `⚡ Success Rate: ${(stats.successRate! * 100).toFixed(1)}%`,
      `🎯 Predictive Accuracy: ${(stats.predictiveAccuracy * 100).toFixed(1)}%`,
      `⏱️ Average Wait Time: ${stats.averageWaitTime!.toFixed(1)}s`,
      `📈 Total Delay Reduction: ${stats.totalDelayReduction!.toFixed(1)}s`,
      `🔧 Adaptive Threshold: ${stats.adaptiveThreshold}s`,
      `🛡️ Circuit Breaker: ${circuitStatus.state.toUpperCase()}`,
      ''
    ];

    if (this.decisionHistory.length > 0) {
      const recentDecisions = this.decisionHistory.slice(-5);
      lines.push('📋 Recent Decision History:');
      recentDecisions.forEach((h, i) => {
        lines.push(`   ${i+1}. ${h.decision.action.toUpperCase()} (${h.outcome}) - ${h.delayReduction.toFixed(1)}s reduction`);
      });
    }

    return lines.join('\n');
  }
}

/**
 * Enhanced logging для queue management visibility
 */
export class QueueProgressLogger {
  /**
   * Log queue reordering event
   */
  static logQueueReorder(filePath: string, waitSeconds: number, queuePosition: number, totalFiles: number): void {
    const fileName = basename(filePath);
    const waitMinutes = Math.ceil(waitSeconds / 60);
    const filesAhead = queuePosition - 1;
    
    console.log(`🔄 Rate limit detected: ${fileName} (${waitSeconds}s wait)`);
    console.log(`📋 Queue reordered: moved to position ${queuePosition}/${totalFiles}`);
    console.log(`⚡ Continuing immediately with next file instead of waiting ${waitMinutes} minutes`);
    
    if (filesAhead > 0) {
      console.log(`🎯 Queue efficiency: processing ${filesAhead} files while waiting`);
    }
  }

  /**
   * Log queue progress
   */
  static logQueueProgress(processed: number, total: number, postponed: number): void {
    const percentage = Math.round((processed / total) * 100);
    const remaining = total - processed;
    
    console.log(`📊 Queue progress: ${processed}/${total} (${percentage}%) processed`);
    
    if (postponed > 0) {
      console.log(`   🔄 ${postponed} files postponed, ${remaining} remaining`);
    }
  }

  /**
   * Log retry attempt
   */
    static logRetryAttempt(filePath: string, attempt: number, timeWaited: number): void {
    const fileName = basename(filePath);
    const minutesWaited = Math.round(timeWaited / 60000); // ms to minutes
    
    console.log(`🔄 Retry attempt ${attempt} for ${fileName} (waited ${minutesWaited} minutes)`);
  }
} 