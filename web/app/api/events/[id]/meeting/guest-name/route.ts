import { NextResponse } from "next/server";
import { z } from "zod";
import { EventError, setEventGuestName } from "@/lib/events-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
});

/**
 * POST /api/events/:id/meeting/guest-name?rid= — an anonymous guest answers
 * the waiting room's "What should we call you?" prompt. Public like the
 * status/token routes (the `rid` is the credential, re-validated inside
 * setEventGuestName), so IP rate limited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { success } = await rateLimit(`event-guest-name:${clientIp(request)}`, { limit: 20, windowSeconds: 60 * 60 });
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const registrationId = new URL(request.url).searchParams.get("rid");
  if (!registrationId) return NextResponse.json({ error: "Missing registration." }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter your name" }, { status: 400 });
  }

  const { id } = await params;
  try {
    await setEventGuestName(id, registrationId, parsed.data.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
