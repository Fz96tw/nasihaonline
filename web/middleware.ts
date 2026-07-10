import { NextRequest, NextResponse } from "next/server";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const SESSION_COOKIE = "session";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isProtectedRoute(pathname: string) {
  return pathname.startsWith("/api/protected");
}

/**
 * Placeholder session check — real auth (Clerk, per PRD §8) plugs in here
 * in the next objective without changing the surrounding middleware pattern.
 */
function hasValidSession(request: NextRequest) {
  return Boolean(request.cookies.get(SESSION_COOKIE)?.value);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  if (SAFE_METHODS.has(request.method)) {
    if (!request.cookies.get(CSRF_COOKIE)) {
      response.cookies.set(CSRF_COOKIE, crypto.randomUUID(), {
        httpOnly: false,
        sameSite: "strict",
        path: "/",
      });
    }
  } else {
    const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
    const headerToken = request.headers.get(CSRF_HEADER);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403 },
      );
    }
  }

  if (isProtectedRoute(pathname) && !hasValidSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
