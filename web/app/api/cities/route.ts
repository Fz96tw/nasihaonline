import { NextResponse, type NextRequest } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { searchCities } from "@/lib/cities-server";
import { resolveCountry } from "@/lib/country-centroids";

/**
 * GET /api/cities?q=kar&country=Pakistan — autocomplete for the profile's City
 * field. `country` is the member's free-text Country / Region; when it resolves
 * to a known country the suggestions are limited to it, otherwise (blank or
 * unrecognized) every country is searched.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const country = resolveCountry(request.nextUrl.searchParams.get("country"));

  return NextResponse.json({ cities: searchCities(query, country?.iso2 ?? null) });
}
