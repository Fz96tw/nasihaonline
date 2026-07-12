// No "server-only" guard: imported by scripts/worker.ts, which runs outside
// Next's server runtime (same reason lib/db.ts omits it).
import type { ConnectionOptions } from "bullmq";

// A plain options object (rather than an ioredis instance) so BullMQ
// constructs connections with its own bundled ioredis version internally —
// passing our top-level `ioredis` package's Redis instance here doesn't
// typecheck, since BullMQ vendors a separate (structurally incompatible)
// copy of the same library.
function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export const queueConnection: ConnectionOptions = parseRedisUrl(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);
