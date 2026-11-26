// A fixed-window request counter kept in this process's memory.
//
// It is cheap enough to run on every request in the proxy. Each server process
// keeps its own counts, so with N containers a client gets up to N times the
// limit, and counts reset on restart. That's fine for flood protection. Limits
// that must hold exactly (failed logins, new requests) are counted in Postgres
// instead.

type Window = { count: number; resetAt: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 50_000,
}: {
  limit: number;
  windowMs: number;
  /** Caps memory if someone sprays requests from many addresses. */
  maxKeys?: number;
}) {
  const windows = new Map<string, Window>();

  function evict(now: number) {
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
    // Still full: drop the oldest windows (a Map iterates in insertion order).
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return {
    /** Counts one request for `key` and says whether it is within the limit. */
    hit(key: string): RateLimitResult {
      const now = Date.now();
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        if (windows.size >= maxKeys) evict(now);
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count++;
      return w.count <= limit
        ? { ok: true }
        : { ok: false, retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) };
    },
  };
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response("Too many requests. Please wait a minute and try again.", {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds), "Content-Type": "text/plain" },
  });
}
