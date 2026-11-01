/**
 * Finestre temporali standard usate dai rate limiter dell'app.
 * Centralizzare i magic number (15 min, 1 ora, ecc.) evita drift tra le
 * varie server actions e rende ovvia la policy.
 */
export const RATE_LIMIT_WINDOWS = {
  /** 1 minuto — finestra di picco nei limiter a due finestre (emit, list API) */
  MINUTE: 60 * 1000,
  /** 15 minuti — flussi auth interattivi (signIn/signUp/changePassword/...) */
  AUTH_15_MIN: 15 * 60 * 1000,
  /** 1 ora — operazioni autenticate frequenti (emit/void/checkout/portal/profile) */
  HOURLY: 60 * 60 * 1000,
  /** 24 ore — operazioni che spendono quota esterna (inviti via email) */
  DAILY: 24 * 60 * 60 * 1000,
} as const;

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
  /**
   * Hard cap on simultaneously tracked keys (default: 50_000).
   * Quando si supera il cap, la chiave più vecchia in inserimento viene
   * evicted (FIFO). Previene memory pressure su VPS limitate quando un
   * attaccante distribuisce richieste su molti IP unici.
   */
  maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 50_000;

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;

    const cleanupMs = options.cleanupIntervalMs ?? 60_000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupMs);
    // Unref the timer so it doesn't keep the Node.js process alive on shutdown
    // (scripts, test runners, one-shot jobs). In the long-running server the
    // timer is harmless because the event loop has other refs; in short-lived
    // contexts an unref'd timer lets the process exit cleanly even when
    // `destroy()` was not invoked (CLAUDE.md "no half-finished cleanup").
    this.cleanupTimer.unref?.();
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
      // Enforce the hard cap before inserting a new key. Map preserves
      // insertion order, so keys() yields the oldest first (FIFO eviction).
      if (!this.windows.has(key) && this.windows.size >= this.maxKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest !== undefined) this.windows.delete(oldest);
      }
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

/**
 * Più finestre sulla stessa chiave: una breve per il picco, una lunga per la
 * media. È l'approssimazione a finestre fisse di un token bucket: assorbe la
 * fila alla cassa senza lasciar tenere il ritmo massimo per un'ora intera, e
 * chi sbatte sul picco riprova entro il minuto invece di aspettare l'ora.
 *
 * Le finestre si controllano in ordine e ci si ferma alla prima che rifiuta:
 * una richiesta respinta dal picco non consuma la media. Il contrario sì (la
 * finestra breve conta anche una richiesta che poi la lunga respinge), ed è
 * innocuo: a media esaurita la chiave è comunque ferma.
 */
export class MultiWindowRateLimiter {
  private readonly limiters: RateLimiter[];

  /** @param windows - dalla più breve alla più lunga */
  constructor(windows: RateLimiterOptions[]) {
    if (windows.length === 0) {
      throw new Error("MultiWindowRateLimiter: serve almeno una finestra");
    }
    this.limiters = windows.map((w) => new RateLimiter(w));
  }

  check(key: string): RateLimitResult {
    let tightest: RateLimitResult | null = null;
    for (const limiter of this.limiters) {
      const result = limiter.check(key);
      if (!result.success) return result;
      if (!tightest || result.remaining < tightest.remaining) {
        tightest = result;
      }
    }
    // Il costruttore garantisce almeno una finestra.
    return tightest as RateLimitResult;
  }

  reset(key: string): void {
    for (const limiter of this.limiters) limiter.reset(key);
  }

  destroy(): void {
    for (const limiter of this.limiters) limiter.destroy();
  }
}
