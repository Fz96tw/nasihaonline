// Verification for lib/cities-server.ts (city autocomplete + lookup) and the
// Directory map's place bucketing in lib/cities.ts.
// Run with: npx tsx --conditions=react-server scripts/check-cities.ts
// (--conditions=react-server lets the "server-only" import resolve outside Next.)
import { getCityById, searchCities } from "../lib/cities-server";
import { memberLocation, memberPlace } from "../lib/cities";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}

const names = (query: string, iso2: string | null = null) => searchCities(query, iso2).map((c) => `${c.name}/${c.iso2}`);

// Search.
check("query under 2 chars returns nothing", searchCities("k").length === 0);
check("'kara' finds Karachi first", searchCities("kara")[0]?.name === "Karachi", names("kara").join(", "));
check("search ignores case", names("LONDON")[0] === "London/GB", names("LONDON").join(", "));
check("search ignores diacritics ('zurich' -> Zürich)", names("zurich").some((n) => n.startsWith("Zürich")), names("zurich").join(", "));
check("'york' finds New York via later-word match", names("york").some((n) => n === "New York City/US"), names("york").join(", "));
check("prefix matches rank before later-word matches", names("york")[0]?.startsWith("York"), names("york").join(", "));
check("country filter restricts results", names("london", "CA").every((n) => n.endsWith("/CA")) && names("london", "CA").length > 0, names("london", "CA").join(", "));
check("country filter can exclude everything", searchCities("karachi", "US").length === 0);
check("results are capped", searchCities("san").length <= 8);
check("suggestions carry a country name", searchCities("karachi")[0]?.countryName === "Pakistan");

check("territories without a country-table row still get a name", searchCities("gibraltar")[0]?.countryName === "Gibraltar", searchCities("gibraltar")[0]?.countryName);

// Lookup.
const karachi = searchCities("karachi")[0];
const resolved = getCityById(karachi?.id);
check("getCityById round-trips a suggestion", resolved?.name === "Karachi" && resolved.iso2 === "PK");
check("getCityById gives plausible coordinates", !!resolved && Math.abs(resolved.lat - 24.86) < 0.5 && Math.abs(resolved.lng - 67.01) < 0.5);
check("getCityById(null) is null", getCityById(null) === null);
check("getCityById(unknown) is null", getCityById(-1) === null);

// Map places.
const city = resolved!;
const cityPlace = memberPlace({ city, countryRegion: "Pakistan" });
check("member with a city sits on the city", cityPlace?.key === `city:${city.id}` && cityPlace.iso2 === "PK" && cityPlace.name === "Karachi, Pakistan");
check("city place uses the city's coordinates", cityPlace?.lat === city.lat && cityPlace?.lng === city.lng);
const countryPlace = memberPlace({ city: null, countryRegion: "UK" });
check("member without a city falls back to the country", countryPlace?.key === "country:GB" && countryPlace.name === "United Kingdom");
check("member with neither has no place", memberPlace({ city: null, countryRegion: null }) === null);
check("free-text 'Karachi, Pakistan' with no picked city stays at country level", memberPlace({ city: null, countryRegion: "Karachi, Pakistan" })?.key === "country:PK");
check("unrecognized country with no city has no place", memberPlace({ city: null, countryRegion: "Narnia" }) === null);
check("a city wins even when the country text is unrecognized", memberPlace({ city, countryRegion: "Narnia" })?.key === `city:${city.id}`);

// Display.
check("memberLocation joins city and country", memberLocation({ city, countryRegion: "Pakistan" }) === "Karachi, Pakistan");
check("memberLocation doesn't repeat a city already in the country text", memberLocation({ city, countryRegion: "Karachi, Pakistan" }) === "Karachi, Pakistan");
check("memberLocation with only a country", memberLocation({ city: null, countryRegion: "Pakistan" }) === "Pakistan");
check("memberLocation with only a city", memberLocation({ city, countryRegion: null }) === "Karachi");
check("memberLocation with nothing", memberLocation({ city: null, countryRegion: null }) === null);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
