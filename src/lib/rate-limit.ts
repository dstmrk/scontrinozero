export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the current window resets */
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Interval for periodic cleanup in milliseconds (default: 60_000) */
  cleanupIntervalMs?: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;

    const cleanupMs = options.cleanupIntervalMs ?? 60_000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupMs);
  }

  /**
   * Check if a request for the given key is allowed.
   * Increments the counter and returns the rate limit state.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.windows.get(key);

    // Window expired or first request — start new window
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, entry);
    }

    entry.count++;

    if (entry.count <= this.maxRequests) {
      return {
        success: true,
        remaining: this.maxRequests - entry.count,
        resetAt: entry.resetAt,
      };
    }

    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Reset the state for a specific key.
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Stop the periodic cleanup timer.
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /** Number of keys currently tracked. */
  get size(): number {
    return this.windows.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now >= entry.resetAt) {
        this.windows.delete(key);
      }
    }
  }
}
