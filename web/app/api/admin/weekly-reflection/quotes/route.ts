import { NextResponse } from "next/server";
import { createReflectionQuoteSchema } from "@/lib/validation/weekly-reflection";
import { createReflectionQuote } from "@/lib/weekly-reflection-admin";
import { parseBody, withAdmin } from "@/lib/weekly-reflection-route";

/** POST /api/admin/weekly-reflection/quotes — add a quote to the pool. */
export async function POST(request: Request) {
  return withAdmin(async (admin) => {
    const body = await parseBody(request, createReflectionQuoteSchema);
    if ("response" in body) return body.response;
    const quote = await createReflectionQuote(admin.id, body.data);
    return NextResponse.json({ quote }, { status: 201 });
  });
}
