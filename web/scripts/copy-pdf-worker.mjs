import { copyFileSync, cpSync, mkdirSync } from "node:fs";
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

mkdirSync(path.dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("[copy-pdf-worker] copied pdf.worker.min.mjs to public/");

// The worker decodes JBig2/JPX-encoded embedded images (common in scanned
// PDFs) via these WASM binaries + JS fallbacks, fetched at runtime from the
// `wasmUrl` passed to getDocument() (see PdfPreview in resource-preview.tsx)
// — without them, decoding silently fails per-image (pdf.js treats it as
// non-fatal) and the page renders with that image simply missing.
const wasmSrc = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "wasm");
const wasmDest = path.join(__dirname, "..", "public", "pdfjs-wasm");
cpSync(wasmSrc, wasmDest, { recursive: true });
console.log("[copy-pdf-worker] copied pdfjs-dist/wasm/ to public/pdfjs-wasm/");
