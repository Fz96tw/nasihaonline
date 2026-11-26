// Vertical (4:5, LinkedIn feed) recording of the prod site as the admin account.
// Captures high-res frames via CDP screencast + a log of cursor positions, speed marks,
// camera intents ("follow" the cursor / full page / explicit rect), captions and inserts.
import { chromium } from "playwright";
import { clerkSetup, setupClerkTestingToken, clerk } from "@clerk/testing/playwright";
import fs from "node:fs";
import path from "node:path";
import { BASE, EMAIL, SCRATCH, NAME_TOKENS, overlayScript } from "./common.mjs";

const VW = 1080, VH = 1350, DPR = 1.6;
const RAW = path.join(SCRATCH, "raw3");
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(path.join(RAW, "frames"), { recursive: true });

await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: [`--force-device-scale-factor=${DPR}`],
});
const context = await browser.newContext({ viewport: { width: VW, height: VH } });
await context.addInitScript(overlayScript, NAME_TOKENS);
// Inbox: also blur conversation subjects/snippets (private message text), not just names.
await context.addInitScript(() => {
  const css = `li > button .truncate, li > button [class*="line-clamp"]{filter:blur(5px)!important}`;
  const apply = () => {
    if (!location.pathname.startsWith("/inbox") || document.getElementById("demo-inbox")) return;
    const s = document.createElement("style"); s.id = "demo-inbox"; s.textContent = css; document.documentElement.appendChild(s);
  };
  document.addEventListener("DOMContentLoaded", apply);
  setInterval(apply, 200);
});
const page = await context.newPage();
await page.route("**/api/events/*/recording/**", (r) => r.abort());
await setupClerkTestingToken({ page });

const log = { viewport: { w: VW, h: VH }, dpr: DPR, frames: [], marks: [], cursor: [] };
const now = () => Date.now() / 1000;
const mark = (type, data = {}) => log.marks.push({ t: now(), type, ...data });
const speed = (s) => mark("speed", { value: s });
const camera = (rect, dur = 0.6) => mark("camera", { rect, dur }); // rect | "follow" | null (full page)
const caption = (text, pos = "top") => mark("caption", { text, pos });
const sleep = (ms) => page.waitForTimeout(ms);

const cdp = await context.newCDPSession(page);
let n = 0;
cdp.on("Page.screencastFrame", async (f) => {
  const file = `f${String(n++).padStart(6, "0")}.jpg`;
  fs.writeFileSync(path.join(RAW, "frames", file), Buffer.from(f.data, "base64"));
  log.frames.push({ file, t: f.metadata.timestamp ?? now() });
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
const startCast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: Math.round(VW * DPR), maxHeight: Math.round(VH * DPR) });
async function arrive() {
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await cdp.send("Page.stopScreencast").catch(() => {});
  await startCast();
  await sleep(900);
  camera(null, 0); // establishing full-page view...
  speed(1);
  await sleep(650);
  camera("follow", 0.7); // ...then zoom in and follow the cursor
}
async function go(url) {
  speed(0);
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await arrive();
}

let cur = { x: VW / 2, y: VH / 3 };
async function moveTo(x, y, ms = 450) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...cur };
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const p = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page.mouse.move(p.x, p.y);
    log.cursor.push({ t: now(), ...p });
    await sleep(ms / steps);
  }
  cur = { x, y };
}
async function box(loc) {
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  return loc.boundingBox();
}
async function hover(loc, ms = 450) {
  const b = await box(loc);
  if (!b) return null;
  await moveTo(b.x + Math.min(b.width / 2, 160), b.y + b.height / 2, ms);
  return b;
}
async function click(loc, ms = 450) {
  const b = await hover(loc, ms);
  if (!b) return false;
  await sleep(120);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  return true;
}
async function clickNav(loc, fallbackUrl) {
  const ok = await click(loc).catch(() => false);
  await sleep(250);
  speed(0);
  if (!ok && fallbackUrl) await page.goto(BASE + fallbackUrl).catch(() => {});
  await arrive();
}
async function scroll(px, ms) {
  await page.evaluate(([px, ms]) => new Promise((res) => {
    const start = window.scrollY, t0 = performance.now();
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    (function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, start + px * ease(k));
      k < 1 ? requestAnimationFrame(step) : res();
    })(t0);
  }), [px, ms]);
}
async function typeSlow(text) { for (const ch of text) { await page.keyboard.type(ch); await sleep(80); } }
const rectOf = (b, padX = 60, padY = 60) => b && { x: b.x - padX, y: b.y - padY, w: b.width + padX * 2, h: b.height + padY * 2 };
async function step(name, fn) {
  try { await fn(); console.log("ok", name); } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); speed(1); }
}

// ================= THE TOUR =================
await page.goto(BASE + "/");
await startCast();

await step("home", async () => {
  speed(0);
  await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await cdp.send("Page.stopScreencast").catch(() => {});
  await startCast();
  await sleep(900);
  const h1 = await box(page.locator("h1").first());
  camera(rectOf(h1, 40, 120), 0);
  speed(1);
  await sleep(1700);
  camera(null, 1.0);
  await sleep(1000);
  camera("follow", 0.7);
  await hover(page.getByRole("link", { name: /get involved/i }).first());
  await sleep(500);
  camera(null, 0.6);
  await moveTo(VW * 0.5, VH * 0.2, 300);
  // scroll down to the Upcoming Events section
  const heading = page.getByRole("heading", { name: "Upcoming Events" }).first();
  const hy = await heading.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await scroll(hy - 130 - (await page.evaluate(() => window.scrollY)), 1600);
  await sleep(250);
  const car = page.locator('[aria-roledescription="carousel"]').first();
  const cb = await car.boundingBox();
  const hb = await heading.boundingBox();
  caption("Upcoming events, open to everyone");
  camera({ x: cb.x - 20, y: hb.y - 40, w: cb.width + 40, h: cb.y + cb.height + 50 - (hb.y - 40) }, 0.6);
  const next = page.getByRole("button", { name: "Next event" }).first();
  for (let i = 0; i < 3; i++) {
    await click(next, i ? 250 : 500);
    await sleep(1050);
  }
  camera(null, 0.6);
  await moveTo(VW * 0.5, VH * 0.25, 300);
  await scroll(700, 1200);
  await sleep(300);
});

// sign in off camera
speed(0);
await setupClerkTestingToken({ page });
await page.goto(BASE + "/sign-in");
await clerk.signIn({ page, emailAddress: EMAIL });

await step("nav", async () => {
  await go("/dashboard");
  caption("Everything one click away", "bottom");
  const header = page.locator("header").first();
  for (const name of ["OUR MISSION", "COMMUNITY"]) {
    const btn = header.getByRole("button", { name: new RegExp("^" + name, "i") }).first();
    await click(btn, 380);
    await sleep(500);
    const items = page.locator('[role="menu"] a, [role="menuitem"], [data-radix-popper-content-wrapper] a');
    const n = await items.count();
    for (let i = 0; i < Math.min(n, 3); i++) { await hover(items.nth(i), 220); await sleep(120); }
    await page.keyboard.press("Escape");
    await sleep(200);
  }
  await hover(header.getByRole("link", { name: /support us/i }).first(), 300);
  await sleep(200);
  for (const sel of ['a[href="/whats-new"]', 'a[href="/dashboard"]']) { await hover(header.locator(sel).first(), 260); await sleep(250); }
  await hover(header.getByRole("button", { name: /notifications/i }).first(), 260);
  await sleep(300);
});

await step("dashboard", async () => {
  camera("follow", 0.6);
  caption("Your personal dashboard");
  await hover(page.getByText("Hours balance").first());
  await sleep(400);
  await hover(page.getByText("Lifetime earned").first(), 350);
  await hover(page.getByText("Sessions contributed").first(), 350);
  await sleep(300);
  await scroll(350, 700);
  await hover(page.getByText("Record a quick video").first());
  await hover(page.getByText("Write a blog post").first(), 300);
  await hover(page.getByText("Schedule an event").first(), 300);
  await hover(page.getByText("Request a 1-1 meeting").first(), 300);
  await sleep(400);
});

await step("whats-new", async () => {
  await clickNav(page.locator('header a[href="/whats-new"]').first(), "/whats-new");
  caption("What's New: everything happening, in one feed");
  await sleep(300);
  const ftw = page.locator('[aria-label="From the Web articles"]').first();
  const fb = await box(ftw);
  if (fb) {
    camera({ x: fb.x - 30, y: fb.y - 90, w: fb.width + 60, h: fb.height + 170 }, 0.6);
    const nxt = page.getByRole("button", { name: "Next article" }).first();
    await sleep(500);
    caption("From the Web: hand-picked reads from around the internet", "bottom");
    for (let i = 0; i < 3; i++) { await click(nxt, i ? 250 : 500); await sleep(1050); }
    camera("follow", 0.6);
  }
  await hover(page.getByRole("link", { name: "All", exact: true }).first(), 300);
  camera({ x: 0, y: 0, w: VW, h: VH }, 0.5); // full width while the feed scrolls (cards are wide)
  await moveTo(VW * 0.6, VH * 0.55, 400);
  await scroll(1500, 2600);
  await scroll(1700, 2800);
  await sleep(300);
});

await step("library", async () => {
  await go("/library");
  caption("Knowledge Library: lectures, articles, case studies");
  await scroll(520, 900);
  const search = page.getByPlaceholder(/search resources/i).first();
  await click(search, 400);
  await typeSlow("health");
  await sleep(300);
  await page.keyboard.press("Enter");
  await sleep(1100);
  await scroll(420, 800);
  const card = page.locator('a[href^="/library/c"]:not([href$="/edit"])').first();
  await hover(card);
  await sleep(400);
  await clickNav(card, "/library/cmwfajmyk003g3dt4wta1wfqq");
  await moveTo(VW * 0.4, VH * 0.45, 400);
  camera(null, 0.6);
  await scroll(1000, 1800);
  await sleep(500);
});

await step("forums", async () => {
  await go("/forums");
  caption("Forums: ask, discuss, reflect");
  await scroll(600, 1000);
  const cat = page.getByText("Community Feedback").first();
  await hover(cat);
  await sleep(500);
  await clickNav(cat, "/forums/community-feedback");
  await scroll(400, 800);
  await moveTo(VW * 0.35, cur.y + 200, 500);
  await scroll(700, 1600);
  await sleep(600);
});

await step("calendar", async () => {
  await go("/calendar");
  caption("Events & calendar");
  await scroll(560, 900);
  const grid = page.getByText("November 2026").first();
  await hover(grid);
  await moveTo(VW * 0.55, cur.y + 250, 600);
  await sleep(500);
  await click(page.getByRole("tab", { name: /upcoming list/i }).first(), 400).catch(() => {});
  await sleep(1000);
});

await step("meeting", async () => {
  await go("/calendar/4538c4db-63ac-47af-8246-079e7a767deb");
  caption("Nasiha Conference: live meetings, recorded");
  await scroll(560, 900);
  const watch = page.getByText("Watch recording").first();
  await hover(watch);
  await sleep(700);
  await click(watch, 200);
  await sleep(250);
  mark("insert", { clip: "meeting" });
  speed(0);
  await sleep(300);
});

await step("members", async () => {
  await go("/members");
  caption("Member directory: find people by expertise");
  await scroll(620, 1000);
  const map = page.locator(".leaflet-container").first();
  const mb = await hover(map);
  if (mb) await moveTo(mb.x + mb.width * 0.55, mb.y + mb.height * 0.45, 600);
  await sleep(800);
  camera(null, 0.6);
  await scroll(800, 1500);
  await sleep(500);
});

await step("inbox", async () => {
  await go("/inbox");
  caption("Messages, group threads & 1:1 meetings");
  await scroll(320, 700);
  await hover(page.getByRole("button", { name: /new message/i }).first());
  await sleep(400);
  const convo = page.locator("li > button", { hasText: /group message/i }).first();
  await click(convo, 400);
  await sleep(1500);
  camera(null, 0.6);
  await sleep(900);
});

speed(0);
await sleep(300);
await cdp.send("Page.stopScreencast").catch(() => {});
await sleep(500);
fs.writeFileSync(path.join(RAW, "log.json"), JSON.stringify(log));
console.log("frames", log.frames.length, "span", (log.frames.at(-1).t - log.frames[0].t).toFixed(1));
await browser.close();
