import { NextResponse } from "next/server";
import { z } from "zod";
import { unsubscribeFromDigestEmails } from "@/lib/weekly-digest-email";

const bodySchema = z.object({ token: z.string().min(16).max(200) });

/**
 * POST /api/unsubscribe/digest — public (no session): the secret token in the
 * weekly-digest teaser email's unsubscribe link is the credential. Idempotent;
 * an unknown token gets a 404 and reveals nothing about any member.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const ok = await unsubscribeFromDigestEmails(parsed.data.token);
  if (!ok) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
