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

// ---- Heading outline (SEO objective 4, 8e5162ca) ----

test("[AC:8e5162ca:ac_1] no public page has two consecutive headings with identical text", async () => {
  for (const path of ROUTES) {
    const hs = headings(await page(path));
    hs.slice(1).forEach((h, i) => {
      assert.notEqual(h.text, hs[i].text, `${path}: "${h.text}" repeated (h${hs[i].level} then h${h.level})`);
    });
  }
});

test("[AC:8e5162ca:ac_2] no public page skips a heading level", async () => {
  for (const path of ROUTES) {
    const hs = headings(await page(path));
    assert.equal(hs[0]?.level, 1, `${path}: outline should open with h1`);
    hs.slice(1).forEach((h, i) => {
      assert.ok(h.level <= hs[i].level + 1, `${path}: h${hs[i].level} "${hs[i].text}" → h${h.level} "${h.text}"`);
    });
  }
});

test("[AC:8e5162ca:ac_3] /getinvolved's Knowledge Exchange headings nest under their section", async () => {
  const hs = headings(await page("/getinvolved"));
  const at = (text) => hs.findIndex((h) => h.text.startsWith(text));
  const section = hs[at("How the Knowledge Exchange Works")];
  for (const group of ["Earn by Teaching", "Spend to Learn"]) {
    const i = at(group);
    assert.ok(i > 0, `missing "${group}"`);
    assert.equal(hs[i].level, section.level + 1, `"${group}" should sit one level under "${section.text}"`);
    // Every entry until the next heading at the group's level or above is nested one deeper.
    for (let j = i + 1; j < hs.length && hs[j].level > hs[i].level; j++) {
      assert.equal(hs[j].level, hs[i].level + 1, `"${hs[j].text}" under "${group}"`);
    }
    assert.ok(hs[i + 1]?.level === hs[i].level + 1, `"${group}" has no entries under it`);
  }
});

// ---- Image alt text (SEO/a11y objective 5, e26090d8) ----

function images(html) {
  const body = html.slice(html.indexOf("<body"));
  return [...body.matchAll(/<img\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    const attr = (name) => {
      const v = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
      return v ? decode(v[1]) : null;
    };
    const rawSrc = attr("src") ?? "";
    const src = decodeURIComponent(rawSrc.replace(/^\/_next\/image\?url=/, "").split("&")[0]);
    // Is this <img> inside an aria-hidden wrapper? Walk back to the nearest unclosed div.
    const before = body.slice(0, m.index);
    const lastHiddenOpen = before.lastIndexOf('aria-hidden="true"');
    const hiddenWrapper = lastHiddenOpen !== -1 && !/<\/div>\s*<\/div>\s*<\/div>/.test(before.slice(lastHiddenOpen));
    return { src, alt: attr("alt"), hiddenWrapper };
  });
}
const COMMUNITY_SRC = /\/images\/(Healthcare|science|business-finance|technology|education-career|humanities|arts-culture|nature-outdoor)\.jpg$/;
const GENERIC_ALT = /^(image|photo|picture|img|banner|hero|graphic|nasiha community)$/i;

test("[AC:e26090d8:ac_1] community images on / and /communities have descriptive alt text", async () => {
  for (const path of ["/", "/communities"]) {
    const community = images(await page(path)).filter((img) => COMMUNITY_SRC.test(img.src));
    assert.equal(community.length, 8, `${path}: expected 8 community images, found ${community.length}`);
    for (const img of community) {
      assert.ok(img.alt && img.alt.trim().split(/\s+/).length >= 4, `${path}: ${img.src} alt "${img.alt}" isn't descriptive`);
    }
    assert.equal(new Set(community.map((img) => img.alt)).size, 8, `${path}: community alts should be distinct`);
  }
});

test("[AC:e26090d8:ac_2] page hero images are explicitly decorative or described", async () => {
  // /join and /privacy carry no images at all.
  for (const path of ROUTES.filter((p) => p !== "/join" && p !== "/privacy")) {
    const [hero] = images(await page(path));
    assert.ok(hero, `${path}: no hero image`);
    if (hero.alt === "") assert.ok(hero.hiddenWrapper, `${path}: decorative hero ${hero.src} should sit in an aria-hidden wrapper`);
    else assert.ok(hero.alt && hero.alt.split(/\s+/).length >= 3, `${path}: hero alt "${hero.alt}"`);
  }
});

test("[AC:e26090d8:ac_3] no alt text on public pages is a filename or generic placeholder", async () => {
  for (const path of ROUTES) {
    for (const img of images(await page(path))) {
      if (img.alt === null) assert.fail(`${path}: ${img.src} has no alt attribute`);
      if (img.alt === "") continue;
      assert.ok(!GENERIC_ALT.test(img.alt.trim()), `${path}: generic alt "${img.alt}"`);
      assert.ok(!/\.(jpe?g|png|webp|gif|svg)\b/i.test(img.alt), `${path}: filename-like alt "${img.alt}"`);
      const base = img.src.split("/").pop().replace(/\.\w+$/, "").toLowerCase();
      assert.notEqual(img.alt.trim().toLowerCase(), base, `${path}: alt equals filename "${img.alt}"`);
    }
  }
});

// ── SEO objective cb64a262 ────────────────────────────────────────────────

// robots.txt Disallow lines as matchers: `*` is any run of characters and a
// trailing `$` anchors the end, as Google reads them.
async function disallowMatchers() {
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  return robots
    .split("\n")
    .filter((line) => line.startsWith("Disallow:"))
    .map((line) => line.slice("Disallow:".length).trim())
    .filter(Boolean)
    .map((rule) => {
      const anchored = rule.endsWith("$");
      const body = (anchored ? rule.slice(0, -1) : rule)
        .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return { rule, re: new RegExp(`^${body}${anchored ? "$" : ""}`) };
    });
}

test("[AC:cb64a262:ac_1] public pages' HTML has no links to robots-disallowed routes", async () => {
  const matchers = await disallowMatchers();
  assert.ok(matchers.length > 5, "robots.txt should list its Disallow rules");
  for (const path of ROUTES) {
    const html = await page(path);
    const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)]
      .map((m) => decode(m[1]))
      .map((href) => (href.startsWith(BASE) ? href.slice(BASE.length) || "/" : href))
      .filter((href) => href.startsWith("/") && !href.startsWith("//"))
      .map((href) => href.split(/[?#]/)[0]);
    const blocked = [...new Set(hrefs)].filter((href) => matchers.some(({ re }) => re.test(href)));
    assert.deepEqual(blocked, [], `${path} links to disallowed routes`);
  }
});

test("[AC:cb64a262:ac_1] /sign-in is crawlable so crawlers can see its noindex", async () => {
  const matchers = await disallowMatchers();
  assert.ok(!matchers.some(({ re }) => re.test("/sign-in")), "/sign-in must not be disallowed");
  const html = await (await fetch(`${BASE}/sign-in`)).text();
  assert.match(meta(html, "name", "robots").join(" "), /noindex/);
});

test("[AC:cb64a262:ac_2] og:url equals the canonical URL on every public page, and the sitemap agrees", async () => {
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const locs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  for (const path of ROUTES) {
    const html = await page(path);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${path}: missing canonical`);
    assert.deepEqual(meta(html, "property", "og:url"), [canonical], `${path}: og:url !== canonical`);
    assert.ok(locs.has(canonical), `${path}: sitemap has no <loc> equal to canonical ${canonical}`);
  }
});

// ── SEO objective 51c2e8d6: public event pages ───────────────────────────

let eventPagesCache;
// Every /events/<id> URL in sitemap.xml, fetched from BASE (the sitemap's
// own origin is SITE_URL, which differs from BASE on a local build).
async function eventPages() {
  if (!eventPagesCache) {
    const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((loc) => /\/events\/[^/]+$/.test(loc));
    eventPagesCache = [];
    for (const loc of locs) {
      const path = new URL(loc).pathname;
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      assert.equal(res.status, 200, `${path} (from sitemap) returned ${res.status}`);
      eventPagesCache.push({ loc, path, html: await res.text() });
    }
  }
  return eventPagesCache;
}

test("[AC:51c2e8d6:ac_1] sitemap event URLs all resolve as public pages", async () => {
  const pages = await eventPages();
  assert.ok(pages.length > 0, "expected at least one /events/<id> URL in sitemap.xml");
});

test("[AC:51c2e8d6:ac_2] event pages: unique titles, 50–160 char descriptions, canonical == sitemap URL == og:url", async () => {
  const titles = new Map();
  for (const { loc, path, html } of await eventPages()) {
    const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
    assert.ok(title.includes("NASIHA"), `${path}: title "${title}"`);
    assert.ok(!titles.has(title), `${path} and ${titles.get(title)} share the title "${title}"`);
    titles.set(title, path);
    const [description] = meta(html, "name", "description");
    assert.ok(description && description.length >= 50 && description.length <= 160, `${path}: description length ${description?.length}`);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, loc, `${path}: canonical`);
    assert.deepEqual(meta(html, "property", "og:url"), [loc], `${path}: og:url`);
  }
});

test("[AC:51c2e8d6:ac_3] event pages output Event and BreadcrumbList JSON-LD for themselves", async () => {
  for (const { loc, path, html } of await eventPages()) {
    const nodes = jsonLd(html).flat();
    const event = nodes.find((node) => node["@type"] === "Event");
    assert.ok(event, `${path}: no Event JSON-LD`);
    for (const key of ["name", "startDate", "location", "url"]) assert.ok(event[key], `${path}: Event.${key} missing`);
    assert.ok(!Number.isNaN(Date.parse(event.startDate)), `${path}: startDate`);
    assert.equal(new URL(event.url).pathname, path, `${path}: Event.url`);
    const crumbs = nodes.find((node) => node["@type"] === "BreadcrumbList");
    assert.ok(crumbs, `${path}: no BreadcrumbList`);
    assert.equal(crumbs.itemListElement.at(-1).item, loc, `${path}: breadcrumb should end at the event`);
  }
});

test("[AC:51c2e8d6:ac_4] an unknown event id is a noindexed 404", async () => {
  const res = await fetch(`${BASE}/events/no-such-event-51c2e8d6`, { redirect: "manual" });
  assert.equal(res.status, 404);
  assert.match(meta(await res.text(), "name", "robots").join(" "), /noindex/);
});
