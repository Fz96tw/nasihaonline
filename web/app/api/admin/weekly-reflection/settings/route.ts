import { NextResponse } from "next/server";
import { reflectionSettingsSchema } from "@/lib/validation/weekly-reflection";
import { updateReflectionSettings } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/** PATCH /api/admin/weekly-reflection/settings — enable switch and posting day/hour (UTC). Applies on the worker's next tick. */
export async function PATCH(request: Request) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, reflectionSettingsSchema);
    if ("response" in body) return body.response;
    await updateReflectionSettings(admin.id, body.data);
    return NextResponse.json({ ok: true });
  });
}
