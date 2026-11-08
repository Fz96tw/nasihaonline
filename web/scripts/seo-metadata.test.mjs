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
