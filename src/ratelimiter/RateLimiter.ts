import type { BackoffStrategy, RateLimitConfig } from "../types/metadata";
import { CountdownTimer } from "./CountdownTimer";

/**
 * Rate limiting metrics and statistics
 */
interface RateLimitMetrics {
  /** Total number of API calls made */
  totalCalls: number;
  /** Number of FLOOD_WAIT errors encountered */
  floodWaitCount: number;
  /** Average wait time for FLOOD_WAIT errors */
  averageFloodWaitSeconds: number;
  /** Total delay time applied */
  totalDelayMs: number;
  /** Current adaptive delay multiplier */
  currentMultiplier: number;
  /** Timestamp of last FLOOD_WAIT error */
  lastFloodWaitTime?: number;
}

/**
 * Rate limiter for Telegraph API calls with adaptive throttling
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private metrics: RateLimitMetrics;
  private currentDelayMs: number;
  private consecutiveFloodWaits: number;
  private lastCallTime: number;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.metrics = {
      totalCalls: 0,
      floodWaitCount: 0,
      averageFloodWaitSeconds: 0,
      totalDelayMs: 0,
      currentMultiplier: 1.0
    };
    this.currentDelayMs = config.baseDelayMs;
    this.consecutiveFloodWaits = 0;
    this.lastCallTime = 0;
  }

  /**
   * Apply rate limiting delay before making an API call
   */
  async beforeCall(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.currentDelayMs) {
      const delayNeeded = this.currentDelayMs - timeSinceLastCall;
      await this.sleep(delayNeeded);
      this.metrics.totalDelayMs += delayNeeded;
    }

    this.lastCallTime = Date.now();
    this.metrics.totalCalls++;
  }

  /**
   * Handle FLOOD_WAIT error and adjust future delays
   * @param floodWaitSeconds Number of seconds from FLOOD_WAIT error
   * @param showCountdown Whether to show visual countdown (default: true)
   */
  async handleFloodWait(floodWaitSeconds: number, showCountdown: boolean = true): Promise<void> {
    this.metrics.floodWaitCount++;
    this.consecutiveFloodWaits++;
    this.metrics.lastFloodWaitTime = Date.now();

    // Update average FLOOD_WAIT time
    const totalWaitTime = this.metrics.averageFloodWaitSeconds * (this.metrics.floodWaitCount - 1) + floodWaitSeconds;
    this.metrics.averageFloodWaitSeconds = totalWaitTime / this.metrics.floodWaitCount;

    // Apply adaptive throttling
    if (this.config.enableAdaptiveThrottling) {
      this.adjustDelayAfterFloodWait();
    }

    // Wait for the required time with optional countdown
    const waitMs = floodWaitSeconds * 1000;

    if (showCountdown && floodWaitSeconds > 0) {
      await this.sleepWithCountdown(waitMs, floodWaitSeconds);
    } else {
      await this.sleep(waitMs);
    }

    this.metrics.totalDelayMs += waitMs;
  }

  /**
   * Mark successful API call (no FLOOD_WAIT)
   */
  markSuccessfulCall(): void {
    // Reset consecutive FLOOD_WAIT counter on success
    if (this.consecutiveFloodWaits > 0) {
      this.consecutiveFloodWaits = 0;

      // Gradually reduce delay after successful calls
      if (this.config.enableAdaptiveThrottling && this.currentDelayMs > this.config.baseDelayMs) {
        this.currentDelayMs = Math.max(
          this.config.baseDelayMs,
          this.currentDelayMs * 0.8 // Reduce by 20%
        );
        this.metrics.currentMultiplier = this.currentDelayMs / this.config.baseDelayMs;
      }
    }
  }

  /**
   * Adjust delay after FLOOD_WAIT error based on strategy
   */
  private adjustDelayAfterFloodWait(): void {
    const multiplier = this.calculateAdaptiveMultiplier();
    this.currentDelayMs = Math.min(
      this.config.maxDelayMs,
      this.config.baseDelayMs * multiplier
    );
    this.metrics.currentMultiplier = multiplier;
  }

  /**
   * Calculate adaptive multiplier based on FLOOD_WAIT history
   */
  private calculateAdaptiveMultiplier(): number {
    const baseMultiplier = this.config.adaptiveMultiplier;

    switch (this.config.backoffStrategy) {
      case 'linear':
        return Math.min(
          baseMultiplier * this.consecutiveFloodWaits,
          this.config.maxDelayMs / this.config.baseDelayMs
        );

      case 'exponential':
        return Math.min(
          baseMultiplier ** this.consecutiveFloodWaits,
          this.config.maxDelayMs / this.config.baseDelayMs
        );

      default:
        return baseMultiplier;
    }
  }

  /**
   * Check if we need a cooldown period
   */
  shouldApplyCooldown(): boolean {
    if (!this.metrics.lastFloodWaitTime) {
      return false;
    }

    const timeSinceLastFloodWait = Date.now() - this.metrics.lastFloodWaitTime;
    return timeSinceLastFloodWait < this.config.cooldownPeriodMs && this.consecutiveFloodWaits >= 3;
  }

  /**
   * Apply cooldown period if needed
   */
  async applyCooldownIfNeeded(): Promise<void> {
    if (this.shouldApplyCooldown()) {
      const remainingCooldown = this.config.cooldownPeriodMs - (Date.now() - this.metrics.lastFloodWaitTime!);
      if (remainingCooldown > 0) {
        console.warn(`📋 Applying cooldown period: ${Math.ceil(remainingCooldown / 1000)}s`);
        await this.sleep(remainingCooldown);
        this.metrics.totalDelayMs += remainingCooldown;
      }
    }
  }

  /**
   * Get current rate limiting metrics
   */
  getMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Reset delay if base delay changed
    if (newConfig.baseDelayMs) {
      this.currentDelayMs = newConfig.baseDelayMs;
      this.metrics.currentMultiplier = 1.0;
    }
  }

  /**
   * Reset metrics and state
   */
  reset(): void {
    this.metrics = {
      totalCalls: 0,
      floodWaitCount: 0,
      averageFloodWaitSeconds: 0,
      totalDelayMs: 0,
      currentMultiplier: 1.0
    };
    this.currentDelayMs = this.config.baseDelayMs;
    this.consecutiveFloodWaits = 0;
    this.lastCallTime = 0;
  }

  /**
   * Format metrics for display
   */
  formatMetrics(): string {
    const { totalCalls, floodWaitCount, averageFloodWaitSeconds, totalDelayMs, currentMultiplier } = this.metrics;
    const successRate = totalCalls > 0 ? ((totalCalls - floodWaitCount) / totalCalls * 100).toFixed(1) : '0';

    return [
      `📊 Rate Limiting Stats:`,
      `   • Total API calls: ${totalCalls}`,
      `   • Success rate: ${successRate}%`,
      `   • FLOOD_WAIT errors: ${floodWaitCount}`,
      `   • Average FLOOD_WAIT: ${averageFloodWaitSeconds.toFixed(1)}s`,
      `   • Total delay time: ${(totalDelayMs / 1000).toFixed(1)}s`,
      `   • Current delay multiplier: ${currentMultiplier.toFixed(1)}x`,
      `   • Current delay: ${(this.currentDelayMs / 1000).toFixed(1)}s`
    ].join('\n');
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sleep with visual countdown display
   * @param ms Milliseconds to sleep
   * @param seconds Original seconds for display
   */
  private async sleepWithCountdown(ms: number, seconds: number): Promise<void> {
    const timer = new CountdownTimer(ms);

    timer.onUpdate((remaining: string, progress: number, progressBar?: string) => {
      const progressPercent = Math.round(progress);
      const line = `⏳ Remaining: ${remaining} ${progressBar || ''} ${progressPercent}%`;

      // Clear line and write countdown
      process.stdout.write(`\r${line.padEnd(80)}`);
    });

    timer.onComplete(() => {
      // Clear the countdown line and show completion
      process.stdout.write('\r✅ Rate limit cleared, retrying...'.padEnd(80) + '\n');
    });

    await timer.start();
  }
}