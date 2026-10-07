import { NextResponse } from "next/server";
import { updateReflectionQuoteSchema } from "@/lib/validation/weekly-reflection";
import { updateReflectionQuote } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/** PATCH /api/admin/weekly-reflection/quotes/:id — edit fields and/or retire (active: false) or reactivate. No DELETE by design. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, updateReflectionQuoteSchema);
    if ("response" in body) return body.response;
    const quote = await updateReflectionQuote(admin.id, params.id, body.data);
    return NextResponse.json({ quote });
  });
}
