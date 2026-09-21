// Client-safe city types + the Directory map's "place" bucketing. Kept apart
// from cities-server.ts (which loads the ~1.8MB GeoNames table) so client
// components can import these without pulling that data into the browser bundle.
import { getCountryByIso2, resolveCountry } from "@/lib/country-centroids";

/** A city as exposed to the client: the id is the GeoNames id stored on Profile. */
export type City = {
  id: number;
  name: string;
  iso2: string;
  lat: number;
  lng: number;
};

/** A row of the /api/cities autocomplete. */
export type CitySuggestion = {
  id: number;
  name: string;
  iso2: string;
  countryName: string;
};

/**
 * One marker on the Directory map, and the unit the map filters by. Members
 * with a city sit on that city; members with only a country stay on their
 * country's centroid, so adding cities never makes anyone disappear.
 */
export type Place = {
  /** "city:<geonameId>" or "country:<ISO2>" — the map's selection key. */
  key: string;
  iso2: string;
  name: string;
  lat: number;
  lng: number;
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

// The country table only covers sovereign states; GeoNames also has cities in
// territories (Gibraltar, Guam, Réunion…), which the runtime can still name.
export function countryNameFor(iso2: string): string {
  const known = getCountryByIso2(iso2);
  if (known) return known.name;
  try {
    return regionNames.of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

export function cityLabel(city: Pick<City, "name" | "iso2">): string {
  return `${city.name}, ${countryNameFor(city.iso2)}`;
}

/** Where a directory member belongs on the map, or null when they have no plottable location. */
export function memberPlace(member: { city: City | null; countryRegion: string | null }): Place | null {
  if (member.city) {
    const { city } = member;
    return { key: `city:${city.id}`, iso2: city.iso2, name: cityLabel(city), lat: city.lat, lng: city.lng };
  }
  const country = resolveCountry(member.countryRegion);
  if (!country) return null;
  return { key: `country:${country.iso2}`, iso2: country.iso2, name: country.name, lat: country.lat, lng: country.lng };
}

/**
 * "Karachi, Pakistan" for display. Older profiles typed the city into the
 * Country / Region box ("Karachi, Pakistan"), so a city already spelled out
 * there isn't repeated.
 */
export function memberLocation(member: { city: City | null; countryRegion: string | null }): string | null {
  const country = member.countryRegion?.trim() || null;
  const city = member.city?.name;
  if (!city || country?.toLowerCase().includes(city.toLowerCase())) return country;
  return [city, country].filter(Boolean).join(", ");
}
