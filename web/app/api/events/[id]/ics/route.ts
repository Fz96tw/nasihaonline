import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEventIcs } from "@/lib/events-server";

/**
 * GET /api/events/:id/ics — "Add to calendar" export (§4.6). Public (no
 * requireUser) so an open event's .ics can be downloaded from /events by a
 * signed-out visitor too; meetingUrl is only ever included in the body for
 * a signed-in viewer who's RSVP'd `going` — same gate as /calendar and the
 * public /events listing.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();

  const result = await getEventIcs(id, user?.id ?? null);
  if (!result) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const filename = `${result.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`;

  return new NextResponse(result.ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
