// Regenerates lib/data/cities.json from GeoNames' cities15000 dump (cities with
// population > 15,000 — https://download.geonames.org/export/dump/, CC BY 4.0).
//
//   curl -O https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
//   node scripts/build-city-data.mjs path/to/cities15000.txt
//
// The output is a compact array of rows so the ~34k cities stay around 1.5MB:
//   [geonameId, name, asciiName ("" when identical to name), iso2, lat, lng, population]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/build-city-data.mjs <path to cities15000.txt>");
  process.exit(1);
}

const round = (value) => Math.round(Number(value) * 1000) / 1000;

const rows = readFileSync(input, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split("\t"))
  .map((cols) => [
    Number(cols[0]),
    cols[1],
    cols[2] === cols[1] ? "" : cols[2],
    cols[8],
    round(cols[4]),
    round(cols[5]),
    Number(cols[14]),
  ])
  .sort((a, b) => b[6] - a[6]);

const output = resolve(dirname(fileURLToPath(import.meta.url)), "../lib/data/cities.json");
writeFileSync(output, JSON.stringify(rows));
console.log(`Wrote ${rows.length} cities to ${output}`);
