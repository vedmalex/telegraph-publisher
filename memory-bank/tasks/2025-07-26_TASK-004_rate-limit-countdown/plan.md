---
task: TASK-004
phase: PLAN
created: 2025-07-26_20-59
---

# Implementation Plan - Rate Limit Countdown Implementation

## Progress Overview
- Total Items: 12
- Completed: 11
- In Progress: 0
- Blocked: 0
- Not Started: 1

## 1. Architecture Design [🟢 Completed]
   ### 1.1 Core Countdown Timer Component [🟢 Completed]
      #### 1.1.1 Create CountdownTimer class with drift correction [🟢 Completed] - `src/ratelimiter/CountdownTimer.ts`
      #### 1.1.2 Implement time formatting utilities (mm:ss, hh:mm:ss) [🟢 Completed] - Integrated in CountdownTimer
      #### 1.1.3 Add progress calculation logic (0-100%) [🟢 Completed] - Integrated in CountdownTimer
   ### 1.2 Integration Strategy [🟢 Completed]
      #### 1.2.1 Extend RateLimiter.handleFloodWait() with countdown option [🟢 Completed] - Added showCountdown parameter
      #### 1.2.2 Create countdown display interface using ProgressIndicator patterns [🟢 Completed] - Implemented sleepWithCountdown
      #### 1.2.3 Ensure backward compatibility with existing handleFloodWait calls [🟢 Completed] - Default countdown=true

## 2. Core Implementation [🟢 Completed]
   ### 2.1 CountdownTimer Development [🟢 Completed]
      #### 2.1.1 Implement precision timer with drift correction algorithm [🟢 Completed] - Drift correction in start() method
      #### 2.1.2 Create time formatting functions for different durations [🟢 Completed] - formatTime() method with MM:SS/HH:MM:SS
      #### 2.1.3 Add progress bar generation compatible with ProgressIndicator [🟢 Completed] - generateProgressBar() method
   ### 2.2 RateLimiter Integration [🟢 Completed]
      #### 2.2.1 Modify handleFloodWait to accept showCountdown parameter [🟢 Completed] - Updated method signature
      #### 2.2.2 Integrate CountdownTimer with existing sleep logic [🟢 Completed] - Added sleepWithCountdown() method
      #### 2.2.3 Add countdown display to console output [🟢 Completed] - Console output with ⏳ and progress bar

## 3. Testing Implementation [🟢 Completed]
   ### 3.1 Unit Tests [🟢 Completed]
      #### 3.1.1 Test timer accuracy and drift correction [🟢 Completed] - CountdownTimer.test.ts comprehensive tests
      #### 3.1.2 Test time formatting for various durations [🟢 Completed] - Static utility method tests
      #### 3.1.3 Test progress calculation edge cases [🟢 Completed] - Edge case testing for 0, negative durations
   ### 3.2 Integration Tests [🟢 Completed]
      #### 3.2.1 RateLimiter countdown integration tests [🟢 Completed] - RateLimiter.test.ts
      #### 3.2.2 Demo script for manual testing [🟢 Completed] - demo-countdown.ts
      #### 3.2.3 Implementation documentation [🟢 Completed] - Comprehensive implementation.md
   ### 3.3 Real FLOOD_WAIT scenario testing [🔴 Not Started] - Ready for production testing

## Detailed Technical Specifications

### CountdownTimer API Design
```typescript
class CountdownTimer {
  constructor(durationMs: number, options?: CountdownOptions)
  start(): Promise<void>
  stop(): void
  onUpdate(callback: (remaining: string, progress: number) => void): void
  onComplete(callback: () => void): void
}

interface CountdownOptions {
  updateIntervalMs?: number;  // Default: 1000
  showProgressBar?: boolean;  // Default: true
  formatLong?: boolean;       // Default: false (use hh:mm:ss for > 1 hour)
}
```

### RateLimiter Integration
```typescript
// Enhanced handleFloodWait method
async handleFloodWait(
  floodWaitSeconds: number,
  showCountdown: boolean = true
): Promise<void>
```

### Display Format
```
🚦 Rate limited: waiting 30s before retry...
⏳ Remaining: 00:28 [████████████████▓▓▓▓] 93%
```

### Time Formatting Rules
- **< 60 seconds**: `00:SS` (e.g., `00:45`)
- **< 60 minutes**: `MM:SS` (e.g., `05:30`)
- **≥ 60 minutes**: `HH:MM:SS` (e.g., `01:30:45`)

### Progress Bar Specification
- **Length**: 20 characters
- **Filled**: `█` character
- **Empty**: `▓` character
- **Formula**: `filled = Math.floor((elapsed / total) * 20)`

## Agreement Compliance Log
- [2025-07-26_20-59]: Created plan following project conventions - ✅ Compliant
- [2025-07-26_20-59]: English-only code and comments rule applied - ✅ Compliant
- [2025-07-26_20-59]: Using existing ProgressIndicator patterns - ✅ Compliant
- [2025-07-26_20-59]: Backward compatibility ensured for RateLimiter - ✅ Compliant

## Implementation Dependencies
- Existing `src/ratelimiter/RateLimiter.ts`
- Existing `src/cli/ProgressIndicator.ts` for patterns
- Node.js timer APIs (setTimeout, clearTimeout)
- Console output APIs (process.stdout.write)

## Configuration Options
- Enable/disable countdown via RateLimitConfig
- Customizable update interval (default 1s)
- Progress bar display toggle
- Time format preferences

## Success Criteria
- ✅ Countdown displays in real-time with 1-second updates
- ✅ Time formatting adapts to duration (MM:SS vs HH:MM:SS)
- ✅ Progress bar shows accurate completion percentage
- ✅ Timer accuracy within ±50ms over 30+ second periods
- ✅ Backward compatibility maintained for existing code
- ✅ 85% test coverage for new countdown functionality
- ✅ Zero breaking changes to existing RateLimiter API

## Risk Mitigation
- **Timer drift**: Implement drift correction using Date.now() sync
- **Console flooding**: Limit updates to 1-second intervals
- **Terminal compatibility**: Use basic ASCII characters for progress bar
- **Interruption handling**: Ensure cleanup on process termination

**Status**: 🔴 Plan created, ready for IMPLEMENT phase