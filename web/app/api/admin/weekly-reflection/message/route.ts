import { NextResponse } from "next/server";
import { reflectionMessageSchema } from "@/lib/validation/weekly-reflection";
import { updateReflectionMessage } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/** PATCH /api/admin/weekly-reflection/message — the title and body templates of the weekly post (future posts only). */
export async function PATCH(request: Request) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, reflectionMessageSchema);
    if ("response" in body) return body.response;
    await updateReflectionMessage(admin.id, body.data);
    return NextResponse.json({ ok: true });
  });
}
