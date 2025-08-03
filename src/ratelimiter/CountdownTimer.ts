/**
 * Options for countdown timer configuration
 */
export interface CountdownOptions {
  /** Update interval in milliseconds (default: 1000) */
  updateIntervalMs?: number;
  /** Whether to show progress bar (default: true) */
  showProgressBar?: boolean;
  /** Use long format for time display (default: false) */
  formatLong?: boolean;
}

/**
 * Callback for countdown updates
 */
export type CountdownUpdateCallback = (remaining: string, progress: number, progressBar?: string) => void;

/**
 * Callback for countdown completion
 */
export type CountdownCompleteCallback = () => void;

/**
 * Precision countdown timer with drift correction and progress visualization
 */
export class CountdownTimer {
  private durationMs: number;
  private options: Required<CountdownOptions>;
  private startTime: number = 0;
  private endTime: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private updateCallback: CountdownUpdateCallback | null = null;
  private completeCallback: CountdownCompleteCallback | null = null;
  private isRunning: boolean = false;

  constructor(durationMs: number, options: CountdownOptions = {}) {
    this.durationMs = durationMs;
    this.options = {
      updateIntervalMs: options.updateIntervalMs ?? 1000,
      showProgressBar: options.showProgressBar ?? true,
      formatLong: options.formatLong ?? false
    };
  }

  /**
   * Set update callback
   * @param callback Function called on each countdown update
   */
  onUpdate(callback: CountdownUpdateCallback): void {
    this.updateCallback = callback;
  }

  /**
   * Set completion callback
   * @param callback Function called when countdown completes
   */
  onComplete(callback: CountdownCompleteCallback): void {
    this.completeCallback = callback;
  }

  /**
   * Start the countdown timer
   * @returns Promise that resolves when countdown completes
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Countdown timer is already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.endTime = this.startTime + this.durationMs;

    // Initial update
    this.performUpdate();

    return new Promise<void>((resolve) => {
      const interval = () => {
        if (!this.isRunning) {
          resolve();
          return;
        }

        const now = Date.now();
        const remaining = Math.max(0, this.endTime - now);

        if (remaining <= 0) {
          // Countdown completed
          this.stop();
          this.completeCallback?.();
          resolve();
          return;
        }

        // Perform update
        this.performUpdate();

        // Schedule next update with drift correction
        const nextUpdateTime = Math.floor(now / this.options.updateIntervalMs) * this.options.updateIntervalMs + this.options.updateIntervalMs;
        const delay = Math.max(0, nextUpdateTime - Date.now());

        this.intervalId = setTimeout(interval, delay);
      };

      // Schedule first update
      const now = Date.now();
      const nextUpdateTime = Math.floor(now / this.options.updateIntervalMs) * this.options.updateIntervalMs + this.options.updateIntervalMs;
      const delay = Math.max(0, nextUpdateTime - Date.now());

      this.intervalId = setTimeout(interval, delay);
    });
  }

  /**
   * Stop the countdown timer
   */
  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check if timer is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Perform countdown update calculation and callback
   */
  private performUpdate(): void {
    if (!this.updateCallback) {
      return;
    }

    const now = Date.now();
    const remaining = Math.max(0, this.endTime - now);
    const elapsed = this.durationMs - remaining;
    const progress = Math.min(100, Math.max(0, (elapsed / this.durationMs) * 100));

    const timeString = this.formatTime(remaining);
    const progressBar = this.options.showProgressBar ? this.generateProgressBar(progress) : undefined;

    this.updateCallback(timeString, progress, progressBar);
  }

  /**
   * Format time in mm:ss or hh:mm:ss format
   * @param ms Milliseconds to format
   * @returns Formatted time string
   */
  private formatTime(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (this.options.formatLong || hours > 0) {
      // Use HH:MM:SS format
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // Use MM:SS format
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Generate progress bar visualization
   * @param progress Progress percentage (0-100)
   * @returns Progress bar string
   */
  private generateProgressBar(progress: number): string {
    const barLength = 20;
    const filled = Math.floor((progress / 100) * barLength);
    const empty = barLength - filled;

    const filledChar = '█';
    const emptyChar = '▓';

    return `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
  }

  /**
   * Static utility: Format time string from milliseconds
   * @param ms Milliseconds to format
   * @param longFormat Use HH:MM:SS format
   * @returns Formatted time string
   */
  static formatTime(ms: number, longFormat: boolean = false): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (longFormat || hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Static utility: Generate progress bar
   * @param progress Progress percentage (0-100)
   * @param length Bar length in characters (default: 20)
   * @returns Progress bar string
   */
  static generateProgressBar(progress: number, length: number = 20): string {
    const filled = Math.floor((progress / 100) * length);
    const empty = length - filled;

    const filledChar = '█';
    const emptyChar = '▓';

    return `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
  }
}