/**
 * Lightweight CSRF guard for the anonymous POST routes. Showup has no sessions
 * or cookies to protect, so the double-submit token Nasiha uses would be
 * overkill; what matters is that a random third-party page can't make a
 * visitor's browser mint tokens or start rooms on their behalf. Browsers
 * always send `Origin` on cross-origin POSTs, so a mismatch is rejected.
 * A missing `Origin` (curl, server-to-server, same-origin GET-like navigations)
 * is allowed: it can't come from a cross-site browser request.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
