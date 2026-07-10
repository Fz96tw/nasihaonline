import { redis } from "@/lib/redis";

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
