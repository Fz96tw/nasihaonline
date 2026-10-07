import { NextResponse } from "next/server";
import { reflectionNextQuoteSchema } from "@/lib/validation/weekly-reflection";
import { clearNextQuoteOverride, skipNextQuote, swapNextQuote } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/** POST /api/admin/weekly-reflection/next — skip the quote that's next in line, swap in a chosen one, or clear a swap. */
export async function POST(request: Request) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, reflectionNextQuoteSchema);
    if ("response" in body) return body.response;
    if (body.data.action === "skip") {
      await skipNextQuote(admin.id);
    } else if (body.data.action === "swap") {
      await swapNextQuote(admin.id, body.data.quoteId);
    } else {
      await clearNextQuoteOverride(admin.id);
    }
    return NextResponse.json({ ok: true });
  });
}
