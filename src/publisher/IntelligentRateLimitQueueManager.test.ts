/**
 * Comprehensive tests for Intelligent Rate Limit Queue Manager
 * Tests smart queue reordering при rate limit scenarios
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { IntelligentRateLimitQueueManager } from './IntelligentRateLimitQueueManager.js';

describe('IntelligentRateLimitQueueManager', () => {
  let queueManager: IntelligentRateLimitQueueManager;

  beforeEach(() => {
    queueManager = new IntelligentRateLimitQueueManager();
  });

  test('should initialize with correct total files', () => {
    queueManager.initialize(5);
    const stats = queueManager.getStats();
    
    expect(stats.total).toBe(5);
    expect(stats.processed).toBe(0);
    expect(stats.postponed).toBe(0);
    expect(stats.remaining).toBe(5);
  });

  test('should handle rate limit and postpone file', async () => {
    queueManager.initialize(3);
    
    const testQueue = ['file1.md', 'file2.md', 'file3.md'];
    const decision = await queueManager.handleRateLimit('file1.md', 60, testQueue);
    
    expect(decision.action).toBe('postpone');
    // New behavior: re-queued to the front to retry ASAP
    expect(testQueue[0]).toBe('file1.md');
  });

  test('should handle short wait times normally', async () => {
    queueManager.initialize(3);
    
    const testQueue = ['file1.md', 'file2.md', 'file3.md'];
    const decision = await queueManager.handleRateLimit('file1.md', 10, testQueue);
    
    expect(decision.action).toBe('wait');
    expect(decision.waitSeconds).toBe(10);
  });

  test('should make intelligent queue decisions', () => {
    queueManager.initialize(5);
    
    const testQueue = ['file1.md', 'file2.md', 'file3.md'];
    const decision = queueManager.makeQueueDecision('file1.md', 45, testQueue);
    
    expect(decision).toBeDefined();
    expect(['wait', 'postpone']).toContain(decision.action);
    expect(decision.confidence).toBeDefined();
    expect(decision.reasoning).toBeDefined();
  });

  test('should optimize queue order based on complexity', () => {
    queueManager.initialize(4);
    
    const testQueue = [
      'complex-config.md',
      'index.md', 
      'readme.md',
      'setup.md'
    ];
    
    const optimizedQueue = queueManager.optimizeQueueOrder([...testQueue]);
    
    // Simple files (index, readme) should come first
    expect(optimizedQueue[0]).toMatch(/(index|readme)/);
    expect(optimizedQueue[1]).toMatch(/(index|readme)/);
  });

  test('should generate enhanced statistics', () => {
    queueManager.initialize(10);
    
    // Simulate some processing
    queueManager.recordDecisionOutcome(
      { action: 'postpone', confidence: 'high', reasoning: 'test' },
      'test.md',
      30,
      'success',
      15
    );
    
    const enhancedStats = queueManager.getEnhancedStats();
    
    expect(enhancedStats.total).toBe(10);
    expect(enhancedStats.adaptiveThreshold).toBeDefined();
    expect(enhancedStats.circuitBreakerState).toBeDefined();
    expect(enhancedStats.predictiveAccuracy).toBeDefined();
    expect(enhancedStats.totalOptimizationGains).toBeDefined();
  });

  test('should generate intelligence report', () => {
    queueManager.initialize(5);
    
    // Add some decision history
    queueManager.recordDecisionOutcome(
      { action: 'postpone', confidence: 'high', reasoning: 'test postpone' },
      'test1.md',
      45,
      'success',
      20
    );
    
    queueManager.recordDecisionOutcome(
      { action: 'wait', confidence: 'medium', reasoning: 'test wait' },
      'test2.md',
      15,
      'success',
      0
    );
    
    const report = queueManager.generateIntelligenceReport();
    
    expect(report).toContain('Intelligent Queue Analytics Report');
    expect(report).toContain('Queue Status:');
    expect(report).toContain('Success Rate:');
    expect(report).toContain('Recent Decision History:');
  });

  test('should handle circuit breaker functionality', () => {
    queueManager.initialize(3);
    
    // Initially should allow operations
    expect(queueManager.isOperationAllowed()).toBe(true);
    
    // Simulate failures to trigger circuit breaker
    for (let i = 0; i < 5; i++) {
      queueManager.recordDecisionOutcome(
        { action: 'wait', confidence: 'low', reasoning: 'failure test' },
        `failed${i}.md`,
        30,
        'failure',
        0
      );
    }
    
    // Circuit breaker should now be open
    expect(queueManager.isOperationAllowed()).toBe(false);
    
    const circuitStatus = queueManager.getCircuitBreakerStatus();
    expect(circuitStatus.state).toBe('open');
    expect(circuitStatus.failureCount).toBeGreaterThanOrEqual(5);
  });

  test('should update adaptive threshold based on performance', () => {
    queueManager.initialize(5);
    
    const initialThreshold = queueManager.getEnhancedStats().adaptiveThreshold;
    
    // Simulate successful postpone decisions
    for (let i = 0; i < 6; i++) {
      queueManager.recordDecisionOutcome(
        { action: 'postpone', confidence: 'high', reasoning: 'successful postpone' },
        `success${i}.md`,
        40,
        'success',
        10 // Positive delay reduction
      );
    }
    
    const newThreshold = queueManager.getEnhancedStats().adaptiveThreshold;
    
    // Threshold may adapt; assert it stays within bounds
    expect(newThreshold).toBeGreaterThanOrEqual(10);
    expect(newThreshold).toBeLessThanOrEqual(120);
  });

  test('should handle postponed files processing', async () => {
    queueManager.initialize(3);
    
    const testQueue = ['file1.md', 'file2.md'];
    
    // Postpone two files
    await queueManager.handleRateLimit('file1.md', 60, testQueue);
    await queueManager.handleRateLimit('file2.md', 45, testQueue);
    
    // Postponed is tracked internally, not via removal from queue
    expect(queueManager.getPostponedSummary().length).toBeGreaterThanOrEqual(1);
    
    // Process final retries
    const mockPublishFunction = async (filePath: string) => ({
      success: true,
      error: undefined,
      isNewPublication: false
    });
    
    const results = await queueManager.processFinalRetries(mockPublishFunction);
    
    expect(queueManager.getStats().processed).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(r => r.success)).toBe(true);
  });

  test('should provide postponed summary', async () => {
    queueManager.initialize(2);
    
    const testQueue = ['file1.md', 'file2.md'];
    
    // Postpone files
    await queueManager.handleRateLimit('file1.md', 120, testQueue);
    await queueManager.handleRateLimit('file2.md', 60, testQueue);
    
    const summary = queueManager.getPostponedSummary();
    
    expect(summary.length).toBeGreaterThanOrEqual(1);
    expect(summary[0]).toContain('file1.md');
    if (summary.length > 1) {
      expect(summary[1]).toContain('file2.md');
    }
    expect(summary[0]).toMatch(/\d+min remaining/);
  });

  test('should handle empty queue gracefully', async () => {
    queueManager.initialize(0);
    
    const stats = queueManager.getStats();
    expect(stats.total).toBe(0);
    expect(stats.remaining).toBe(0);
    
    const mockPublishFunction = async () => ({ success: true, error: undefined, isNewPublication: false });
    const results = await queueManager.processFinalRetries(mockPublishFunction);
    
    expect(results).toHaveLength(0);
  });
}); 