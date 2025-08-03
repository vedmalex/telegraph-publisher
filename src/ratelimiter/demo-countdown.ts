#!/usr/bin/env bun

/**
 * Demo script to test countdown functionality
 * Run with: bun src/ratelimiter/demo-countdown.ts
 */

import { CountdownTimer } from "./CountdownTimer";
import { RateLimiter } from "./RateLimiter";

async function demoCountdownTimer() {
  console.log("🧪 Demo: CountdownTimer standalone");
  console.log("=====================================");

  const timer = new CountdownTimer(5000); // 5 seconds

  timer.onUpdate((remaining, progress, progressBar) => {
    const progressPercent = Math.round(progress);
    const line = `⏳ Remaining: ${remaining} ${progressBar || ''} ${progressPercent}%`;
    process.stdout.write(`\r${line.padEnd(80)}`);
  });

  timer.onComplete(() => {
    process.stdout.write('\r✅ Countdown completed!'.padEnd(80) + '\n\n');
  });

  await timer.start();
}

async function demoRateLimiter() {
  console.log("🧪 Demo: RateLimiter with FLOOD_WAIT countdown");
  console.log("==============================================");

  const config = {
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    adaptiveMultiplier: 2.0,
    backoffStrategy: "linear" as const,
    maxRetries: 3,
    cooldownPeriodMs: 60000,
    enableAdaptiveThrottling: true
  };

  const rateLimiter = new RateLimiter(config);

  console.log("Simulating FLOOD_WAIT error with 3 seconds wait...");
  console.log("🚦 Rate limited: waiting 3s before retry...");

  await rateLimiter.handleFloodWait(3); // 3 seconds with countdown

  console.log("Rate limiting demonstration completed!\n");

  // Show metrics
  console.log(rateLimiter.formatMetrics());
}

async function demoComparison() {
  console.log("🧪 Demo: Countdown vs No Countdown comparison");
  console.log("=============================================");

  const config = {
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    adaptiveMultiplier: 2.0,
    backoffStrategy: "linear" as const,
    maxRetries: 3,
    cooldownPeriodMs: 60000,
    enableAdaptiveThrottling: true
  };

  const rateLimiter = new RateLimiter(config);

  console.log("1. Without countdown (silent wait):");
  const start1 = Date.now();
  await rateLimiter.handleFloodWait(2, false); // 2 seconds without countdown
  const elapsed1 = Date.now() - start1;
  console.log(`   Completed in ${elapsed1}ms (silent)\n`);

  console.log("2. With countdown (visual feedback):");
  console.log("🚦 Rate limited: waiting 2s before retry...");
  const start2 = Date.now();
  await rateLimiter.handleFloodWait(2, true); // 2 seconds with countdown
  const elapsed2 = Date.now() - start2;
  console.log(`   Completed in ${elapsed2}ms (with countdown)\n`);
}

async function main() {
  console.log("🎯 Telegraph Publisher - Rate Limit Countdown Demo");
  console.log("==================================================\n");

  try {
    // Demo 1: Standalone CountdownTimer
    await demoCountdownTimer();

    // Demo 2: RateLimiter with countdown
    await demoRateLimiter();

    // Demo 3: Comparison
    await demoComparison();

    console.log("🎉 All demos completed successfully!");

  } catch (error) {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  }
}

// Run demo if this script is executed directly
if (import.meta.main) {
  main();
}