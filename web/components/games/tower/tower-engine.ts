/**
 * Lantern Tower — a one-tap stacking game. Mechanics (swinging crane block,
 * tip-off on a bad overlap, perfect-drop combos, swaying upper floors) follow
 * iamkun/tower_game (MIT, © 2018 BMQB, Inc), reimplemented here without its
 * engine or image assets: everything is drawn procedurally on a canvas in a
 * fixed 400×640 logical space and scaled to fit.
 */

export const LOGICAL_W = 400;
export const LOGICAL_H = 640;

const BW = 110; // block width
const BH = 64; // block height
const ROPE = 230;
const GRAVITY = 0.0028; // px / ms²
const PERFECT_TOLERANCE = BW * 0.08;
const START_LIVES = 3;

export type TowerStats = {
  score: number;
  floors: number;
  perfects: number;
  combo: number;
  lives: number;
};

export type TowerSound = "drop" | "perfect" | "miss" | "over";

export type TowerCallbacks = {
  onStats: (stats: TowerStats) => void;
  onGameOver: (stats: TowerStats) => void;
  onSound?: (sound: TowerSound) => void;
};

type Placed = { baseX: number; y: number; perfect: boolean; style: number };
type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; style: number; fade: number; grounded: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Popup = { x: number; y: number; text: string; life: number; color: string };

type Phase = "idle" | "lowering" | "swinging" | "dropping" | "over";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

// Sky palette keyframes by floor: night → dawn → bright day.
const SKY: Array<{ at: number; top: string; bottom: string }> = [
  { at: 0, top: "#070d24", bottom: "#1c2856" },
  { at: 12, top: "#1b2560", bottom: "#c0587a" },
  { at: 22, top: "#3a63c9", bottom: "#ffb36b" },
  { at: 34, top: "#2f7de1", bottom: "#bfe3ff" },
];

function skyAt(floor: number) {
  for (let i = SKY.length - 1; i >= 0; i--) {
    if (floor >= SKY[i].at) {
      const next = SKY[i + 1];
      if (!next) return { top: SKY[i].top, bottom: SKY[i].bottom };
      const t = (floor - SKY[i].at) / (next.at - SKY[i].at);
      return {
        top: mixHex(SKY[i].top, next.top, t),
        bottom: mixHex(SKY[i].bottom, next.bottom, t),
      };
    }
  }
  return { top: SKY[0].top, bottom: SKY[0].bottom };
}

// Deterministic pseudo-random so stars/skyline/clouds are stable per game.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Building = { x: number; w: number; h: number; kind: "box" | "roof" | "tall"; windows: Array<[number, number]> };

export class TowerEngine {
  private ctx: CanvasRenderingContext2D;
  private cb: TowerCallbacks;
  private raf = 0;
  private last = 0;
  private time = 0;

  private phase: Phase = "idle";
  private placed: Placed[] = [];
  private pieces: Piece[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];

  private swingPhase = 0;
  private ropeLen = 0;
  private hanging = { x: LOGICAL_W / 2, y: 0, angle: 0, style: 0 };
  private dropping = { x: 0, y: 0, vy: 0, style: 0 };
  private cameraY = 0;
  private cameraX = 0; // horizontal follow so an off-center tower stays on screen
  private shake = 0;
  private stats: TowerStats = { score: 0, floors: 0, perfects: 0, combo: 0, lives: START_LIVES };

  private stars: Array<{ x: number; y: number; r: number; tw: number }> = [];
  private skyline: Building[] = [];
  private moon: HTMLCanvasElement | null = null;

  constructor(ctx: CanvasRenderingContext2D, cb: TowerCallbacks) {
    this.ctx = ctx;
    this.cb = cb;
    const rand = rng(7);
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: rand() * LOGICAL_W, y: rand() * LOGICAL_H, r: 0.4 + rand() * 1.3, tw: rand() * Math.PI * 2 });
    }
    let x = -10;
    while (x < LOGICAL_W + 10) {
      const r = rand();
      const kind: Building["kind"] = r < 0.25 ? "tall" : r < 0.55 ? "roof" : "box";
      const w = kind === "tall" ? 22 + rand() * 14 : 34 + rand() * 40;
      const h = kind === "tall" ? 90 + rand() * 50 : 30 + rand() * 50;
      const windows: Array<[number, number]> = [];
      for (let wx = 6; wx < w - 6; wx += 10) {
        for (let wy = 8; wy < h - 6; wy += 12) if (rand() < 0.3) windows.push([wx, wy]);
      }
      this.skyline.push({ x, w, h, kind, windows });
      x += w + 2 + rand() * 8;
    }
    this.reset();
    this.draw();
  }

  reset() {
    this.placed = [{ baseX: LOGICAL_W / 2, y: -BH, perfect: false, style: 0 }];
    this.pieces = [];
    this.particles = [];
    this.popups = [];
    this.stats = { score: 0, floors: 0, perfects: 0, combo: 0, lives: START_LIVES };
    this.cameraY = this.targetCamera();
    this.cameraX = 0;
    this.swingPhase = 0;
    this.ropeLen = 0;
    this.phase = "idle";
    this.cb.onStats({ ...this.stats });
  }

  start() {
    this.reset();
    this.spawn();
    this.loop();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Player input: release the hanging block. */
  tap() {
    if (this.phase !== "swinging") return;
    const { x, y, style } = this.hangingBlock();
    this.dropping = { x, y, vy: 0, style };
    this.phase = "dropping";
  }

  /** Redraw a static frame (e.g. after a resize while not running). */
  draw() {
    this.render();
  }

  private loop = () => {
    this.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - this.last, 40);
      this.last = now;
      this.update(dt);
      this.render();
      if (this.phase !== "over" || this.particles.length || this.pieces.some((p) => p.fade > 0)) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.raf = 0;
      }
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  };

  // ── Difficulty curve ────────────────────────────────────────────────
  private amplitude() {
    return Math.min(0.32 + this.stats.floors * 0.018, 0.85);
  }
  private period() {
    return Math.max(2300 - this.stats.floors * 35, 1300);
  }
  private swayOf(index: number) {
    return clamp((index - 5) / 12, 0, 1) * 22;
  }
  private sway(index: number) {
    return this.swayOf(index) * Math.sin(this.time * 0.0016);
  }

  private top() {
    const i = this.placed.length - 1;
    const p = this.placed[i];
    return { x: p.baseX + this.sway(i), y: p.y };
  }

  private targetCamera() {
    // Keep the top surface ~62% down the screen.
    return this.top().y - LOGICAL_H * 0.62;
  }

  private pivot() {
    return { x: this.cameraX + LOGICAL_W / 2, y: this.cameraY - 40 };
  }

  private hangingBlock() {
    const p = this.pivot();
    const a = this.hanging.angle;
    const cx = p.x + Math.sin(a) * this.ropeLen;
    const ty = p.y + Math.cos(a) * this.ropeLen;
    return { x: cx, y: ty, style: this.hanging.style };
  }

  private spawn() {
    this.hanging.style = (this.placed.length + 1) % 3;
    this.ropeLen = 0;
    this.phase = "lowering";
  }

  // ── Simulation ──────────────────────────────────────────────────────
  private update(dt: number) {
    this.time += dt;
    const follow = 1 - Math.pow(0.0045, dt / 1000);
    this.cameraY = lerp(this.cameraY, this.targetCamera(), follow);
    // Only pan sideways while nothing is in flight, so the target doesn't move under a falling block.
    if (this.phase !== "dropping") this.cameraX = lerp(this.cameraX, this.placed[this.placed.length - 1].baseX - LOGICAL_W / 2, follow * 0.6);
    this.shake = Math.max(0, this.shake - dt * 0.02);

    if (this.phase === "lowering" || this.phase === "swinging") {
      this.swingPhase += (dt / this.period()) * Math.PI * 2;
      this.hanging.angle = this.amplitude() * Math.sin(this.swingPhase);
      if (this.phase === "lowering") {
        this.ropeLen = Math.min(ROPE, this.ropeLen + dt * 0.9);
        if (this.ropeLen >= ROPE) this.phase = "swinging";
      }
    }

    if (this.phase === "dropping") this.updateDrop(dt);

    for (const p of this.pieces) {
      if (p.grounded) {
        p.fade -= dt / 700;
        continue;
      }
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y + BH >= 0 && Math.abs(p.x - LOGICAL_W / 2) > BW * 0.6) {
        // Missed the tower entirely — settle on the ground and fade.
        p.y = -BH;
        p.grounded = true;
        p.rot = 0;
      } else if (p.y - this.cameraY > LOGICAL_H + 200) {
        p.fade = 0;
      }
    }
    this.pieces = this.pieces.filter((p) => p.fade > 0);

    for (const pt of this.particles) {
      pt.life -= dt;
      pt.vy += 0.0006 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const pu of this.popups) {
      pu.life -= dt;
      pu.y -= dt * 0.04;
    }
    this.popups = this.popups.filter((pu) => pu.life > 0);
  }

  private updateDrop(dt: number) {
    const d = this.dropping;
    d.vy += GRAVITY * dt;
    d.y += d.vy * dt;
    const top = this.top();
    if (d.y + BH < top.y) return;

    const offset = d.x - top.x;
    const abs = Math.abs(offset);
    if (abs >= BW) {
      // No contact: keep falling as a loose piece.
      this.pieces.push({ x: d.x, y: d.y, vx: 0, vy: d.vy, rot: 0, vr: 0, style: d.style, fade: 1, grounded: false });
      this.miss();
      return;
    }
    if (abs > BW * 0.5) {
      // Less than half supported: tips off the edge.
      const dir = Math.sign(offset);
      this.pieces.push({ x: d.x, y: top.y - BH, vx: dir * 0.12, vy: -0.05, rot: 0, vr: dir * 0.007, style: d.style, fade: 1, grounded: false });
      this.miss();
      return;
    }

    const index = this.placed.length;
    const perfect = abs <= PERFECT_TOLERANCE;
    const x = perfect ? top.x : d.x;
    this.placed.push({ baseX: x - this.sway(index), y: top.y - BH, perfect, style: d.style });

    const s = this.stats;
    s.floors += 1;
    if (perfect) {
      s.combo += 1;
      s.perfects += 1;
      const gained = 1 + s.combo;
      s.score += gained;
      this.popups.push({ x, y: top.y - BH - 10, text: s.combo > 1 ? `Perfect ×${s.combo}  +${gained}` : `Perfect  +${gained}`, life: 900, color: "#ffd66b" });
      this.burst(x, top.y, 28, ["#ffd66b", "#ffe9a8", "#ffffff"]);
      this.cb.onSound?.("perfect");
    } else {
      s.combo = 0;
      s.score += 1;
      this.burst(x, top.y, 8, ["#d9c9a3", "#efe4c8"]);
      this.cb.onSound?.("drop");
    }
    if (s.floors % 10 === 0) {
      this.popups.push({ x: LOGICAL_W / 2, y: top.y - BH - 60, text: `Floor ${s.floors}!`, life: 1400, color: "#ffffff" });
      this.burst(LOGICAL_W / 2, top.y - BH, 40, ["#93c5fd", "#ffd66b", "#ffffff"]);
    }
    this.shake = 3;
    this.cb.onStats({ ...s });
    this.spawn();
  }

  private miss() {
    const s = this.stats;
    s.lives -= 1;
    s.combo = 0;
    this.shake = 6;
    this.cb.onStats({ ...s });
    if (s.lives <= 0) {
      this.phase = "over";
      this.cb.onSound?.("over");
      window.setTimeout(() => this.cb.onGameOver({ ...s }), 700);
    } else {
      this.cb.onSound?.("miss");
      this.spawn();
    }
  }

  private burst(x: number, y: number, n: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + Math.random() * Math.PI; // upward half
      const sp = 0.05 + Math.random() * 0.22;
      const max = 500 + Math.random() * 600;
      this.particles.push({ x: x + (Math.random() - 0.5) * BW, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: colors[i % colors.length], size: 1.5 + Math.random() * 2.5 });
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────
  private render() {
    const ctx = this.ctx;
    const floor = this.stats.floors;
    const sky = skyAt(floor);
    const nightness = clamp(1 - floor / 24, 0, 1);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, LOGICAL_W + 20, LOGICAL_H + 20);

    this.drawStars(nightness);
    this.drawMoon(nightness);
    this.drawClouds(nightness);
    this.drawSkyline(nightness);

    ctx.translate(-this.cameraX, -this.cameraY);
    this.drawGround();
    this.placed.forEach((p, i) => this.drawBlock(p.baseX + this.sway(i), p.y, p.style, p.perfect, i === 0, nightness));
    for (const p of this.pieces) {
      ctx.save();
      ctx.globalAlpha = clamp(p.fade, 0, 1);
      ctx.translate(p.x, p.y + BH / 2);
      ctx.rotate(p.rot);
      this.drawBlock(0, -BH / 2, p.style, false, false, nightness);
      ctx.restore();
    }
    if (this.phase === "lowering" || this.phase === "swinging") this.drawHanging(nightness);
    if (this.phase === "dropping") this.drawBlock(this.dropping.x, this.dropping.y, this.dropping.style, false, false, nightness);

    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = "700 18px system-ui, sans-serif";
    for (const pu of this.popups) {
      ctx.globalAlpha = clamp(pu.life / 400, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillText(pu.text, pu.x + 1, pu.y + 1);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawStars(nightness: number) {
    if (nightness <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = "#ffffff";
    for (const s of this.stars) {
      const y = (((s.y - this.cameraY * 0.08) % LOGICAL_H) + LOGICAL_H) % LOGICAL_H;
      ctx.globalAlpha = nightness * (0.45 + 0.55 * Math.abs(Math.sin(this.time * 0.0012 + s.tw)));
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawMoon(nightness: number) {
    if (nightness <= 0) return;
    if (!this.moon) {
      const c = document.createElement("canvas");
      c.width = c.height = 80;
      const m = c.getContext("2d");
      if (!m) return;
      m.fillStyle = "#fff4d1";
      m.shadowColor = "#fff4d1";
      m.shadowBlur = 16;
      m.beginPath();
      m.arc(40, 40, 20, 0, Math.PI * 2);
      m.fill();
      // A few soft craters on the full moon.
      m.shadowBlur = 0;
      m.fillStyle = "rgba(214, 200, 160, 0.55)";
      for (const [x, y, r] of [[33, 34, 4.5], [46, 45, 3.5], [44, 31, 2.5], [35, 48, 2]]) {
        m.beginPath();
        m.arc(x, y, r, 0, Math.PI * 2);
        m.fill();
      }
      this.moon = c;
    }
    const ctx = this.ctx;
    ctx.globalAlpha = nightness;
    ctx.drawImage(this.moon, 300, 50 - this.cameraY * 0.02 - 250 * (1 - nightness));
    ctx.globalAlpha = 1;
  }

  private drawClouds(nightness: number) {
    // Clouds live in world space between altitude bands, with mild parallax.
    const ctx = this.ctx;
    const view = this.cameraY * 0.7;
    const band = 260;
    const first = Math.floor(view / band) - 1;
    for (let b = first; b < first + LOGICAL_H / band + 3; b++) {
      if (b > -3) continue; // none near the ground
      const rand = rng(b * 9973);
      const count = rand() < 0.6 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const cx = ((rand() * (LOGICAL_W + 160) + this.time * 0.006 * (0.5 + rand())) % (LOGICAL_W + 160)) - 80;
        const cy = b * band + rand() * band - view;
        const s = 0.7 + rand() * 0.8;
        ctx.globalAlpha = lerp(0.85, 0.18, nightness);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        for (const [dx, dy, rx, ry] of [[0, 0, 38, 14], [-22, 4, 24, 10], [24, 3, 26, 11], [4, -9, 22, 12]]) {
          ctx.moveTo(cx + (dx + rx) * s, cy + dy * s);
          ctx.ellipse(cx + dx * s, cy + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawSkyline(nightness: number) {
    const ctx = this.ctx;
    const groundScreen = -this.cameraY; // world y=0 on screen
    const initial = LOGICAL_H * 0.62 + BH;
    const base = initial + (groundScreen - initial) * 0.45 + 8;
    if (base - 160 > LOGICAL_H) return;
    ctx.fillStyle = mixHex("#101a3d", "#5a74a8", 1 - nightness);
    for (const b of this.skyline) {
      ctx.beginPath();
      ctx.rect(b.x, base - b.h, b.w, b.h);
      if (b.kind === "tall") {
        // Antenna mast.
        ctx.rect(b.x + b.w / 2 - 1, base - b.h - 18, 2, 18);
      } else if (b.kind === "roof") {
        ctx.moveTo(b.x - 2, base - b.h);
        ctx.lineTo(b.x + b.w + 2, base - b.h);
        ctx.lineTo(b.x + b.w / 2, base - b.h - b.w * 0.35);
        ctx.closePath();
      }
      ctx.fill();
    }
    if (nightness > 0) {
      ctx.fillStyle = `rgba(255, 207, 107, ${0.75 * nightness})`;
      for (const b of this.skyline) for (const [wx, wy] of b.windows) ctx.fillRect(b.x + wx, base - b.h + wy, 3, 4);
    }
  }

  private drawGround() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, "#3b4a2f");
    g.addColorStop(1, "#1d2617");
    ctx.fillStyle = g;
    ctx.fillRect(this.cameraX - 20, 0, LOGICAL_W + 40, 400);
    // Plinth under the foundation.
    ctx.fillStyle = "#cdbd98";
    ctx.fillRect(LOGICAL_W / 2 - BW * 0.75, -6, BW * 1.5, 12);
    ctx.fillStyle = "#a8996f";
    ctx.fillRect(LOGICAL_W / 2 - BW * 0.75, 4, BW * 1.5, 4);
  }

  private drawHanging(nightness: number) {
    const ctx = this.ctx;
    const p = this.pivot();
    const b = this.hangingBlock();
    ctx.strokeStyle = "rgba(220, 225, 235, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(b.x, b.y - 6);
    ctx.stroke();
    // Hook
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y - 2, 6, Math.PI * 1.1, Math.PI * 2.4);
    ctx.stroke();
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(-this.hanging.angle * 0.35);
    this.drawBlock(0, 0, b.style, false, false, nightness);
    ctx.restore();
  }

  /** (cx, y) = top-center of the block. */
  private drawBlock(cx: number, y: number, style: number, perfect: boolean, foundation: boolean, nightness: number) {
    const ctx = this.ctx;
    const x = cx - BW / 2;

    const body = ctx.createLinearGradient(x, 0, x + BW, 0);
    body.addColorStop(0, "#efe3c4");
    body.addColorStop(0.5, "#f8f0dc");
    body.addColorStop(1, "#dccb9f");
    ctx.fillStyle = body;
    ctx.fillRect(x, y, BW, BH);

    // Trim bands: brand blue, gold on perfect drops.
    const trim = perfect ? "#e7b43a" : "#2563eb";
    ctx.fillStyle = trim;
    ctx.fillRect(x, y, BW, 7);
    ctx.fillStyle = perfect ? "#c8941f" : "#1d4ed8";
    ctx.fillRect(x, y + BH - 4, BW, 4);
    // Tiny crenellation pattern on the top band.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 4; i < BW - 4; i += 10) ctx.fillRect(x + i, y + 2, 4, 3);

    // Windows: arched lanterns (style varies per floor).
    const glow = perfect ? 1 : 0.55 + 0.45 * nightness;
    const windows = foundation ? [0] : style === 1 ? [-28, 28] : style === 2 ? [-32, 0, 32] : [0];
    const ww = style === 2 ? 14 : 18;
    for (const dx of windows) {
      const wx = cx + dx;
      const top = y + 16;
      const h = BH - 28;
      ctx.save();
      ctx.shadowColor = "#ffcf6b";
      ctx.shadowBlur = 14 * glow;
      ctx.fillStyle = `rgba(255, ${Math.round(190 + 30 * glow)}, ${Math.round(90 + 40 * glow)}, ${0.55 + 0.45 * glow})`;
      ctx.beginPath();
      ctx.moveTo(wx - ww / 2, top + h);
      ctx.lineTo(wx - ww / 2, top + ww / 2);
      ctx.arc(wx, top + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww / 2, top + h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#9c8a5d";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Round medallions on single-window floors.
    if (style === 0 && !foundation) {
      for (const dx of [-36, 36]) this.drawMedallion(cx + dx, y + BH / 2 + 2, 7, perfect ? "#e7b43a" : "#3b82f6");
    }

    ctx.strokeStyle = "rgba(90, 70, 30, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, BW - 1, BH - 1);
  }

  private drawMedallion(cx: number, cy: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8f0dc";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}
