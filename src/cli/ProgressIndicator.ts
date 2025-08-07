/**
 * Progress indicator utility for CLI operations
 */
export class ProgressIndicator {
  private current: number = 0;
  private total: number = 0;
  private startTime: number = 0;
  private lastUpdate: number = 0;
  private label: string = "";

  constructor(total: number, label: string = "Progress") {
    this.total = total;
    this.label = label;
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
  }

  /**
   * Update progress
   * @param current Current progress value
   * @param message Optional status message
   */
  update(current: number, message?: string): void {
    this.current = current;
    this.lastUpdate = Date.now();
    this.render(message);
  }

  /**
   * Increment progress by 1
   * @param message Optional status message
   */
  increment(message?: string): void {
    this.update(this.current + 1, message);
  }

  /**
   * Complete the progress
   * @param message Final message
   */
  complete(message?: string): void {
    this.current = this.total;
    this.render(message);
    console.log(); // New line after completion
  }

  /**
   * Fail the progress with error
   * @param error Error message
   */
  fail(error: string): void {
    console.log(); // New line
    console.error(`❌ ${this.label} failed: ${error}`);
  }

  /**
   * Render progress bar
   * @param message Optional status message
   */
  private render(message?: string): void {
    const percentage = Math.round((this.current / this.total) * 100);
    const elapsed = Date.now() - this.startTime;
    const eta = this.current > 0 ? (elapsed / this.current) * (this.total - this.current) : 0;

    // Create simple ASCII progress bar
    const barLength = 15;
    const filled = Math.round((this.current / this.total) * barLength);
    const bar = "=".repeat(filled) + "-".repeat(barLength - filled);

    // Format time
    const formatTime = (ms: number): string => {
      const seconds = Math.round(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
    };

    // Truncate message to prevent line overflow
    const truncateMessage = (msg: string, maxLength: number): string => {
      if (msg.length <= maxLength) return msg;
      return msg.substring(0, maxLength - 3) + "...";
    };

    let output = `\r${this.label}: [${bar}] ${percentage}% (${this.current}/${this.total})`;

    if (elapsed > 1000) {
      output += ` | Elapsed: ${formatTime(elapsed)}`;
    }

    if (eta > 1000 && this.current < this.total) {
      output += ` | ETA: ${formatTime(eta)}`;
    }

    if (message) {
      // Limit message length to prevent overflow
      const maxMessageLength = 60;
      const truncatedMessage = truncateMessage(message, maxMessageLength);
      output += ` | ${truncatedMessage}`;
    }

    // Clear the entire line first, then write progress
    process.stdout.write('\r' + ' '.repeat(process.stdout.columns || 120) + '\r');
    process.stdout.write(output);
  }

  /**
   * Create a simple spinner for indeterminate progress
   */
  static createSpinner(message: string = "Processing"): {
    start: () => void;
    stop: (finalMessage?: string) => void;
    update: (newMessage: string) => void;
  } {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frameIndex = 0;
    let interval: NodeJS.Timeout | null = null;
    let currentMessage = message;

    return {
      start: () => {
        interval = setInterval(() => {
          process.stdout.write(`\r${frames[frameIndex]} ${currentMessage}`);
          frameIndex = (frameIndex + 1) % frames.length;
        }, 100);
      },

      stop: (finalMessage?: string) => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        process.stdout.write(`\r${finalMessage || "✅ Done"}`.padEnd(80) + "\n");
      },

      update: (newMessage: string) => {
        currentMessage = newMessage;
      }
    };
  }

  /**
   * Create a progress bar for batch operations
   * @param items Items to process
   * @param processor Function to process each item
   * @param label Progress label
   */
  static async processBatch<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    label: string = "Processing"
  ): Promise<R[]> {
    const progress = new ProgressIndicator(items.length, label);
    const results: R[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        if (item === undefined) {
          throw new Error(`Item at index ${i} is undefined`);
        }
        const result = await processor(item, i);
        results.push(result);
        progress.increment(`Processed item ${i + 1}`);
      } catch (error) {
        progress.fail(`Failed to process item ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    progress.complete(`✅ Processed ${items.length} items successfully`);
    return results;
  }

  /**
   * Show a simple status message
   * @param message Message to display
   * @param type Message type
   */
  static showStatus(message: string, type: "info" | "success" | "warning" | "error" = "info"): void {
    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌"
    };

    console.log(`${icons[type]} ${message}`);
  }

  /**
   * Show a formatted list
   * @param title List title
   * @param items List items
   * @param numbered Whether to show numbers
   */
  static showList(title: string, items: string[], numbered: boolean = false): void {
    console.log(`\n📋 ${title}:`);
    console.log("=" + "=".repeat(title.length + 2));

    if (items.length === 0) {
      console.log("  (No items)");
    } else {
      items.forEach((item, index) => {
        const prefix = numbered ? `${index + 1}. ` : "• ";
        console.log(`  ${prefix}${item}`);
      });
    }

    console.log();
  }
}