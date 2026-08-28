/**
 * Desktop-auth rate limiter.
 *
 * Development (NODE_ENV !== "production") uses an in-memory sliding window.
 * That is per-process only and is not safe across multiple website instances.
 *
 * Production must not silently use in-memory limits. A shared store is required:
 * atomic increment of (bucket, clientKey) with TTL = windowMs, visible to every
 * website instance. No shared store is implemented yet, so production fail-closes
 * (limiter unavailable → 503) until one exists.
 */

export const DESKTOP_AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const DESKTOP_AUTH_RATE_LIMIT_MAX = 20;

export type DesktopAuthLimitDecision =
  | { allowed: true }
  | { allowed: false; status: 429; retryAfterSec: number }
  | { allowed: false; status: 503; error: "rate_limit_unavailable" };

export interface DesktopAuthLimiter {
  allow(clientKey: string): DesktopAuthLimitDecision;
}

export class MemoryDesktopAuthLimiter implements DesktopAuthLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(
    windowMs = DESKTOP_AUTH_RATE_LIMIT_WINDOW_MS,
    max = DESKTOP_AUTH_RATE_LIMIT_MAX,
    now: () => number = Date.now
  ) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
  }

  allow(clientKey: string): DesktopAuthLimitDecision {
    const key = clientKey || "unknown";
    const t = this.now();
    const windowStart = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000));
      return { allowed: false, status: 429, retryAfterSec };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { allowed: true };
  }
}

export class UnavailableDesktopAuthLimiter implements DesktopAuthLimiter {
  allow(_clientKey: string): DesktopAuthLimitDecision {
    return { allowed: false, status: 503, error: "rate_limit_unavailable" };
  }
}

const memorySingleton = new MemoryDesktopAuthLimiter();
const unavailableSingleton = new UnavailableDesktopAuthLimiter();

export function resolveDesktopAuthLimiter(options?: {
  nodeEnv?: string;
}): DesktopAuthLimiter {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === "production") {
    return unavailableSingleton;
  }
  return memorySingleton;
}

export function getDesktopAuthLimiter(): DesktopAuthLimiter {
  return resolveDesktopAuthLimiter();
}

export function desktopAuthClientKey(headers: { get: (name: string) => string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}
