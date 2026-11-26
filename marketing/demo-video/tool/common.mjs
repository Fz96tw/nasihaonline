import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(here, ".clerk.env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

export const BASE = "https://nasihaforyou.org";
export const EMAIL = fs.readFileSync(path.join(here, ".demo-email"), "utf8").trim();
export const STATE = path.join(here, ".state.json");
export const SCRATCH = path.dirname(here);

const names = fs
  .readFileSync(path.join(SCRATCH, "names.txt"), "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

// Full names plus individual name tokens (>=3 chars) so "Hi Nadeem" is blurred too.
const tokens = new Set();
for (const n of names) {
  tokens.add(n);
  for (const t of n.split(/\s+/)) if (t.replace(/\W/g, "").length >= 3) tokens.add(t.replace(/[^\p{L}\p{N}'-]/gu, ""));
}
const EXCLUDE = new Set(["NASIHA", "Weekly", "Reflection", "T."]);
export const NAME_TOKENS = [...tokens].filter((t) => t && !EXCLUDE.has(t)).sort((a, b) => b.length - a.length);

// Injected into every page: blurs member names + avatars, draws a fake cursor with click ripples.
export function overlayScript(tokens) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(?<![\\p{L}])(" + tokens.map(esc).join("|") + ")(?![\\p{L}])", "gu");
  const BLUR = "nasiha-demo-blur";

  function blurText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest("script,style,noscript,textarea,input,." + BLUR)) return NodeFilter.FILTER_REJECT;
        re.lastIndex = 0;
        return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    for (const node of hits) {
      const frag = document.createDocumentFragment();
      let last = 0;
      const text = node.nodeValue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const s = document.createElement("span");
        s.className = BLUR;
        s.textContent = m[0];
        frag.appendChild(s);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
  }

  const css = `
    .${BLUR}{filter:blur(5px)!important;}
    img.rounded-full, [class*="rounded-full"] > img, [data-slot="avatar"], [data-slot="avatar"] *,
    span[class*="rounded-full"][class*="overflow-hidden"], img[alt*="avatar" i], img[src*="avatar" i]
      {filter:blur(6px)!important;}
    #demo-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
      transform:translate(-100px,-100px);transition:transform 0s;}
    #demo-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));}
    .demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;
      border-radius:50%;background:rgba(37,99,235,.35);border:2px solid rgba(37,99,235,.8);
      animation:demo-ripple .5s ease-out forwards;}
    @keyframes demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
    html{scroll-behavior:auto!important;}
  `;

  function install() {
    if (document.getElementById("demo-style")) return;
    const st = document.createElement("style");
    st.id = "demo-style";
    st.textContent = css;
    document.documentElement.appendChild(st);
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 10.5-7 1.3 4 7.7-3 1.5-4-7.8L4 20z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const pos = window.__demoPos || { x: -100, y: -100 };
    c.style.transform = `translate(${pos.x}px,${pos.y}px)`;
    window.addEventListener("mousemove", (e) => {
      window.__demoPos = { x: e.clientX, y: e.clientY };
      c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`;
    }, true);
    window.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "demo-ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    blurText(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !n.classList?.contains(BLUR)) blurText(n);
        else if (n.nodeType === 3 && n.parentElement) blurText(n.parentElement);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: false });
  }
  if (document.body) install();
  else document.addEventListener("DOMContentLoaded", install);
}
