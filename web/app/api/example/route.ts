import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// GET here has no dynamic-forcing API (request.headers/.ip don't count,
// unlike next/headers' cookies()/headers()), so without this Next.js treats
// it as static-optimizable and invokes it during `next build`'s page-data
// collection — before Redis is reachable, since REDIS_URL isn't passed as a
// build arg (see web/README.md's Docker redeploy notes). Same fix as
// app/api/health/route.ts.
export const dynamic = "force-dynamic";

const LIMIT = 5;
const WINDOW_SECONDS = 60;

export async function GET(request: NextRequest) {
  const identifier =
    request.headers.get("x-forwarded-for") ?? request.ip ?? "anonymous";

  const result = await rateLimit(identifier, {
    limit: LIMIT,
    windowSeconds: WINDOW_SECONDS,
  });

  const headers = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };

  if (!result.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers },
    );
  }

  return NextResponse.json({ ok: true }, { headers });
}

export async function POST(request: NextRequest) {
  const identifier =
    request.headers.get("x-forwarded-for") ?? request.ip ?? "anonymous";

  const result = await rateLimit(identifier, {
    limit: LIMIT,
    windowSeconds: WINDOW_SECONDS,
  });

  if (!result.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return NextResponse.json({ received: true });
}
