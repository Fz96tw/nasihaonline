// No "server-only" guard: imported by scripts/worker.ts, which runs outside
// Next's server runtime (same reason lib/db.ts omits it).
import type { ConnectionOptions } from "bullmq";

// A plain options object (rather than an ioredis instance) so BullMQ
// constructs connections with its own bundled ioredis version internally —
// passing our top-level `ioredis` package's Redis instance here doesn't
// typecheck, since BullMQ vendors a separate (structurally incompatible)
// copy of the same library.
// lazyConnect: BullMQ's Queue constructor connects its underlying ioredis
// client immediately (RedisConnection.init() runs from the constructor),
// and merely importing a module that does `new Queue(...)` at module scope
// is enough to trigger that — including during `next build`'s page-data
// collection, which walks every route's module graph whether or not Redis
// is reachable at build time. Same fix, same reason, as lib/redis.ts.
function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  };
}

export const queueConnection: ConnectionOptions = parseRedisUrl(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);
