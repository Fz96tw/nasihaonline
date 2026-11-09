// Mobile readability check for the public marketing pages (SEO objective
// cb64a262), measured in a real browser at a 375px viewport:
//
//   SEO_BASE_URL=http://localhost:3011 npm run test:seo:mobile
//
// Needs a Chromium. Uses playwright-core's own download if one is installed
// (`npx playwright-core install chromium`), or set CHROMIUM_PATH to any
// Chrome/Chromium binary. Defaults to the live site, like test:seo.
//
// What counts as body text:
// - Any visible text of 4+ words is at least 14px. Shorter runs, and
//   all-caps eyebrow labels, are labels (badges, eyebrows, buttons) and are
//   left to the design system.
// - A paragraph or list item inside <main> with 12+ words is at least 16px.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

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

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
after(() => browser.close());

async function measure(path) {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    return await page.evaluate(() => {
      const words = (text) => text.split(/\s+/).filter(Boolean).length;
      const visible = (el) => {
        if (el.closest("script,style,noscript,[aria-hidden='true'],.sr-only")) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const tooSmall = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        const text = node.textContent.trim();
        if (!el || words(text) < 4 || !visible(el)) continue;
        const style = getComputedStyle(el);
        if (style.textTransform === "uppercase") continue;
        const size = parseFloat(style.fontSize);
        if (size < 14) tooSmall.push(`${size}px "${text.slice(0, 60)}"`);
      }
      const smallParagraphs = [];
      for (const el of document.querySelectorAll("main p, main li")) {
        const text = el.textContent.trim();
        if (words(text) < 12 || !visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 16) smallParagraphs.push(`${size}px "${text.slice(0, 60)}"`);
      }
      return { tooSmall, smallParagraphs };
    });
  } finally {
    await page.close();
  }
}

const results = new Map();
async function measured(path) {
  if (!results.has(path)) results.set(path, await measure(path));
  return results.get(path);
}

test("[AC:cb64a262:ac_3] at 375px no body text on a public page is below 14px", async () => {
  for (const path of ROUTES) {
    assert.deepEqual((await measured(path)).tooSmall, [], `${path} has text under 14px`);
  }
});

test("[AC:cb64a262:ac_3] at 375px body paragraphs on public pages are at least 16px", async () => {
  for (const path of ROUTES) {
    assert.deepEqual((await measured(path)).smallParagraphs, [], `${path} has paragraphs under 16px`);
  }
});
