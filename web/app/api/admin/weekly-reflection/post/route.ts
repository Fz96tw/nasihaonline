import { NextResponse } from "next/server";
import { reflectionPostNowSchema } from "@/lib/validation/weekly-reflection";
import { postReflectionNow } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/**
 * POST /api/admin/weekly-reflection/post — admin "Post now". The same function
 * as the scheduled job. Body `{}` posts if this week has no reflection yet;
 * otherwise 409 with the current thread and its reply count so the UI can ask.
 * `{override: true}` adds another thread this week; `{replace: true}` posts a
 * new one and hides the earlier one, refused (409) if members have replied to it.
 */
export async function POST(request: Request) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, reflectionPostNowSchema);
    if ("response" in body) return body.response;

    const result = await postReflectionNow(admin.id, { override: body.data.override, replace: body.data.replace });
    if (result.status === "already-posted") {
      return NextResponse.json({ error: "This week's reflection has already been posted.", ...result }, { status: 409 });
    }
    if (result.status === "replace-blocked") {
      return NextResponse.json(
        {
          error: `Members have already replied to this week's reflection (${result.replyCount}), so it can't be replaced. You can add another instead.`,
          ...result,
        },
        { status: 409 },
      );
    }
    if (result.status === "skipped") {
      return NextResponse.json({ error: "Nothing was posted.", ...result }, { status: 422 });
    }
    return NextResponse.json(result);
  });
}
