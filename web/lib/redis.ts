import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

// lazyConnect: without it, this constructor connects immediately on import
// — merely being pulled into a module graph (e.g. a route Next.js loads
// during `next build`'s page-data collection) was enough to spam the build
// log with reconnect-retry noise, even after fixing the one route that
// actually awaited a command at build time (see app/api/example/route.ts).
// With lazyConnect, ioredis defers the real connection until the first
// command is issued (awaited transparently — callers don't need to call
// .connect() themselves), so importing this module is inert.
export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
