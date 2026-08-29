"use client";

import { useEffect } from "react";

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const resolved = new URL(rawUrl, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith("/api");
  } catch {
    return false;
  }
}

/**
 * Every client component that calls this app's own /api routes only checks
 * `res.ok` and shows its own generic "something went wrong" message — none
 * special-case a 401 from an expired/revoked Clerk session (see lib/auth.ts
 * requireUser()). Patching window.fetch once here, instead of touching every
 * call site, catches a same-origin /api 401 from anywhere in the app and
 * hard-redirects to sign-in with a return path, mirroring what
 * middleware.ts already does for full page navigations.
 */
export function SessionExpiryGuard() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);

      if (response.status === 401 && isSameOriginApiRequest(args[0])) {
        const { pathname, search } = window.location;
        if (pathname !== "/sign-in" && pathname !== "/accept-invite") {
          const returnTo = pathname + search;
          window.location.assign(
            `/sign-in?redirect_url=${encodeURIComponent(returnTo)}&session_expired=1`,
          );
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
