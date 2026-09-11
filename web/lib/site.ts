export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nasihaforyou.org";
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
