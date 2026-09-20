// Verification for lib/country-centroids.ts and the directory country filter.
// Run with: npx tsx scripts/check-country-resolution.ts
import { COUNTRIES, resolveCountry } from "../lib/country-centroids";
import { useDirectoryFilters } from "../lib/stores/directory-filters";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}

const cases: [input: string | null | undefined, expected: string | null][] = [
  ["UK", "GB"],
  ["U.K.", "GB"],
  ["England", "GB"],
  ["United Kingdom", "GB"],
  ["great britain", "GB"],
  ["USA", "US"],
  ["U.S.A.", "US"],
  ["United States of America", "US"],
  ["  Pakistan  ", "PK"],
  ["PAKISTAN", "PK"],
  ["pakistan", "PK"],
  ["Nigeria", "NG"],
  ["UAE", "AE"],
  ["Côte d'Ivoire", "CI"],
  ["St. Lucia", "LC"],
  ["Bosnia & Herzegovina", "BA"],
  ["The Netherlands", "NL"],
  ["Türkiye", "TR"],
  ["Karachi, Pakistan", "PK"],
  ["Pakistan (Karachi)", "PK"],
  ["DR Congo", "CD"],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
  ["Atlantis", null],
  ["somewhere, nowhere", null],
];

for (const [input, expected] of cases) {
  const got = resolveCountry(input)?.iso2 ?? null;
  check(`resolveCountry(${JSON.stringify(input)}) -> ${expected}`, got === expected, `got ${got}`);
}

// Case/whitespace insensitivity: every variant of a name resolves identically.
const variants = ["Kenya", "kenya", "KENYA", "  kenya", "kenya  ", "\tKenya\n", "  KeNyA \t"];
check(
  "case- and whitespace-insensitive lookup",
  variants.every((value) => resolveCountry(value)?.iso2 === "KE"),
);

// Memoization returns the very same object.
check("results are memoized", resolveCountry("Pakistan") === resolveCountry("Pakistan"));

// Table integrity.
check(
  "every entry has finite lat/lng in range",
  COUNTRIES.every(
    (country) =>
      Number.isFinite(country.lat) &&
      Number.isFinite(country.lng) &&
      Math.abs(country.lat) <= 90 &&
      Math.abs(country.lng) <= 180,
  ),
);
check(
  "iso2 codes are unique two-letter uppercase",
  new Set(COUNTRIES.map((country) => country.iso2)).size === COUNTRIES.length &&
    COUNTRIES.every((country) => /^[A-Z]{2}$/.test(country.iso2)),
);
check(
  "every country resolves from its own name and iso2",
  COUNTRIES.every(
    (country) =>
      resolveCountry(country.name)?.iso2 === country.iso2 &&
      resolveCountry(country.iso2)?.iso2 === country.iso2,
  ),
  COUNTRIES.filter((country) => resolveCountry(country.name)?.iso2 !== country.iso2)
    .map((country) => country.name)
    .join(", "),
);

// Directory store.
const initial = useDirectoryFilters.getState();
check("store selectedCountry defaults to null", initial.selectedCountry === null);
initial.setSelectedCountry("PK");
check("setSelectedCountry sets the code", useDirectoryFilters.getState().selectedCountry === "PK");
useDirectoryFilters.getState().setSelectedCountry(null);
check("setSelectedCountry(null) resets", useDirectoryFilters.getState().selectedCountry === null);

console.log(`\n${COUNTRIES.length} countries in table; ${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
