// Rendered-HTML check for the public marketing pages' <head> metadata and
// /join's heading outline (SEO objectives 2 and 3). Needs a running server:
//
//   SEO_BASE_URL=http://localhost:3011 npm run test:seo
//
// Defaults to the live site, so it can also be pointed at production after
// a deploy. Static routes only — the dynamic /library and forum detail
// pages build their metadata from content (generateMetadata), not here.
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = (process.env.SEO_BASE_URL || "https://nasihaforyou.org").replace(/\/$/, "");

// Mirrors STATIC_ROUTES in app/sitemap.ts.
const ROUTES = [
  "/",
  "/about",
  "/about/research-curation",
  "/about/teaching-sharing",
  "/about/peer-review-feedback",
  "/our-team",
  "/events",
  "/communities",
  "/join",
  "/getinvolved",
  "/donate",
  "/contact",
  "/privacy",
];

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

function meta(html, attr, key) {
  const tags = html.match(/<meta\b[^>]*>/g) ?? [];
  const values = tags
    .filter((tag) => tag.includes(`${attr}="${key}"`))
    .map((tag) => decode(tag.match(/content="([^"]*)"/)?.[1] ?? ""));
  return values;
}

const pages = new Map();
async function page(path) {
  if (!pages.has(path)) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
    pages.set(path, await res.text());
  }
  return pages.get(path);
}

async function heads() {
  const out = [];
  for (const path of ROUTES) {
    const html = await page(path);
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
    assert.equal(titles.length, 1, `${path}: expected one <title>, got ${titles.length}`);
    const descriptions = meta(html, "name", "description");
    assert.equal(descriptions.length, 1, `${path}: expected one meta description`);
    out.push({ path, html, title: titles[0], description: descriptions[0] });
  }
  return out;
}

test("[AC:e58ce701:ac_1] every public sitemap page has a unique 45–60 char title with NASIHA once", async () => {
  const all = await heads();
  for (const { path, title } of all) {
    assert.ok(title.length >= 45 && title.length <= 60, `${path}: title is ${title.length} chars: ${title}`);
    assert.equal((title.match(/NASIHA/g) ?? []).length, 1, `${path}: NASIHA must appear once: ${title}`);
  }
  assert.equal(new Set(all.map((p) => p.title)).size, all.length, "titles must be unique");
});

test("[AC:e58ce701:ac_2] every public sitemap page has a unique 140–160 char meta description", async () => {
  const all = await heads();
  for (const { path, description } of all) {
    assert.ok(
      description.length >= 140 && description.length <= 160,
      `${path}: description is ${description.length} chars`,
    );
  }
  assert.equal(new Set(all.map((p) => p.description)).size, all.length, "descriptions must be unique");
});

test("[AC:e58ce701:ac_3] og:/twitter: title and description match the page values", async () => {
  for (const { path, html, title, description } of await heads()) {
    assert.deepEqual(meta(html, "property", "og:title"), [title], `${path}: og:title`);
    assert.deepEqual(meta(html, "property", "og:description"), [description], `${path}: og:description`);
    assert.deepEqual(meta(html, "name", "twitter:title"), [title], `${path}: twitter:title`);
    assert.deepEqual(meta(html, "name", "twitter:description"), [description], `${path}: twitter:description`);
  }
});

function headings(html) {
  const body = html.slice(html.indexOf("<body"));
  return [...body.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gs)].map((m) => ({
    level: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
}

test("[AC:1dcd5d79:ac_1] /join's first heading is its single H1", async () => {
  const hs = headings(await page("/join"));
  assert.ok(hs.length > 0, "no headings found");
  assert.equal(hs[0].level, 1, `first heading is h${hs[0].level} "${hs[0].text}"`);
  assert.equal(hs.filter((h) => h.level === 1).length, 1, "expected exactly one H1");
});

test("[AC:1dcd5d79:ac_2] /join's tier card titles are not headings", async () => {
  const names = ["Active Member", "Associate", "Student / Trainee", "Friend of NASIHA"];
  const texts = headings(await page("/join")).map((h) => h.text);
  for (const name of names) assert.ok(!texts.includes(name), `"${name}" is still a heading`);
});

// ---- Structured data (SEO objective 6, 352239aa) ----

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
}
const ofType = (blocks, type) => blocks.filter((b) => b["@type"] === type);

test("[AC:352239aa:ac_1] the homepage outputs a WebSite node published by the Organization", async () => {
  const blocks = jsonLd(await page("/"));
  const [site] = ofType(blocks, "WebSite");
  assert.ok(site, "no WebSite JSON-LD on /");
  assert.equal(site["@context"], "https://schema.org");
  assert.equal(site.name, "NASIHA");
  assert.match(site.url, /^https?:\/\//);
  const [org] = ofType(blocks, "Organization");
  assert.ok(org?.["@id"], "Organization needs an @id");
  assert.deepEqual(site.publisher, { "@id": org["@id"] });
  assert.equal(site.potentialAction, undefined, "no SearchAction while search is members-only");
});

test("[AC:352239aa:ac_2] Organization sameAs is either absent or a non-empty list of https URLs", async () => {
  const [org] = ofType(jsonLd(await page("/")), "Organization");
  assert.ok(org, "no Organization JSON-LD");
  if ("sameAs" in org) {
    assert.ok(Array.isArray(org.sameAs) && org.sameAs.length > 0, "sameAs must not be empty when present");
    for (const url of org.sameAs) assert.match(url, /^https:\/\//);
  }
});

const TOP_LEVEL = ROUTES.filter((path) => path !== "/");

test("[AC:352239aa:ac_3] every top-level public page has a BreadcrumbList ending at itself", async () => {
  for (const path of TOP_LEVEL) {
    const crumbs = ofType(jsonLd(await page(path)), "BreadcrumbList");
    assert.equal(crumbs.length, 1, `${path}: expected one BreadcrumbList`);
    const items = crumbs[0].itemListElement;
    assert.ok(items.length >= 2, `${path}: needs Home + page`);
    items.forEach((item, index) => {
      assert.equal(item["@type"], "ListItem", path);
      assert.equal(item.position, index + 1, path);
      assert.ok(item.name, `${path}: crumb ${index + 1} has no name`);
      assert.match(item.item, /^https?:\/\//, path);
    });
    assert.equal(new URL(items[0].item).pathname, "/", `${path}: first crumb should be Home`);
    assert.equal(new URL(items.at(-1).item).pathname, path, `${path}: last crumb should be the page`);
  }
});

test("[AC:352239aa:ac_4] /our-team has one Person per displayed team member", async () => {
  const html = await page("/our-team");
  const people = ofType(jsonLd(html), "Person");
  const [org] = ofType(jsonLd(html), "Organization");
  // TeamMemberCard renders each member's name as <div class="mb-1 text-base font-bold">.
  const body = html.slice(html.indexOf("<main"));
  const cardNames = [...body.matchAll(/<div class="mb-1 text-base font-bold">(.*?)<\/div>/gs)].map((m) => decode(m[1].trim()));
  assert.ok(cardNames.length > 0, "no team cards rendered");
  assert.deepEqual(people.map((p) => p.name), cardNames);
  for (const person of people) {
    assert.ok(person.jobTitle, `${person.name}: jobTitle`);
    assert.deepEqual(person.worksFor, { "@id": org["@id"] });
  }
});

test("[AC:352239aa:ac_5] all JSON-LD on public pages parses and carries Google's required properties", async () => {
  for (const path of ROUTES) {
    const blocks = jsonLd(await page(path));
    assert.ok(blocks.length > 0, `${path}: no JSON-LD`);
    for (const block of blocks) {
      assert.equal(block["@context"], "https://schema.org", `${path}: ${block["@type"]} @context`);
      assert.ok(block["@type"], `${path}: missing @type`);
      if (block["@type"] === "Organization") {
        assert.ok(block.name && block.url && block.logo, `${path}: Organization name/url/logo`);
      }
      if (block["@type"] === "Person") assert.ok(block.name, `${path}: Person name`);
    }
    // Every @id reference resolves to a node on the same page.
    const ids = new Set(blocks.map((b) => b["@id"]).filter(Boolean));
    const refs = JSON.stringify(blocks).match(/\{"@id":"[^"]+"\}/g) ?? [];
    for (const ref of refs) assert.ok(ids.has(JSON.parse(ref)["@id"]), `${path}: dangling ${ref}`);
  }
});
