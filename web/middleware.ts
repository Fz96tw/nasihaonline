
import { NextResponse } from "next/server";
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
    pathname.startsWith("/api/members")
  );
}

function isProtectedPageRoute(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/profile")
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
export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

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

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
