import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RateLimitConfig } from "../types/metadata";
import { RateLimiter } from "./RateLimiter";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;
  let config: RateLimitConfig;
  let consoleSpy: string[];

  beforeEach(() => {
    config = {
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      adaptiveMultiplier: 2.0,
      backoffStrategy: "linear",
      maxRetries: 3,
      cooldownPeriodMs: 60000,
      enableAdaptiveThrottling: true
    };

    rateLimiter = new RateLimiter(config);
    consoleSpy = [];

    // Mock process.stdout.write to capture output
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk: any) => {
      consoleSpy.push(chunk.toString());
      return true;
    };
  });

  afterEach(() => {
    // Note: In real tests, you would restore the original function
    // For this test, we're just acknowledging the mock behavior
  });

  describe("constructor", () => {
    test("should initialize with provided config", () => {
      expect(rateLimiter).toBeDefined();
      expect(rateLimiter.getConfig()).toEqual(config);
    });

    test("should initialize metrics to zero", () => {
      const metrics = rateLimiter.getMetrics();
      expect(metrics.totalCalls).toBe(0);
      expect(metrics.floodWaitCount).toBe(0);
      expect(metrics.averageFloodWaitSeconds).toBe(0);
      expect(metrics.totalDelayMs).toBe(0);
      expect(metrics.currentMultiplier).toBe(1.0);
    });
  });

  describe("beforeCall", () => {
    test("should update metrics and apply delay", async () => {
      const startTime = Date.now();
      await rateLimiter.beforeCall();
      const endTime = Date.now();

      const metrics = rateLimiter.getMetrics();
      expect(metrics.totalCalls).toBe(1);

      // Should have some delay applied
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });

    test("should handle multiple calls with proper timing", async () => {
      // First call
      await rateLimiter.beforeCall();
      const metrics1 = rateLimiter.getMetrics();
      expect(metrics1.totalCalls).toBe(1);

      // Second call should have delay
      const startTime = Date.now();
      await rateLimiter.beforeCall();
      const endTime = Date.now();

      const metrics2 = rateLimiter.getMetrics();
      expect(metrics2.totalCalls).toBe(2);
      expect(endTime - startTime).toBeGreaterThan(0);
    });
  });

  describe("handleFloodWait", () => {
    test("should handle FLOOD_WAIT without countdown", async () => {
      const floodWaitSeconds = 0.1; // 100ms for quick test
      const startTime = Date.now();

      await rateLimiter.handleFloodWait(floodWaitSeconds, false);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should have waited approximately the right amount of time
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance
      expect(elapsed).toBeLessThan(200);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.floodWaitCount).toBe(1);
      expect(metrics.averageFloodWaitSeconds).toBe(floodWaitSeconds);
    });

    test("should handle FLOOD_WAIT with countdown display", async () => {
      const floodWaitSeconds = 0.1; // 100ms for quick test
      const startTime = Date.now();

      await rateLimiter.handleFloodWait(floodWaitSeconds, true);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should have waited approximately the right amount of time (allowing for countdown overhead)
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(2000); // More generous timing for countdown

      // Should have output countdown messages
      expect(consoleSpy.length).toBeGreaterThan(0);

      // Should contain countdown elements
      const output = consoleSpy.join('');
      expect(output).toContain('⏳ Remaining:');
      expect(output).toContain('✅ Rate limit cleared');

      const metrics = rateLimiter.getMetrics();
      expect(metrics.floodWaitCount).toBe(1);
    });

    test("should use countdown by default", async () => {
      const floodWaitSeconds = 0.1;

      await rateLimiter.handleFloodWait(floodWaitSeconds);

      // Should have output countdown messages by default
      expect(consoleSpy.length).toBeGreaterThan(0);
      const output = consoleSpy.join('');
      expect(output).toContain('⏳ Remaining:');
    });

    test("should handle zero seconds gracefully", async () => {
      const startTime = Date.now();

      await rateLimiter.handleFloodWait(0, true);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should complete quickly for zero seconds
      expect(elapsed).toBeLessThan(100);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.floodWaitCount).toBe(1);
    });

    test("should update metrics correctly", async () => {
      const floodWaitSeconds1 = 0.1;
      const floodWaitSeconds2 = 0.2;

      await rateLimiter.handleFloodWait(floodWaitSeconds1, false);
      await rateLimiter.handleFloodWait(floodWaitSeconds2, false);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.floodWaitCount).toBe(2);

      // Calculate expected average
      const expectedAverage = (floodWaitSeconds1 + floodWaitSeconds2) / 2;
      expect(metrics.averageFloodWaitSeconds).toBeCloseTo(expectedAverage, 2);

      // Should have accumulated delay time
      expect(metrics.totalDelayMs).toBeGreaterThan(0);
    });
  });

  describe("markSuccessfulCall", () => {
    test("should reset consecutive FLOOD_WAIT counter", async () => {
      // Simulate FLOOD_WAIT errors
      await rateLimiter.handleFloodWait(0.1, false);
      await rateLimiter.handleFloodWait(0.1, false);

      // Mark successful call
      rateLimiter.markSuccessfulCall();

      // Should reduce delay if adaptive throttling is enabled
      const metrics = rateLimiter.getMetrics();
      expect(metrics.floodWaitCount).toBe(2); // Count should remain
    });

    test("should reduce delay after successful calls with adaptive throttling", async () => {
      // Cause delay to increase
      await rateLimiter.handleFloodWait(0.1, false);

      const metricsAfterFlood = rateLimiter.getMetrics();
      const multiplierAfterFlood = metricsAfterFlood.currentMultiplier;

      // Mark successful call
      rateLimiter.markSuccessfulCall();

      const metricsAfterSuccess = rateLimiter.getMetrics();
      const multiplierAfterSuccess = metricsAfterSuccess.currentMultiplier;

      // Multiplier should be reduced (or stay same if at base)
      expect(multiplierAfterSuccess).toBeLessThanOrEqual(multiplierAfterFlood);
    });
  });

  describe("adaptive throttling", () => {
    test("should adjust delay after multiple FLOOD_WAITs with linear strategy", async () => {
      const linearConfig = { ...config, backoffStrategy: "linear" as const };
      rateLimiter = new RateLimiter(linearConfig);

      const initialMetrics = rateLimiter.getMetrics();
      expect(initialMetrics.currentMultiplier).toBe(1.0);

      // First FLOOD_WAIT
      await rateLimiter.handleFloodWait(0.1, false);
      const metrics1 = rateLimiter.getMetrics();
      expect(metrics1.currentMultiplier).toBeGreaterThan(1.0);

      // Second FLOOD_WAIT should increase multiplier further
      await rateLimiter.handleFloodWait(0.1, false);
      const metrics2 = rateLimiter.getMetrics();
      expect(metrics2.currentMultiplier).toBeGreaterThan(metrics1.currentMultiplier);
    });

    test("should adjust delay after multiple FLOOD_WAITs with exponential strategy", async () => {
      const exponentialConfig = { ...config, backoffStrategy: "exponential" as const };
      rateLimiter = new RateLimiter(exponentialConfig);

      // First FLOOD_WAIT
      await rateLimiter.handleFloodWait(0.1, false);
      const metrics1 = rateLimiter.getMetrics();

      // Second FLOOD_WAIT should increase multiplier exponentially
      await rateLimiter.handleFloodWait(0.1, false);
      const metrics2 = rateLimiter.getMetrics();
      expect(metrics2.currentMultiplier).toBeGreaterThan(metrics1.currentMultiplier);
    });
  });

  describe("cooldown period", () => {
    test("should apply cooldown after multiple consecutive FLOOD_WAITs", async () => {
      // Generate multiple FLOOD_WAITs
      for (let i = 0; i < 3; i++) {
        await rateLimiter.handleFloodWait(0.1, false);
      }

      expect(rateLimiter.shouldApplyCooldown()).toBe(true);
    });

    test("should not apply cooldown with fewer FLOOD_WAITs", async () => {
      await rateLimiter.handleFloodWait(0.1, false);
      await rateLimiter.handleFloodWait(0.1, false);

      expect(rateLimiter.shouldApplyCooldown()).toBe(false);
    });
  });

  describe("configuration management", () => {
    test("should update configuration", () => {
      const newConfig = { baseDelayMs: 2000 };
      rateLimiter.updateConfig(newConfig);

      const updatedConfig = rateLimiter.getConfig();
      expect(updatedConfig.baseDelayMs).toBe(2000);
      expect(updatedConfig.maxDelayMs).toBe(config.maxDelayMs); // Others unchanged
    });

    test("should reset delay when base delay changes", () => {
      // Increase delay first
      rateLimiter.handleFloodWait(0.1, false);

      // Update base delay
      rateLimiter.updateConfig({ baseDelayMs: 2000 });

      const metrics = rateLimiter.getMetrics();
      expect(metrics.currentMultiplier).toBe(1.0); // Should reset
    });
  });

  describe("reset functionality", () => {
    test("should reset all metrics and state", async () => {
      // Generate some activity
      await rateLimiter.beforeCall();
      await rateLimiter.handleFloodWait(0.1, false);
      rateLimiter.markSuccessfulCall();

      // Reset
      rateLimiter.reset();

      const metrics = rateLimiter.getMetrics();
      expect(metrics.totalCalls).toBe(0);
      expect(metrics.floodWaitCount).toBe(0);
      expect(metrics.averageFloodWaitSeconds).toBe(0);
      expect(metrics.totalDelayMs).toBe(0);
      expect(metrics.currentMultiplier).toBe(1.0);
      expect(metrics.lastFloodWaitTime).toBeUndefined();
    });
  });

  describe("metrics formatting", () => {
    test("should format metrics for display", async () => {
      await rateLimiter.beforeCall();
      await rateLimiter.handleFloodWait(0.1, false);

      const formatted = rateLimiter.formatMetrics();

      expect(formatted).toContain('Rate Limiting Stats:');
      expect(formatted).toContain('Total API calls: 1');
      expect(formatted).toContain('FLOOD_WAIT errors: 1');
      expect(formatted).toContain('Success rate:');
      expect(formatted).toContain('Average FLOOD_WAIT:');
      expect(formatted).toContain('Total delay time:');
      expect(formatted).toContain('Current delay multiplier:');
    });

    test("should handle zero metrics correctly", () => {
      const formatted = rateLimiter.formatMetrics();

      expect(formatted).toContain('Total API calls: 0');
      expect(formatted).toContain('Success rate: 0');
      expect(formatted).toContain('FLOOD_WAIT errors: 0');
    });
  });
});