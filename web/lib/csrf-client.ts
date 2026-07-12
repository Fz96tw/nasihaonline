const CSRF_COOKIE = "csrf_token";

function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * middleware.ts sets the double-submit csrf_token cookie only on safe-method
 * (GET/HEAD/OPTIONS) /api requests, and requires it echoed back via the
 * x-csrf-token header on mutating requests. Client components call this
 * before a POST/PATCH/etc. to make sure the cookie exists (priming it via
 * GET /api/csrf if not) and get the value to send.
 */
export async function getCsrfToken(): Promise<string> {
  let token = readCsrfCookie();
  if (!token) {
    await fetch("/api/csrf");
    token = readCsrfCookie();
  }
  if (!token) throw new Error("Failed to obtain CSRF token");
  return token;
}
