import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// pdfjs-dist's worker (an ESM .mjs) breaks Next's webpack/Terser client
// build when bundled directly (`import.meta` outside module code) — see
// components/library/resource-preview-dialog.tsx. Serving it as a plain
// static asset under public/ sidesteps bundling entirely; this script keeps
// that copy in sync with whatever pdfjs-dist version is installed, so it
// never silently drifts after a dependency bump.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const dest = path.join(__dirname, "..", "public", "pdf.worker.min.mjs");

copyFileSync(src, dest);
console.log("[copy-pdf-worker] copied pdf.worker.min.mjs to public/");
