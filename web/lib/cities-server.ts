import "server-only";
import rawCities from "@/lib/data/cities.json";
import { countryNameFor, type City, type CitySuggestion } from "@/lib/cities";

// lib/data/cities.json is GeoNames' cities15000 dump (CC BY 4.0), regenerated
// by scripts/build-city-data.mjs and sorted by population descending. It is
// only ever read here on the server — the browser gets autocomplete rows from
// /api/cities and never downloads the table itself.
type CityRow = [id: number, name: string, asciiName: string, iso2: string, lat: number, lng: number, population: number];

const ROWS = rawCities as unknown as CityRow[];

type IndexedCity = { row: CityRow; keys: string[] };

let byId: Map<number, CityRow> | null = null;
let index: IndexedCity[] | null = null;

/** Lowercase, diacritic-free, punctuation-free form used to match what a member types. */
function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toCity(row: CityRow): City {
  return { id: row[0], name: row[1], iso2: row[3], lat: row[4], lng: row[5] };
}

export function getCityById(id: number | null | undefined): City | null {
  if (id == null) return null;
  byId ??= new Map(ROWS.map((row) => [row[0], row]));
  const row = byId.get(id);
  return row ? toCity(row) : null;
}

/**
 * Autocomplete for the profile's City field. Matches names that start with the
 * query first, then names with a later word that does ("york" -> New York),
 * each group most-populous first, optionally limited to one country.
 */
export function searchCities(query: string, iso2: string | null = null, limit = 8): CitySuggestion[] {
  const q = searchKey(query);
  if (q.length < 2) return [];

  index ??= ROWS.map((row) => ({ row, keys: Array.from(new Set([searchKey(row[1]), searchKey(row[2] || row[1])])) }));

  const prefix: CityRow[] = [];
  const wordMatch: CityRow[] = [];
  for (const { row, keys } of index) {
    if (iso2 && row[3] !== iso2) continue;
    if (keys.some((key) => key.startsWith(q))) prefix.push(row);
    else if (keys.some((key) => key.includes(` ${q}`))) wordMatch.push(row);
    if (prefix.length >= limit) break;
  }

  return [...prefix, ...wordMatch].slice(0, limit).map((row) => ({
    id: row[0],
    name: row[1],
    iso2: row[3],
    countryName: countryNameFor(row[3]),
  }));
}
