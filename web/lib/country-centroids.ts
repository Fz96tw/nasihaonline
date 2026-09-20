// Client-safe country table + resolver for the Member Directory map.
//
// Profile.countryRegion is free text ("UK", "England", "Karachi, Pakistan"),
// so members can't be grouped by country until each value is normalized to an
// ISO 3166-1 alpha-2 code. The whole thing is static — no geocoding service,
// no network calls — and lat/lng are approximate country centroids, good
// enough for one marker per country on a world map.

export type Country = {
  iso2: string;
  name: string;
  lat: number;
  lng: number;
  // Extra names/abbreviations that should resolve to this country. The
  // canonical name and the ISO code always resolve without being listed here.
  aliases?: string[];
};

type CountryRow = [iso2: string, name: string, lat: number, lng: number, aliases?: string[]];

const ROWS: CountryRow[] = [
  ["AF", "Afghanistan", 33.9, 67.7],
  ["AL", "Albania", 41.15, 20.17],
  ["DZ", "Algeria", 28.03, 1.66],
  ["AD", "Andorra", 42.55, 1.6],
  ["AO", "Angola", -11.2, 17.87],
  ["AG", "Antigua and Barbuda", 17.06, -61.8, ["antigua"]],
  ["AR", "Argentina", -38.42, -63.62],
  ["AM", "Armenia", 40.07, 45.04],
  ["AU", "Australia", -25.27, 133.78],
  ["AT", "Austria", 47.52, 14.55],
  ["AZ", "Azerbaijan", 40.14, 47.58],
  ["BS", "Bahamas", 25.03, -77.4],
  ["BH", "Bahrain", 26.07, 50.56],
  ["BD", "Bangladesh", 23.68, 90.36],
  ["BB", "Barbados", 13.19, -59.54],
  ["BY", "Belarus", 53.71, 27.95],
  ["BE", "Belgium", 50.5, 4.47],
  ["BZ", "Belize", 17.19, -88.5],
  ["BJ", "Benin", 9.31, 2.32],
  ["BT", "Bhutan", 27.51, 90.43],
  ["BO", "Bolivia", -16.29, -63.59],
  ["BA", "Bosnia and Herzegovina", 43.92, 17.68, ["bosnia"]],
  ["BW", "Botswana", -22.33, 24.68],
  ["BR", "Brazil", -14.24, -51.93, ["brasil"]],
  ["BN", "Brunei", 4.54, 114.73, ["brunei darussalam"]],
  ["BG", "Bulgaria", 42.73, 25.49],
  ["BF", "Burkina Faso", 12.24, -1.56],
  ["BI", "Burundi", -3.37, 29.92],
  ["CV", "Cape Verde", 16.0, -24.01, ["cabo verde"]],
  ["KH", "Cambodia", 12.57, 104.99],
  ["CM", "Cameroon", 7.37, 12.35],
  ["CA", "Canada", 56.13, -106.35],
  ["CF", "Central African Republic", 6.61, 20.94],
  ["TD", "Chad", 15.45, 18.73],
  ["CL", "Chile", -35.68, -71.54],
  ["CN", "China", 35.86, 104.2, ["prc", "peoples republic of china", "mainland china"]],
  ["CO", "Colombia", 4.57, -74.3],
  ["KM", "Comoros", -11.88, 43.87],
  ["CG", "Republic of the Congo", -0.23, 15.83, ["congo", "congo brazzaville", "congo-brazzaville"]],
  [
    "CD",
    "Democratic Republic of the Congo",
    -4.04,
    21.76,
    ["dr congo", "drc", "dem rep congo", "congo kinshasa", "congo-kinshasa"],
  ],
  ["CR", "Costa Rica", 9.75, -83.75],
  ["CI", "Ivory Coast", 7.54, -5.55, ["cote d'ivoire", "cote divoire"]],
  ["HR", "Croatia", 45.1, 15.2],
  ["CU", "Cuba", 21.52, -77.78],
  ["CY", "Cyprus", 35.13, 33.43],
  ["CZ", "Czech Republic", 49.82, 15.47, ["czechia"]],
  ["DK", "Denmark", 56.26, 9.5],
  ["DJ", "Djibouti", 11.83, 42.59],
  ["DM", "Dominica", 15.41, -61.37],
  ["DO", "Dominican Republic", 18.74, -70.16],
  ["EC", "Ecuador", -1.83, -78.18],
  ["EG", "Egypt", 26.82, 30.8],
  ["SV", "El Salvador", 13.79, -88.9],
  ["GQ", "Equatorial Guinea", 1.65, 10.27],
  ["ER", "Eritrea", 15.18, 39.78],
  ["EE", "Estonia", 58.6, 25.01],
  ["SZ", "Eswatini", -26.52, 31.47, ["swaziland"]],
  ["ET", "Ethiopia", 9.15, 40.49],
  ["FJ", "Fiji", -17.71, 178.07],
  ["FI", "Finland", 61.92, 25.75],
  ["FR", "France", 46.23, 2.21],
  ["GA", "Gabon", -0.8, 11.61],
  ["GM", "Gambia", 13.44, -15.31],
  ["GE", "Georgia", 42.32, 43.36],
  ["DE", "Germany", 51.17, 10.45, ["deutschland"]],
  ["GH", "Ghana", 7.95, -1.02],
  ["GR", "Greece", 39.07, 21.82],
  ["GD", "Grenada", 12.12, -61.68],
  ["GT", "Guatemala", 15.78, -90.23],
  ["GN", "Guinea", 9.95, -9.7],
  ["GW", "Guinea-Bissau", 11.8, -15.18],
  ["GY", "Guyana", 4.86, -58.93],
  ["HT", "Haiti", 18.97, -72.29],
  ["HN", "Honduras", 15.2, -86.24],
  ["HU", "Hungary", 47.16, 19.5],
  ["IS", "Iceland", 64.96, -19.02],
  ["IN", "India", 20.59, 78.96],
  ["ID", "Indonesia", -0.79, 113.92],
  ["IR", "Iran", 32.43, 53.69, ["islamic republic of iran"]],
  ["IQ", "Iraq", 33.22, 43.68],
  ["IE", "Ireland", 53.41, -8.24],
  ["IL", "Israel", 31.05, 34.85],
  ["IT", "Italy", 41.87, 12.57],
  ["JM", "Jamaica", 18.11, -77.3],
  ["JP", "Japan", 36.2, 138.25],
  ["JO", "Jordan", 30.59, 36.24],
  ["KZ", "Kazakhstan", 48.02, 66.92],
  ["KE", "Kenya", -0.02, 37.91],
  ["KI", "Kiribati", 1.87, -157.36],
  ["KP", "North Korea", 40.34, 127.51, ["dprk"]],
  ["KR", "South Korea", 35.91, 127.77, ["korea", "republic of korea"]],
  ["XK", "Kosovo", 42.6, 20.9],
  ["KW", "Kuwait", 29.31, 47.48],
  ["KG", "Kyrgyzstan", 41.2, 74.77],
  ["LA", "Laos", 19.86, 102.5],
  ["LV", "Latvia", 56.88, 24.6],
  ["LB", "Lebanon", 33.85, 35.86],
  ["LS", "Lesotho", -29.61, 28.23],
  ["LR", "Liberia", 6.43, -9.43],
  ["LY", "Libya", 26.34, 17.23],
  ["LI", "Liechtenstein", 47.17, 9.56],
  ["LT", "Lithuania", 55.17, 23.88],
  ["LU", "Luxembourg", 49.82, 6.13],
  ["MG", "Madagascar", -18.77, 46.87],
  ["MW", "Malawi", -13.25, 34.3],
  ["MY", "Malaysia", 4.21, 101.98],
  ["MV", "Maldives", 3.2, 73.22],
  ["ML", "Mali", 17.57, -3.99],
  ["MT", "Malta", 35.94, 14.38],
  ["MH", "Marshall Islands", 7.13, 171.18],
  ["MR", "Mauritania", 21.01, -10.94],
  ["MU", "Mauritius", -20.35, 57.55],
  ["MX", "Mexico", 23.63, -102.55],
  ["FM", "Micronesia", 7.43, 150.55],
  ["MD", "Moldova", 47.41, 28.37],
  ["MC", "Monaco", 43.74, 7.42],
  ["MN", "Mongolia", 46.86, 103.85],
  ["ME", "Montenegro", 42.71, 19.37],
  ["MA", "Morocco", 31.79, -7.09],
  ["MZ", "Mozambique", -18.67, 35.53],
  ["MM", "Myanmar", 21.91, 95.96, ["burma"]],
  ["NA", "Namibia", -22.96, 18.49],
  ["NR", "Nauru", -0.52, 166.93],
  ["NP", "Nepal", 28.39, 84.12],
  ["NL", "Netherlands", 52.13, 5.29, ["holland"]],
  ["NZ", "New Zealand", -40.9, 174.89, ["aotearoa"]],
  ["NI", "Nicaragua", 12.87, -85.21],
  ["NE", "Niger", 17.61, 8.08],
  ["NG", "Nigeria", 9.08, 8.68],
  ["MK", "North Macedonia", 41.61, 21.75, ["macedonia"]],
  ["NO", "Norway", 60.47, 8.47],
  ["OM", "Oman", 21.51, 55.92],
  ["PK", "Pakistan", 30.38, 69.35],
  ["PW", "Palau", 7.51, 134.58],
  ["PS", "Palestine", 31.95, 35.23, ["state of palestine", "palestinian territories", "west bank", "gaza"]],
  ["PA", "Panama", 8.54, -80.78],
  ["PG", "Papua New Guinea", -6.31, 143.96],
  ["PY", "Paraguay", -23.44, -58.44],
  ["PE", "Peru", -9.19, -75.02],
  ["PH", "Philippines", 12.88, 121.77],
  ["PL", "Poland", 51.92, 19.15],
  ["PT", "Portugal", 39.4, -8.22],
  ["QA", "Qatar", 25.35, 51.18],
  ["RO", "Romania", 45.94, 24.97],
  ["RU", "Russia", 61.52, 105.32, ["russian federation"]],
  ["RW", "Rwanda", -1.94, 29.87],
  ["KN", "Saint Kitts and Nevis", 17.36, -62.78],
  ["LC", "Saint Lucia", 13.91, -60.98],
  ["VC", "Saint Vincent and the Grenadines", 12.98, -61.29],
  ["WS", "Samoa", -13.76, -172.1],
  ["SM", "San Marino", 43.94, 12.46],
  ["ST", "Sao Tome and Principe", 0.19, 6.61],
  ["SA", "Saudi Arabia", 23.89, 45.08, ["ksa", "kingdom of saudi arabia"]],
  ["SN", "Senegal", 14.5, -14.45],
  ["RS", "Serbia", 44.02, 21.01],
  ["SC", "Seychelles", -4.68, 55.49],
  ["SL", "Sierra Leone", 8.46, -11.78],
  ["SG", "Singapore", 1.35, 103.82],
  ["SK", "Slovakia", 48.67, 19.7],
  ["SI", "Slovenia", 46.15, 14.99],
  ["SB", "Solomon Islands", -9.65, 160.16],
  ["SO", "Somalia", 5.15, 46.2],
  ["ZA", "South Africa", -30.56, 22.94],
  ["SS", "South Sudan", 6.88, 31.31],
  ["ES", "Spain", 40.46, -3.75],
  ["LK", "Sri Lanka", 7.87, 80.77],
  ["SD", "Sudan", 12.86, 30.22],
  ["SR", "Suriname", 3.92, -56.03],
  ["SE", "Sweden", 60.13, 18.64],
  ["CH", "Switzerland", 46.82, 8.23],
  ["SY", "Syria", 34.8, 39.0],
  ["TW", "Taiwan", 23.7, 120.96],
  ["TJ", "Tajikistan", 38.86, 71.28],
  ["TZ", "Tanzania", -6.37, 34.89],
  ["TH", "Thailand", 15.87, 100.99],
  ["TL", "Timor-Leste", -8.87, 125.73, ["east timor"]],
  ["TG", "Togo", 8.62, 0.82],
  ["TO", "Tonga", -21.18, -175.2],
  ["TT", "Trinidad and Tobago", 10.69, -61.22, ["trinidad"]],
  ["TN", "Tunisia", 33.89, 9.54],
  ["TR", "Turkey", 38.96, 35.24, ["turkiye"]],
  ["TM", "Turkmenistan", 38.97, 59.56],
  ["TV", "Tuvalu", -7.11, 177.65],
  ["UG", "Uganda", 1.37, 32.29],
  ["UA", "Ukraine", 48.38, 31.17],
  ["AE", "United Arab Emirates", 23.42, 53.85, ["uae", "emirates", "dubai", "abu dhabi", "sharjah"]],
  [
    "GB",
    "United Kingdom",
    55.38,
    -3.44,
    ["uk", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  ],
  ["US", "United States", 37.09, -95.71, ["usa", "us", "america", "united states of america"]],
  ["UY", "Uruguay", -32.52, -55.77],
  ["UZ", "Uzbekistan", 41.38, 64.59],
  ["VU", "Vanuatu", -15.38, 166.96],
  ["VA", "Vatican City", 41.9, 12.45, ["holy see"]],
  ["VE", "Venezuela", 6.42, -66.59],
  ["VN", "Vietnam", 14.06, 108.28],
  ["YE", "Yemen", 15.55, 48.52],
  ["ZM", "Zambia", -13.13, 27.85],
  ["ZW", "Zimbabwe", -19.02, 29.15],
  // Territories/regions members are likely to list as their "country".
  ["HK", "Hong Kong", 22.32, 114.17],
  ["MO", "Macau", 22.2, 113.54, ["macao"]],
  ["PR", "Puerto Rico", 18.22, -66.59],
  ["GL", "Greenland", 71.71, -42.6],
];

export const COUNTRIES: Country[] = ROWS.map(([iso2, name, lat, lng, aliases]) => ({
  iso2,
  name,
  lat,
  lng,
  ...(aliases ? { aliases } : {}),
}));

/**
 * Lowercases, strips diacritics/periods/parentheticals, and normalizes the
 * punctuation and abbreviations that vary in free text ("St." vs "Saint",
 * "&" vs "and", "U.K." vs "UK") so names and aliases compare equal.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\./g, "")
    .replace(/&/g, " and ")
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9', ]/g, " ")
    .replace(/'/g, "")
    .replace(/\bst\b/g, "saint")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, Country>();
for (const country of COUNTRIES) {
  BY_KEY.set(normalize(country.name), country);
  BY_KEY.set(country.iso2.toLowerCase(), country);
  for (const alias of country.aliases ?? []) BY_KEY.set(normalize(alias), country);
}

const BY_ISO2 = new Map(COUNTRIES.map((country) => [country.iso2, country]));

/** Look a country up by its ISO 3166-1 alpha-2 code (e.g. for a filter chip label). */
export function getCountryByIso2(iso2: string | null | undefined): Country | null {
  return iso2 ? (BY_ISO2.get(iso2) ?? null) : null;
}

const cache = new Map<string, Country | null>();

function lookup(candidate: string): Country | null {
  // A bare two-letter ISO code is checked before normalizing, since
  // normalize() would turn "ST" (São Tomé) into "saint".
  const bare = candidate.trim().toLowerCase();
  if (bare.length === 2) {
    const byCode = BY_KEY.get(bare);
    if (byCode) return byCode;
  }

  const key = normalize(candidate);
  return key ? (BY_KEY.get(key) ?? null) : null;
}

/**
 * Resolve a free-text location ("UK", "united states of america",
 * "Karachi, Pakistan") to a country, or null when it's empty or unrecognized.
 * Tries the whole string first, then — for "City, Country" style input — the
 * last comma-separated segment. Results are memoized per raw string.
 */
export function resolveCountry(raw: string | null | undefined): Country | null {
  if (!raw) return null;
  const cached = cache.get(raw);
  if (cached !== undefined) return cached;

  let result = lookup(raw);
  if (!result && raw.includes(",")) {
    const segments = raw.split(",");
    result = lookup(segments[segments.length - 1]);
  }

  cache.set(raw, result);
  return result;
}
