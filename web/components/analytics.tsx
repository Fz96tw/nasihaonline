import Script from "next/script";

// Umami Cloud (https://cloud.umami.is) — cookieless, no personal data
// collected, so no consent banner is required (see /privacy). Inert
// whenever NEXT_PUBLIC_UMAMI_WEBSITE_ID is unset, which is the case in
// dev/preview by default (§7, objective 7).
export function Analytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;

  const src = process.env.NEXT_PUBLIC_UMAMI_SRC ?? "https://cloud.umami.is/script.js";

  return <Script src={src} data-website-id={websiteId} strategy="afterInteractive" />;
}
