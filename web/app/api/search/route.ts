import { NextResponse, type NextRequest } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { searchAllDomains } from "@/lib/search-server";

/**
 * GET /api/search — global search (header command palette). requireUser()
 * is the real authorization boundary here, not just the UI hiding the
 * trigger for guests: every domain searchAllDomains touches requires
 * membership to view. Empty/whitespace query short-circuits to no results
 * rather than round-tripping 7 empty Meilisearch queries for nothing.
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const results = query ? await searchAllDomains(query, user) : [];

  return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
}
