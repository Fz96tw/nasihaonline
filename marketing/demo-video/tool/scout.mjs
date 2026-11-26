import { chromium } from "playwright";
import { clerkSetup, setupClerkTestingToken, clerk } from "@clerk/testing/playwright";
import path from "node:path";
import { BASE, EMAIL, SCRATCH, NAME_TOKENS, overlayScript } from "./common.mjs";
const out = path.join(SCRATCH, "scout");
await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" });
const context = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
await context.addInitScript(overlayScript, NAME_TOKENS);
const page = await context.newPage();
await setupClerkTestingToken({ page });
await page.goto(BASE + "/sign-in");
await clerk.signIn({ page, emailAddress: EMAIL });
const checks = {
  "/dashboard": ["text=Hours balance", "text=Lifetime earned", "text=Sessions contributed", "text=Record a quick video", "text=Write a blog post", "text=Schedule an event", "text=Request a 1-1 meeting"],
  "/whats-new": ['[aria-label="From the Web articles"]', 'header a[href="/whats-new"]'],
  "/library": ["input[placeholder*='earch resources' i]", 'a[href^="/library/c"]'],
  "/forums": ["text=Community Feedback"],
  "/calendar": ["text=November 2026", "text=December 2026", "role=tab[name=/upcoming list/i]"],
  "/calendar/4538c4db-63ac-47af-8246-079e7a767deb": ["text=Watch recording"],
  "/members": [".leaflet-container"],
  "/inbox": ["role=button[name=/new message/i]", "li > button >> text=/group message/i"],
};
for (const [u, sels] of Object.entries(checks)) {
  await page.goto(BASE + u, { waitUntil: "networkidle", timeout: 45000 }).catch(() => console.log("timeout", u));
  await page.waitForTimeout(1200);
  const res = [];
  for (const s of sels) res.push(`${s}=${await page.locator(s).count()}`);
  console.log(u, "->", page.url().replace(BASE, ""), res.join("  "));
  if (u === "/dashboard") {
    const nav = await page.$$eval("header a, header button", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName}|${(e.innerText||e.getAttribute("aria-label")||"").trim().replace(/\s+/g," ").slice(0,30)}|${e.getAttribute("href")||""}|${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; }).filter(x=>!x.includes("|0,0,0x0")));
    console.log("NAV\n" + nav.join("\n"));
  }
  if (u === "/whats-new") {
    const car = page.locator('[aria-label="From the Web articles"]').first();
    if (await car.count()) {
      await car.scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollBy(0, 200));
      await page.mouse.move(5, 5);
      const bb = await car.boundingBox();
      console.log("ftw box", JSON.stringify(bb), "scrollY", await page.evaluate(() => scrollY));
      console.log("ftw controls", JSON.stringify(await page.$$eval("[aria-label]", (els) => els.map((e) => e.getAttribute("aria-label")).filter((l) => /article|slide|next|prev/i.test(l)).slice(0, 10))));
      await page.screenshot({ path: path.join(out, "whatsnew_ftw.png") });
    }
  }
  await page.screenshot({ path: path.join(out, u.replace(/\//g, "_").slice(1).slice(0, 40) + ".png") });
}
await browser.close();
