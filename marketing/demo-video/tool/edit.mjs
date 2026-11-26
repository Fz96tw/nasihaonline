// LinkedIn 4:5 edit with motion: per-section renders joined by xfade transitions, animated
// captions (slide-in with overshoot), zoom-punch into the meeting clip, animated title/end
// cards, and an original synthesized music bed.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import sharp from "sharp";
import { chromium } from "playwright";
const SCRATCH = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const REPO = path.resolve(SCRATCH, "../..");
const VERSION = process.env.VERSION || "v6";

const GLOBAL = Number(process.env.GLOBAL || 1.9);
const IDLE_SPEEDUP = 4;
const ZOOM = Number(process.env.ZOOM || 1.65);
const FPS = 30, OW = 1080, OH = 1350;
const RAW = path.join(SCRATCH, "raw3");
const OUT = path.join(SCRATCH, "out5");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const log = JSON.parse(fs.readFileSync(path.join(RAW, "log.json"), "utf8"));
const { w: VW, h: VH } = log.viewport;
const frames = log.frames.sort((a, b) => a.t - b.t);
const marks = log.marks.sort((a, b) => a.t - b.t);
const cursor = log.cursor.sort((a, b) => a.t - b.t);
const meta0 = await sharp(path.join(RAW, "frames", frames[0].file)).metadata();
const FW = meta0.width, FH = meta0.height, SX = FW / VW;
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

// ---------- cards & captions ----------
const fontUrl = "file://" + path.join(REPO, "web/app/fonts/montserrat-latin-variable.woff2");
const logoData = "data:image/png;base64," + fs.readFileSync(path.join(REPO, "web/public/images/nasihalogo-cropped.png")).toString("base64");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" });
const rp = await browser.newPage({ viewport: { width: OW, height: OH } });
await rp.goto(fontUrl.replace(/[^/]+$/, "")).catch(() => {});
const base = `@font-face{font-family:M;src:url(${fontUrl})}*{margin:0;box-sizing:border-box}body{font-family:M,sans-serif;width:${OW}px;height:${OH}px;background:transparent}`;
async function setHtml(html) {
  await rp.setContent(`<html><head><style>${base}</style></head><body>${html}</body></html>`);
  await rp.evaluate(() => document.fonts.ready);
}
const caps = new Map();
// Caption = tight RGBA bitmap of the pill (plus shadow room), blended manually so it can animate.
async function caption(text) {
  if (caps.has(text)) return caps.get(text);
  await setHtml(`<div id=c style="display:inline-block;padding:24px 30px 34px"><div style="width:max-content;max-width:940px;text-align:center;
     padding:20px 34px;border-radius:18px;background:rgba(15,32,77,.93);color:#fff;font-weight:700;font-size:46px;line-height:1.2;
     box-shadow:0 10px 24px rgba(0,0,0,.28);border-bottom:6px solid #60a5fa">${text}</div></div>`);
  const png = await rp.locator("#c").screenshot({ omitBackground: true });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = { data, w: info.width, h: info.height, png };
  caps.set(text, c);
  return c;
}
const cardBg = "background:radial-gradient(ellipse at 30% 15%,#2c4a9a 0%,#14275e 55%,#0b1738 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 70px;";
// Cards rendered at 2x so the zoom animation stays sharp.
const card2x = async (html, file) => {
  await rp.setViewportSize({ width: OW, height: OH });
  await setHtml(`<div style="${cardBg}width:100%;height:100%">${html}</div>`);
  const shot = await rp.screenshot({ scale: "device" });
  await sharp(shot).resize(OW * 2, OH * 2, { kernel: "lanczos3" }).png().toFile(file);
};
// Re-render cards at true 2x via a 2x-DPR page.
const rp2 = await browser.newPage({ viewport: { width: OW, height: OH }, deviceScaleFactor: 2 });
await rp2.goto(fontUrl.replace(/[^/]+$/, "")).catch(() => {});
async function cardPng(inner, file) {
  await rp2.setContent(`<html><head><style>${base}</style></head><body><div style="${cardBg}width:100%;height:100%">${inner}</div></body></html>`);
  await rp2.evaluate(() => document.fonts.ready);
  await rp2.screenshot({ path: file });
}
await cardPng(`<img src="${logoData}" style="height:200px;margin-bottom:44px;filter:drop-shadow(0 6px 20px rgba(0,0,0,.35))">
  <div style="font-size:104px;font-weight:800;letter-spacing:12px">NASIHA</div>
  <div style="font-size:30px;letter-spacing:7px;opacity:.85;margin-top:14px">KNOWLEDGE · COMMUNITY · GROWTH</div>
  <div style="font-size:50px;font-weight:600;margin-top:80px;color:#93c5fd;line-height:1.3">A quick tour of<br>nasihaforyou.org</div>`, path.join(OUT, "card_title.png"));
await cardPng(`<img src="${logoData}" style="height:130px;margin-bottom:50px">
  <div style="font-size:72px;font-weight:800;line-height:1.18">Knowledge is better when we <span style="color:#93c5fd">share what we know.</span></div>
  <div style="font-size:36px;opacity:.9;margin-top:44px;line-height:1.45">Free, reciprocal knowledge exchange. Every person who learns becomes a person who can teach.</div>
  <div style="font-size:56px;font-weight:800;margin-top:80px;padding:22px 48px;border-radius:18px;background:#2563eb">nasihaforyou.org</div>`, path.join(OUT, "card_end.png"));
const meetCapText = "Every session recorded for replay";
const meetCap = await caption(meetCapText);
fs.writeFileSync(path.join(OUT, "meetcap.png"), meetCap.png);
const ovlCap = await caption(`Present like you're in the room.<div style="font-size:34px;font-weight:600;opacity:.92;margin-top:8px">You and your slides, together on screen.</div>`);
fs.writeFileSync(path.join(OUT, "ovlcap.png"), ovlCap.png);

// ---------- time mapping ----------
const speedMarks = marks.filter((m) => m.type === "speed");
const baseSpeedAt = (t) => { let s = 1; for (const m of speedMarks) { if (m.t <= t) s = m.value; else break; } return s; };
const t0 = Math.min(frames[0].t, marks[0].t), t1 = Math.max(frames.at(-1).t, marks.at(-1).t);
function lastIdx(arr, t) { let lo = 0, hi = arr.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
const frameAt = (t) => lastIdx(frames, t);
function idleAt(t) {
  const i = frameAt(t), next = frames[i + 1], ci = lastIdx(cursor, t);
  const cursorQuiet = !cursor[ci] || t - cursor[ci].t > 0.4;
  return cursorQuiet && t - frames[i].t > 0.5 && (!next || next.t - t > 0.3);
}
// Section boundaries: the cut (speed 0) right before each caption, plus each insert mark.
const capMarks = marks.filter((m) => m.type === "caption");
const insertMarks = marks.filter((m) => m.type === "insert");
const boundaries = [];
for (const c of capMarks) {
  const z = speedMarks.filter((m) => m.value === 0 && m.t <= c.t).at(-1);
  if (z) boundaries.push({ t: z.t, kind: "section" });
}
for (const m of insertMarks) boundaries.push({ t: m.t, kind: "insert", clip: m.clip });
boundaries.sort((a, b) => a.t - b.t);
for (let i = boundaries.length - 1; i > 0; i--) if (boundaries[i].t === boundaries[i - 1].t && boundaries[i].kind === "section") boundaries.splice(i, 1);
const sectionAt = (t) => boundaries.filter((b) => b.t <= t).length;

const samples = [];
{
  let raw = t0, out = 0, sec = 0, nf = 0;
  const DT = 1 / 240;
  while (raw < t1) {
    const s0 = sectionAt(raw);
    if (s0 !== sec) { sec = s0; out = 0; nf = 0; }
    let s = baseSpeedAt(raw);
    if (s > 0) {
      s *= GLOBAL * (idleAt(raw) ? IDLE_SPEEDUP : 1);
      out += DT / s;
      while (out >= nf / FPS) { samples.push({ raw, sec, out: nf / FPS }); nf++; }
    }
    raw += DT;
  }
}

// ---------- camera (same follow-cam as edit2) ----------
const aspect = VW / VH, FULL = { x: 0, y: 0, w: VW, h: VH };
function clampRect(cx, cy, w) {
  w = Math.min(Math.max(w, VW / 2.2), VW);
  const h = w / aspect;
  return { x: Math.min(Math.max(cx - w / 2, 0), VW - w), y: Math.min(Math.max(cy - h / 2, 0), VH - h), w, h };
}
function fitRect(r) { let { x, y, w, h } = r; if (w / h > aspect) h = w / aspect; else w = h * aspect; return clampRect(x + w / 2, y + h / 2, w); }
const camMarks = marks.filter((m) => m.type === "camera");
const cursorAt = (t) => { const i = lastIdx(cursor, t); return cursor.length && cursor[i].t <= t ? cursor[i] : { x: VW / 2, y: VH / 3 }; };
let cam = { ...FULL }, camSec = -1;
function cameraFor(s) {
  const mi = camMarks.length ? lastIdx(camMarks, s.raw) : -1;
  const m = mi >= 0 && camMarks[mi].t <= s.raw ? camMarks[mi] : { rect: null, dur: 0, t: 0 };
  let target;
  if (m.rect === "follow") { const c = cursorAt(s.raw), w = VW / ZOOM; target = clampRect(c.x, c.y + (w / aspect) * 0.12, w); }
  else if (m.rect) target = fitRect(m.rect);
  else target = FULL;
  const since = (s.raw - m.t) / GLOBAL;
  if (s.sec !== camSec || (m.dur === 0 && since < 1 / FPS + 0.01)) { cam = { ...target }; camSec = s.sec; return cam; }
  const tau = m.rect === "follow" && since > m.dur ? 0.22 : Math.max(m.dur, 0.05) / 3;
  const k = 1 - Math.exp(-1 / FPS / tau);
  cam = { x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, w: cam.w + (target.w - cam.w) * k, h: cam.h + (target.h - cam.h) * k };
  return cam;
}

// ---------- animated captions ----------
const capOut = capMarks.map((m) => { const s = samples.find((x) => x.raw >= m.t); return s && { sec: s.sec, out: s.out, text: m.text, pos: m.pos || "top" }; }).filter(Boolean);
const CAP_IN = 0.42, CAP_HOLD = 2.6, CAP_OUT = 0.25, CAP_Y = 34;
const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
function captionState(s) {
  return capOut.filter((c) => c.sec === s.sec && s.out >= c.out && s.out < c.out + CAP_IN + CAP_HOLD + CAP_OUT).map((c) => {
    const t = s.out - c.out;
    let y, a;
    if (t < CAP_IN) { const k = t / CAP_IN; y = -180 + (CAP_Y + 180) * easeOutBack(k); a = Math.min(1, k * 2.5); }
    else if (t < CAP_IN + CAP_HOLD) { y = CAP_Y; a = 1; }
    else { const k = (t - CAP_IN - CAP_HOLD) / CAP_OUT; y = CAP_Y - 40 * k * k; a = 1 - k; }
    return { text: c.text, pos: c.pos, y: Math.round(y), a: Math.max(0, Math.min(1, a)) };
  });
}
function blend(dst, cap, x0, y0, alpha) {
  for (let y = 0; y < cap.h; y++) {
    const dy = y0 + y; if (dy < 0 || dy >= OH) continue;
    for (let x = 0; x < cap.w; x++) {
      const dx = x0 + x; if (dx < 0 || dx >= OW) continue;
      const si = (y * cap.w + x) * 4, a = (cap.data[si + 3] / 255) * alpha;
      if (a <= 0) continue;
      const di = (dy * OW + dx) * 4;
      dst[di] = dst[di] * (1 - a) + cap.data[si] * a;
      dst[di + 1] = dst[di + 1] * (1 - a) + cap.data[si + 1] * a;
      dst[di + 2] = dst[di + 2] * (1 - a) + cap.data[si + 2] * a;
    }
  }
}

// ---------- render sections ----------
function writer(file) {
  const p = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${OW}x${OH}`, "-r", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", file], { stdio: ["pipe", "inherit", "inherit"] });
  return { write: (b) => new Promise((r) => (p.stdin.write(b) ? r() : p.stdin.once("drain", r))), end: () => new Promise((r) => { p.on("close", r); p.stdin.end(); }) };
}
const sections = [];
let decoded = { i: -1, buf: null };
for (const sec of [...new Set(samples.map((s) => s.sec))]) {
  let ps = samples.filter((s) => s.sec === sec);
  // Drop leading not-yet-painted frames (near-uniform image) so sections never open on a blank page.
  const blankCache = new Map();
  const isBlank = async (i) => {
    if (!blankCache.has(i)) {
      const st = await sharp(path.join(RAW, "frames", frames[i].file)).resize(120).stats();
      blankCache.set(i, st.channels.slice(0, 3).every((c) => c.stdev < 18));
    }
    return blankCache.get(i);
  };
  let skip = 0;
  while (skip < ps.length && (await isBlank(frameAt(ps[skip].raw)))) skip++;
  if (skip) { ps = ps.slice(skip); console.log("  skipped", skip, "blank frames"); }
  if (ps.length < 6) continue;
  const file = path.join(OUT, `sec_${String(sec).padStart(2, "0")}.mp4`);
  const w = writer(file);
  let baseKey = "", baseBuf = null;
  for (const s of ps) {
    const i = frameAt(s.raw), c = cameraFor(s), cs = captionState(s);
    const key = `${i}|${c.x.toFixed(1)}|${c.y.toFixed(1)}|${c.w.toFixed(1)}`;
    if (key !== baseKey) {
      if (decoded.i !== i) decoded = { i, buf: fs.readFileSync(path.join(RAW, "frames", frames[i].file)) };
      const left = Math.round(c.x * SX), top = Math.round(c.y * SX);
      baseBuf = await sharp(decoded.buf).extract({ left, top, width: Math.min(FW - left, Math.round(c.w * SX)), height: Math.min(FH - top, Math.round(c.h * SX)) })
        .resize(OW, OH, { fit: "fill", kernel: "lanczos3" }).ensureAlpha().raw().toBuffer();
      baseKey = key;
    }
    let buf = baseBuf;
    for (const c of cs) {
      if (c.a <= 0) continue;
      const cap = await caption(c.text);
      if (buf === baseBuf) buf = Buffer.from(baseBuf);
      const y = c.pos === "bottom" ? OH - cap.h - c.y - 30 : c.y; // mirrored: slides up from below
      blend(buf, cap, Math.round((OW - cap.w) / 2), y, c.a);
    }
    await w.write(buf);
  }
  await w.end();
  // which boundary started the NEXT section tells us what follows this one
  const endsWithInsert = boundaries[sec] && boundaries[sec].kind === "insert";
  sections.push({ file, sec, endsWithInsert });
  console.log("section", sec, (ps.length / FPS).toFixed(1) + "s", endsWithInsert ? "-> meeting" : "");
}
await browser.close();

// ---------- meeting clip (blurred backdrop + animated caption) ----------
const MEET_SS = process.env.MEET_SS || "596", MEET_T = Number(process.env.MEET_T || 4.4);
const capX = Math.round((OW - meetCap.w) / 2);
ff("-ss", MEET_SS, "-t", String(MEET_T), "-i", path.join(SCRATCH, "recs", "board.mp4"), "-loop", "1", "-i", path.join(OUT, "meetcap.png"),
  "-filter_complex",
  `[0:v]fps=${FPS},split[a][b];[a]scale=-2:${OH},crop=${OW}:${OH},boxblur=28:2,eq=brightness=-0.14[bg];` +
  `[b]scale=${OW}:-2:flags=lanczos[fg];[bg][fg]overlay=0:(H-h)/2+30[v];` +
  `[1:v]format=rgba,fade=t=in:st=0.35:d=0.25:alpha=1[cap];` +
  `[v][cap]overlay=x=${capX}:y='if(lt(t,0.35),-200,if(lt(t,0.77),-200+(${CAP_Y}+200)*(1-pow(1-(t-0.35)/0.42,3)),${CAP_Y}))':shortest=1,format=yuv420p`,
  "-an", "-t", String(MEET_T), "-c:v", "libx264", "-crf", "16", path.join(OUT, "meeting.mp4"));

// ---------- presenter-overlay clip: the moments the presenter points at diagram boxes ----------
// Source is 1920x888 after autorotate, content area x 362..1556. Each shot pushes in (1.0 -> 1.18)
// toward the box being pointed at; hard jump cuts between shots; blurred backdrop + caption like the meeting.
const OVL_SRC = path.join(SCRATCH, "overlay", "src.mov");
const shots = [
  { ss: 0.0, t: 1.2, tx: 950, ty: 590 },   // Google Cal / Meet
  { ss: 2.2, t: 1.4, tx: 1425, ty: 590 },  // LiveKit server
  { ss: 4.6, t: 1.0, tx: 1195, ty: 593 },  // SQL / cache / search index
  { ss: 7.3, t: 0.8, tx: 1210, ty: 800 },  // Postgres
];
const OVL_T = shots.reduce((a, s) => a + s.t, 0);
const UPW = 2388, UPH = 1776, FGW = OW, FGH = Math.round((OW * 888) / 1194 / 2) * 2;
{
  const ins = shots.flatMap((s) => ["-ss", String(s.ss), "-t", String(s.t), "-i", OVL_SRC]);
  let fc = shots.map((s, i) => {
    const tx = (s.tx - 362) * 2, ty = s.ty * 2, n = Math.round(s.t * FPS);
    const z = `1+0.05*min(on/${n},1)`;
    return `[${i}:v]fps=${FPS},crop=1194:888:362:0,scale=${UPW}:${UPH}:flags=lanczos,` +
      `zoompan=z='${z}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${FGW}x${FGH}:fps=${FPS},setsar=1[o${i}]`;
  }).join(";");
  fc += `;${shots.map((_, i) => `[o${i}]`).join("")}concat=n=${shots.length}:v=1:a=0,split[a][b];` +
    `[a]scale=-2:${OH},crop=${OW}:${OH},boxblur=28:2,eq=brightness=-0.14[bg];` +
    `[bg][b]overlay=0:(H-h)/2+30[v];` +
    `[${shots.length}:v]format=rgba,fade=t=in:st=0.35:d=0.25:alpha=1[cap];` +
    `[v][cap]overlay=x=${Math.round((OW - ovlCap.w) / 2)}:y='if(lt(t,0.35),-200,if(lt(t,0.77),-200+(${CAP_Y}+200)*(1-pow(1-(t-0.35)/0.42,3)),${CAP_Y}))':shortest=1,format=yuv420p`;
  ff(...ins, "-loop", "1", "-i", path.join(OUT, "ovlcap.png"), "-filter_complex", fc,
    "-an", "-t", String(OVL_T), "-c:v", "libx264", "-crf", "16", path.join(OUT, "overlay.mp4"));
}

// ---------- animated cards ----------
// Title: logo/type settle from 1.12x -> 1.0 with ease-out. End: slow push-in 1.0 -> 1.06.
const TITLE_T = 2.3, END_T = 3.6;
ff("-loop", "1", "-i", path.join(OUT, "card_title.png"), "-vf",
  `zoompan=z='1+0.12*pow(1-min(on/(${FPS}*0.9),1),3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(TITLE_T * FPS)}:s=${OW}x${OH}:fps=${FPS},format=yuv420p`,
  "-frames:v", String(Math.round(TITLE_T * FPS)), "-c:v", "libx264", "-crf", "16", path.join(OUT, "title.mp4"));
ff("-loop", "1", "-i", path.join(OUT, "card_end.png"), "-vf",
  `zoompan=z='1+0.06*on/${Math.round(END_T * FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(END_T * FPS)}:s=${OW}x${OH}:fps=${FPS},format=yuv420p`,
  "-frames:v", String(Math.round(END_T * FPS)), "-c:v", "libx264", "-crf", "16", path.join(OUT, "end.mp4"));

// ---------- sequence + transitions ----------
const seq = [{ file: path.join(OUT, "title.mp4") }];
const trans = [];
seq.push(sections[0]); trans.push({ type: "fadeblack", d: 0.45 });
for (let i = 1; i < sections.length; i++) {
  if (sections[i - 1].endsWithInsert) {
    seq.push({ file: path.join(OUT, "meeting.mp4") }); trans.push({ type: "zoomin", d: 0.4 }); // punch into the recording
    seq.push({ file: path.join(OUT, "overlay.mp4") }); trans.push({ type: "slideleft", d: 0.3 });
    seq.push(sections[i]); trans.push({ type: "slideup", d: 0.35 });
  } else {
    seq.push(sections[i]); trans.push({ type: i % 2 ? "slideleft" : "smoothleft", d: 0.3 });
  }
}
seq.push({ file: path.join(OUT, "end.mp4") }); trans.push({ type: "fadeblack", d: 0.5 });

const lens = seq.map((s) => dur(s.file));
let chain = seq.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS},format=yuv420p,setsar=1[s${i}]`).join(";");
let acc = lens[0], prev = "s0";
for (let i = 1; i < seq.length; i++) {
  const { type, d } = trans[i - 1];
  const offset = (acc - d).toFixed(3);
  const outLbl = i === seq.length - 1 ? "vout" : `x${i}`;
  chain += `;[${prev}][s${i}]xfade=transition=${type}:duration=${d}:offset=${offset}[${outLbl}]`;
  acc = acc + lens[i] - d;
  prev = outLbl;
}
const total = acc;
console.log("timeline", seq.map((s, i) => `${path.basename(s.file)} ${lens[i].toFixed(2)}`).join(" | "), "total", total.toFixed(2));

// ---------- music ----------
const music = path.join(OUT, "music.wav");
// Pulsebox track (122 BPM): start at 24.93s so the drop (27.03) lands on the title->home cut; repeat
// 2 bars (8 beats) at a beat-grid point so the track's 66.6s breakdown still lands on the end card.
{
  const TRACK = path.join(SCRATCH, "music_in", "track.mp3");
  const START = 24.93, BEAT = 0.49156, SPLICE = 28.116 + 48 * BEAT, REP = (8 + 4 * Math.max(0, Math.round((total - 48.7) / (4 * BEAT)))) * BEAT;
  console.log("music repeat beats", Math.round(REP / BEAT));
  ff("-i", TRACK, "-filter_complex",
    `[0:a]asplit[x][y];[x]atrim=${START}:${SPLICE},asetpts=PTS-STARTPTS[a];[y]atrim=${(SPLICE - REP).toFixed(4)},asetpts=PTS-STARTPTS[b];` +
    `[a][b]acrossfade=d=0.03:c1=tri:c2=tri,atrim=0:${total.toFixed(3)},afade=t=in:d=0.25,afade=t=out:st=${(total - 2.2).toFixed(3)}:d=2.2`,
    "-ar", "48000", music);
}

const final = path.join(SCRATCH, `nasiha-demo-linkedin-${VERSION}.mp4`);
ff(...seq.flatMap((s) => ["-i", s.file]), "-i", music,
  "-filter_complex", chain + `;[${seq.length}:a]loudnorm=I=-20:TP=-3:LRA=9,aresample=48000[aout]`,
  "-map", "[vout]", "-map", "[aout]", "-t", total.toFixed(3),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final);
console.log("done", final, execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "csv=p=0", final]).toString().trim());
