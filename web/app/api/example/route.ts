import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

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
