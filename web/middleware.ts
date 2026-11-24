
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api");
}

function isWebhookRoute(pathname: string) {
  return pathname.startsWith("/api/webhooks");
}

function isProtectedApiRoute(pathname: string) {
  return (
    pathname.startsWith("/api/protected") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/profile") ||
    pathname.startsWith("/api/members") ||
    pathname.startsWith("/api/cities") ||
    pathname.startsWith("/api/contributions") ||
    pathname.startsWith("/api/inbox") ||
    pathname.startsWith("/api/notifications") ||
    pathname.startsWith("/api/session-reminders") ||
    pathname.startsWith("/api/member-live-events") ||
    pathname.startsWith("/api/quick-recordings")
  );
}

function isProtectedPageRoute(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/contributions") ||
    pathname.startsWith("/inbox") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/whats-new") ||
    pathname.startsWith("/welcome")
  );
}

/**
 * Middleware-level auth is a coarse gate only (redirect/401 on no session).
 * The authoritative check — session + Nasiha role, via requireUser()/
 * requireRole() in lib/auth.ts — happens in each route handler and
 * protected page/layout. Relying on middleware alone was the shape of a
 * disclosed Clerk bypass (GHSA-vqx2-fgx2-5wq9); this two-layer setup is the
 * defense-in-depth pattern Clerk now recommends.
 */
/**
 * True when the request was navigated to from another page on this site
 * (logo click, in-app link, client-side nav/prefetch). Compares the Referer's
 * host against the host the request came in on — behind nginx-proxy-manager
 * that's X-Forwarded-Host/Host, not request.url's internal host. A missing
 * Referer (typed URL, bookmark, privacy-stripped) counts as external.
 */
function isInternalNavigation(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}

const withClerk = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // Signed-in members arriving at the landing page from outside the site
  // (typed URL, bookmark, search result) go straight to their feed. Links
  // to "/" from inside the site still show the landing page.
  if (pathname === "/" && request.method === "GET" && !isInternalNavigation(request)) {
    const { userId } = await auth();
    if (userId) {
      return NextResponse.redirect(new URL("/whats-new", request.url));
    }
  }

  if (isApiRoute(pathname) && !isWebhookRoute(pathname)) {
    if (!SAFE_METHODS.has(request.method)) {
      const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
      const headerToken = request.headers.get(CSRF_HEADER);

      if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return NextResponse.json(
          { error: "Invalid CSRF token" },
          { status: 403 },
        );
      }
    }
  }

  if (isProtectedApiRoute(pathname)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (isProtectedPageRoute(pathname)) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      return redirectToSignIn({ returnBackUrl: request.url });
    }
  }

  const response = NextResponse.next();

  if (isApiRoute(pathname) && !isWebhookRoute(pathname)) {
    if (SAFE_METHODS.has(request.method) && !request.cookies.get(CSRF_COOKIE)) {
      response.cookies.set(CSRF_COOKIE, crypto.randomUUID(), {
        httpOnly: false,
        sameSite: "strict",
        path: "/",
      });
    }
  }

  return response;
});

// The uptime monitor and deploy-vps.sh poll /api/health. It must never go
// through Clerk: Clerk can answer a page-load-looking request (Accept:
// text/html, which UptimeRobot sends) with a 307 handshake redirect
// (reason "dev-browser-missing" on a development instance), which a monitor
// reads as "down". The route needs no session or CSRF cookie.
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
