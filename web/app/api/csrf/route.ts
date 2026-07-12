import { NextResponse } from "next/server";

/**
 * No-op GET whose only purpose is priming the double-submit csrf_token
 * cookie (set by middleware.ts on any safe-method /api request). Public
 * pages that need to make a mutating request — e.g. /join's POST
 * /api/applications — without an already-authenticated GET having primed
 * it, call this first.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
