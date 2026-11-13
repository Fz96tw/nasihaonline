import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { CuratedArticleError } from "@/lib/curated-articles-server";

/**
 * Shared shell for the /api/admin/curated-articles routes: admin-only (a
 * moderator, member or signed-out caller gets the standard 401/403 from
 * requireRole), with CuratedArticleError mapped to its status. Same shape as
 * lib/weekly-reflection-route.ts.
 */
export async function withCuratedAdmin(
  handler: (admin: Awaited<ReturnType<typeof requireRole>>) => Promise<NextResponse>,
  authorize: () => Promise<Awaited<ReturnType<typeof requireRole>>> = () => requireRole([Role.admin]),
): Promise<NextResponse> {
  let admin;
  try {
    admin = await authorize();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
  try {
    return await handler(admin);
  } catch (error) {
    if (error instanceof CuratedArticleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** Parses a JSON body with `schema`; on failure returns the 400 response instead. */
export async function parseCuratedBody<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): Promise<{ data: T } | { response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return { response: NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 }) };
  }
  return { data: parsed.data };
}
