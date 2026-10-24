import { allowedOrigins } from "./config";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface LimitDecision {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): LimitDecision {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return {
        ok: true,
        retryAfterSeconds: 0,
        remaining: this.limit - 1,
      };
    }
    if (existing.count >= this.limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1000),
        ),
        remaining: 0,
      };
    }
    existing.count += 1;
    return {
      ok: true,
      retryAfterSeconds: 0,
      remaining: this.limit - existing.count,
    };
  }

  reset(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export const authIpLimiter = new FixedWindowLimiter(120, 15 * 60_000);
export const telegramIpLimiter = new FixedWindowLimiter(20, 10 * 60_000);

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function originOf(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function crossOriginRejected(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }
  const origin = originOf(request);
  if (!origin) return false;
  const allowed = new Set(allowedOrigins());
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // request.url is always absolute in Next; ignore malformed input.
  }
  return !allowed.has(origin);
}

export function rateLimitResponse(
  decision: LimitDecision,
  message = "Слишком много попыток. Попробуйте позже.",
): Response {
  return Response.json(
    { error: message, code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "retry-after": String(decision.retryAfterSeconds),
        "cache-control": "no-store",
      },
    },
  );
}
