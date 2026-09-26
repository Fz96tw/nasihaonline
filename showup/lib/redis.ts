import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

// lazyConnect: importing this module must be inert (Next.js loads route
// modules during `next build`), so the real connection waits for the first
// command. Showup's Redis is its own container, but compose can't guarantee it
// is up before the app, so the app must survive it being absent:
// - retryStrategy keeps reconnecting forever with a bounded delay, so the app
//   recovers on its own when Redis appears;
// - maxRetriesPerRequest/connectTimeout make individual commands fail fast
//   instead of hanging a request, so routes can answer "temporarily
//   unavailable" rather than time out;
// - the error listener stops ioredis's unhandled 'error' events from crashing
//   the process.
function createRedis(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });

  let lastLoggedAt = 0;
  client.on("error", (error) => {
    const now = Date.now();
    if (now - lastLoggedAt < 30_000) return;
    lastLoggedAt = now;
    console.error("[redis] connection problem:", error.message);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedis();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
