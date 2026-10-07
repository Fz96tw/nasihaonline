import { NextResponse } from "next/server";
import { reflectionPostNowSchema } from "@/lib/validation/weekly-reflection";
import { postReflectionNow } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/**
 * POST /api/admin/weekly-reflection/post — admin "Post now". The same function
 * as the scheduled job. 409 when this week's thread already exists, unless the
 * body carries `override: true` (the admin confirmed posting an extra one).
 */
export async function POST(request: Request) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, reflectionPostNowSchema);
    if ("response" in body) return body.response;

    const result = await postReflectionNow(admin.id, { override: body.data.override });
    if (result.status === "already-posted") {
      return NextResponse.json(
        { error: "This week's reflection has already been posted.", ...result },
        { status: 409 },
      );
    }
    if (result.status === "skipped") {
      return NextResponse.json({ error: "Nothing was posted.", ...result }, { status: 422 });
    }
    return NextResponse.json(result);
  });
}
