// `||`, not `??` — a Docker ARG with no default (like NEXT_PUBLIC_APP_URL in
// web/Dockerfile) bakes in as an empty string when a build omits
// --build-arg/args, not undefined, so `??` alone doesn't catch it. An empty
// SITE_URL reaches `new URL(SITE_URL)` in app/layout.tsx's metadataBase,
// which throws and takes down the entire `next build` (surfaced 2026-09-13
// as an Invalid URL failure collecting /_not-found's page data, traced to
// the worker service's compose build args missing NEXT_PUBLIC_APP_URL).
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nasihaforyou.org";
export const SITE_TITLE = "NASIHA — knowledge sharing & expert networking";
export const SITE_SHORT_NAME = "NASIHA";
export const SITE_DESCRIPTION =
  "NASIHA is a member-driven community where professionals share knowledge, curate research, teach, and exchange peer feedback across many fields of expertise.";
export const BRAND_COLOR = "#2563eb";
// Same env var / default as lib/email.ts's CONTACT_EMAIL — duplicated
// rather than imported so the Organization JSON-LD builder (used from the
// root layout, a server component rendered on every request) doesn't pull
// in lib/email.ts's Resend client setup just for this constant.
export const CONTACT_EMAIL = process.env.CONTACT_INBOX_EMAIL ?? "info@nasihaforyou.org";
