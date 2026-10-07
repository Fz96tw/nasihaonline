import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { ReflectionAdminError } from "@/lib/weekly-reflection-admin";

/**
 * Shared shell for the /api/admin/weekly-reflection routes: admin-only (a
 * moderator, member or signed-out caller gets the standard 401/403 from
 * requireRole), with ReflectionAdminError mapped to its status.
 */
export async function withAdmin(
  handler: (admin: Awaited<ReturnType<typeof requireRole>>) => Promise<NextResponse>,
  // Injectable so tests can exercise the 401/403/mapping behavior without a Clerk session.
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
    if (error instanceof ReflectionAdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** Parses a JSON body with `schema`; on failure returns the 400 response instead. */
export async function parseBody<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } },
): Promise<{ data: T } | { response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { response: NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }) };
  return { data: parsed.data };
}
