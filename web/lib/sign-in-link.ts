/**
 * Builds /sign-in links that return the member to a specific page afterwards
 * (Clerk reads `redirect_url`; the sign-in page also honors it for a visitor
 * who's already signed in), and validates the value coming back in.
 */

/** Only same-site absolute paths — never `//host` or a full URL — so the param can't be used as an open redirect. */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

/** `/sign-in?redirect_url=<path>`, optionally prefixed with an origin (for emails). */
export function signInHref(path: string, origin = ""): string {
  return `${origin}/sign-in?redirect_url=${encodeURIComponent(path)}`;
}
