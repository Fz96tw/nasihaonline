// Per-host request pacing for the curated-articles fetch — no "@/" imports,
// so node:test can exercise it directly (lib/host-pacer.test.ts).
//
// Publishers' bot protection (e.g. Fastly/Cloudflare) can flag a burst of
// requests from one address — feed, then several article pages and images
// back to back — and block that address, which on the homelab is also the
// admins' own home connection. Spacing requests to the same host keeps the
// worker looking like an ordinary, polite client; different hosts don't
// wait on each other.

export const DEFAULT_HOST_GAP_MS = 1500;

export type HostPacer = (host: string) => Promise<void>;

export function createHostPacer(
  options: { gapMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): HostPacer {
  const gapMs = options.gapMs ?? DEFAULT_HOST_GAP_MS;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // Next moment each host may be requested again. Reserved before sleeping,
  // so concurrent callers for the same host queue up instead of all waking at once.
  const nextAllowed = new Map<string, number>();
  return async (rawHost: string) => {
    const host = rawHost.toLowerCase();
    const at = now();
    const slot = Math.max(at, nextAllowed.get(host) ?? 0);
    nextAllowed.set(host, slot + gapMs);
    if (slot > at) await sleep(slot - at);
  };
}
