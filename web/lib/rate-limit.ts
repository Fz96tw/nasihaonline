import { redis } from "@/lib/redis";

/**
 * Resolves the real client IP behind our nginx reverse proxy. X-Real-IP is
 * set via `proxy_set_header X-Real-IP $remote_addr` — a full overwrite the
 * client can't influence. X-Forwarded-For is only a fallback: nginx sets it
 * via $proxy_add_x_forwarded_for, which *appends* to whatever the client
 * already sent rather than replacing it, so the first entry is
 * attacker-controlled and only the last (nginx-appended) entry is trustworthy.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((part) => part.trim());
    return parts[parts.length - 1] || "unknown";
  }

  return "unknown";
}

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp (seconds) when the current window resets. */
  reset: number;
}

/**
 * Fixed-window rate limiter backed by Redis INCR/EXPIRE.
 * Reference implementation for later API routes to follow.
 */
export async function rateLimit(
  identifier: string,
  { limit, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;

  const results = await redis
    .multi()
    .incr(key)
    .ttl(key)
    .exec();

  const count = results?.[0]?.[1] as number;
  let ttl = results?.[1]?.[1] as number;

  if (ttl < 0) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }

  return {
    success: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    reset: Math.floor(Date.now() / 1000) + ttl,
  };
}
