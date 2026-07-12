import { NextResponse, type NextRequest } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getDirectoryMembers, searchDirectoryMembers } from "@/lib/members-server";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  // Empty/absent query = full browse listing (plain Postgres query, sorted
  // by name); a real query is delegated to Meilisearch (§7.2/§9) rather than
  // scanning Postgres for a text match.
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const members = query ? await searchDirectoryMembers(query) : await getDirectoryMembers();

  return NextResponse.json(
    { members },
    { headers: { "cache-control": "no-store" } },
  );
}
