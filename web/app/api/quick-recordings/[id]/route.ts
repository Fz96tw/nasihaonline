import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { QuickRecordingError, renameQuickRecording } from "@/lib/quick-recordings-server";

const patchSchema = z.object({ topic: z.string().trim().min(1).max(200) });

/** PATCH /api/quick-recordings/:id — creator-only rename, used by the "done" page and the dashboard list. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await renameQuickRecording(id, user.id, parsed.data.topic);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof QuickRecordingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
