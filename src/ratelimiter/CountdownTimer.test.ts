import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type CountdownOptions, CountdownTimer } from "./CountdownTimer";

describe("CountdownTimer", () => {
  let timer: CountdownTimer;
  let updateCallbacks: Array<{ remaining: string; progress: number; progressBar?: string }>;
  let completeCallback: () => void;
  let completeCallCount: number;

  beforeEach(() => {
    updateCallbacks = [];
    completeCallCount = 0;
    completeCallback = () => {
      completeCallCount++;
    };
  });

  afterEach(() => {
    if (timer && timer.isActive()) {
      timer.stop();
    }
  });

  describe("constructor", () => {
    test("should create timer with default options", () => {
      timer = new CountdownTimer(5000);
      expect(timer).toBeDefined();
      expect(timer.isActive()).toBe(false);
    });

    test("should create timer with custom options", () => {
      const options: CountdownOptions = {
        updateIntervalMs: 500,
        showProgressBar: false,
        formatLong: true
      };
      timer = new CountdownTimer(10000, options);
      expect(timer).toBeDefined();
    });
  });

  describe("callback setup", () => {
    beforeEach(() => {
      timer = new CountdownTimer(3000);
    });

    test("should set update callback", () => {
      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      expect(updateCallbacks).toHaveLength(0);
    });

    test("should set complete callback", () => {
      timer.onComplete(completeCallback);
      expect(completeCallCount).toBe(0);
    });
  });

  describe("timer execution", () => {
    test("should complete short timer", async () => {
      timer = new CountdownTimer(100); // 100ms timer

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      await timer.start();

      expect(completeCallCount).toBe(1);
      expect(timer.isActive()).toBe(false);
      expect(updateCallbacks.length).toBeGreaterThan(0);
    });

    test("should handle timer stop", () => {
      timer = new CountdownTimer(5000); // 5 second timer

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      // Start timer
      timer.start();

      expect(timer.isActive()).toBe(true);

      // Stop timer
      timer.stop();

      expect(timer.isActive()).toBe(false);
      // Complete callback should not be called when manually stopped
      expect(completeCallCount).toBe(0);
    });

    test("should throw error when starting already running timer", () => {
      timer = new CountdownTimer(1000);

      timer.onUpdate(() => { });

      // Start timer
      timer.start();

      // Try to start again - should throw
      expect(() => timer.start()).toThrow("Countdown timer is already running");

      timer.stop();
    });
  });

  describe("progress calculation", () => {
    test("should calculate progress correctly", async () => {
      timer = new CountdownTimer(1000); // 1 second timer

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });

        // Progress should be between 0 and 100
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(100);

        // Progress should increase over time
        if (updateCallbacks.length > 1) {
          const previousUpdate = updateCallbacks[updateCallbacks.length - 2];
          if (previousUpdate) {
            expect(progress).toBeGreaterThanOrEqual(previousUpdate.progress);
          }
        }
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      await timer.start();

      expect(updateCallbacks.length).toBeGreaterThan(0);
    });

    test("should include progress bar when enabled", async () => {
      timer = new CountdownTimer(200, { showProgressBar: true });

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });

        // Progress bar should be present and properly formatted
        expect(progressBar).toBeDefined();
        expect(progressBar).toMatch(/^\[█*▓*\]$/);
        expect(progressBar!.length).toBe(22); // [20 chars]
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      await timer.start();

      expect(updateCallbacks.length).toBeGreaterThan(0);
    });

    test("should not include progress bar when disabled", async () => {
      timer = new CountdownTimer(200, { showProgressBar: false });

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });

        // Progress bar should not be present
        expect(progressBar).toBeUndefined();
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      await timer.start();

      expect(updateCallbacks.length).toBeGreaterThan(0);
    });
  });

  describe("time formatting", () => {
    test("should format short durations correctly", async () => {
      timer = new CountdownTimer(30000); // 30 seconds

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });

        // Should use MM:SS format for durations under 1 hour
        expect(remaining).toMatch(/^\d{2}:\d{2}$/);

        // Stop after first update to avoid timeout
        timer.stop();
      };

      timer.onUpdate(updateCallback);

      await timer.start();

      expect(updateCallbacks.length).toBeGreaterThan(0);
    });

    test("should format long durations correctly with formatLong option", async () => {
      timer = new CountdownTimer(30000, { formatLong: true }); // 30 seconds with long format

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });

        // Should use HH:MM:SS format when formatLong is true
        expect(remaining).toMatch(/^\d{2}:\d{2}:\d{2}$/);

        // Stop after first update to avoid timeout
        timer.stop();
      };

      timer.onUpdate(updateCallback);

      await timer.start();

      expect(updateCallbacks.length).toBeGreaterThan(0);
    });
  });

  describe("static utility methods", () => {
    test("should format time correctly with formatTime static method", () => {
      // Test various durations
      expect(CountdownTimer.formatTime(30000)).toBe("00:30"); // 30 seconds
      expect(CountdownTimer.formatTime(90000)).toBe("01:30"); // 90 seconds
      expect(CountdownTimer.formatTime(3600000)).toBe("01:00:00"); // 1 hour
      expect(CountdownTimer.formatTime(7200000)).toBe("02:00:00"); // 2 hours

      // Test with long format
      expect(CountdownTimer.formatTime(30000, true)).toBe("00:00:30"); // 30 seconds
      expect(CountdownTimer.formatTime(90000, true)).toBe("00:01:30"); // 90 seconds
    });

    test("should generate progress bar correctly with generateProgressBar static method", () => {
      // Test various progress values
      expect(CountdownTimer.generateProgressBar(0)).toBe("[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓]");
      expect(CountdownTimer.generateProgressBar(50)).toBe("[██████████▓▓▓▓▓▓▓▓▓▓]");
      expect(CountdownTimer.generateProgressBar(100)).toBe("[████████████████████]");

      // Test with custom length
      expect(CountdownTimer.generateProgressBar(50, 10)).toBe("[█████▓▓▓▓▓]");
      expect(CountdownTimer.generateProgressBar(25, 8)).toBe("[██▓▓▓▓▓▓]");
    });
  });

  describe("edge cases", () => {
    test("should handle zero duration", async () => {
      timer = new CountdownTimer(0);

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      await timer.start();

      expect(completeCallCount).toBe(1);
      expect(timer.isActive()).toBe(false);
    });

    test("should handle negative duration", async () => {
      timer = new CountdownTimer(-1000);

      const updateCallback = (remaining: string, progress: number, progressBar?: string) => {
        updateCallbacks.push({ remaining, progress, progressBar });
      };

      timer.onUpdate(updateCallback);
      timer.onComplete(completeCallback);

      await timer.start();

      expect(completeCallCount).toBe(1);
      expect(timer.isActive()).toBe(false);
    });

    test("should work without callbacks", async () => {
      timer = new CountdownTimer(100);

      // Should not throw error even without callbacks
      await timer.start();
      expect(timer.isActive()).toBe(false);
    });
  });
});