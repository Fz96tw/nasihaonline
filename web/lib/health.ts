// Dependency checks behind GET /api/health. Kept free of db/redis imports so
// it can be unit-tested with plain node:test; the route passes the real probes.
//
// The status code is what matters: the external uptime monitor and
// scripts/deploy-vps.sh both only look at 200 vs. not-200. So a dependency
// that is down (or hangs past the timeout) must turn into a 503, never a 200
// with a `false` buried in the body.

export type DependencyStatus = "ok" | "down";

export type HealthBody = {
  ok: boolean;
  db: DependencyStatus;
  redis: DependencyStatus;
};

export type HealthProbes = {
  db: () => Promise<unknown>;
  redis: () => Promise<unknown>;
};

export const HEALTH_TIMEOUT_MS = 2000;

async function probe(run: () => Promise<unknown>, timeoutMs: number): Promise<DependencyStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DependencyStatus>((resolve) => {
    timer = setTimeout(() => resolve("down"), timeoutMs);
  });
  try {
    // Errors are reduced to "down" on purpose: connection strings, hostnames
    // and driver messages must never reach a public, unauthenticated response.
    const result = run().then(
      () => "ok" as const,
      () => "down" as const,
    );
    return await Promise.race([result, timeout]);
  } catch {
    // run() threw synchronously instead of returning a rejected promise.
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthChecks(
  probes: HealthProbes,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<{ status: 200 | 503; body: HealthBody }> {
  const [db, redis] = await Promise.all([probe(probes.db, timeoutMs), probe(probes.redis, timeoutMs)]);
  const ok = db === "ok" && redis === "ok";
  return { status: ok ? 200 : 503, body: { ok, db, redis } };
}
