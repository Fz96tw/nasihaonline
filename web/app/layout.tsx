import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SiteFooter } from "@/components/site-footer";
import { OverlayCleanup } from "@/components/overlay-cleanup";
import { SessionExpiryGuard } from "@/components/session-expiry-guard";
import { getSiteFonts } from "@/lib/settings";
import { BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/fonts";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { buildOrganizationJsonLd } from "@/lib/json-ld";
import { Analytics } from "@/components/analytics";

// The full curated font set is bundled here regardless of which one is
// active, so the admin's choice (SiteSettings.bodyFont/headingFont) can only
// select among these fonts. See lib/fonts.ts for the option list and CSS
// variable names.
//
// Loaded from files committed in app/fonts (next/font/local), not
// next/font/google: the Google loader downloads every family from Google
// Fonts during `next build`, and an occasional unparseable response from
// Google failed the whole build (and with it a VPS deploy). These are the
// same Latin-subset variable files Google serves; see app/fonts/README.md.
const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  adjustFontFallback: "Arial",
});
const interTight = localFont({
  src: "./fonts/inter-tight-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-inter-tight",
  adjustFontFallback: "Arial",
});
const ibmPlexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-ibm-plex-sans",
  adjustFontFallback: "Arial",
});
const montserrat = localFont({
  src: "./fonts/montserrat-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-montserrat",
  adjustFontFallback: "Arial",
});
const mulish = localFont({
  src: "./fonts/mulish-latin-variable.woff2",
  weight: "200 1000",
  variable: "--font-mulish",
  adjustFontFallback: "Arial",
});
const lora = localFont({
  src: "./fonts/lora-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-lora",
  adjustFontFallback: "Times New Roman",
});
const sourceSerif4 = localFont({
  src: "./fonts/source-serif-4-latin-variable.woff2",
  weight: "200 900",
  variable: "--font-source-serif-4",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s — NASIHA",
  },
  description: SITE_DESCRIPTION,
  applicationName: "NASIHA",
  openGraph: {
    type: "website",
    siteName: "NASIHA",
    locale: "en_US",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Backup verification method (§7) independent of the DNS TXT record
  // Search Console auto-verified through — that record's fate isn't
  // guaranteed once Google Workspace is decommissioned.
  verification: {
    google: "YuldC4Swyi-yDWg0qwoxxEmbd_UUgy6U9Z0yS4eIxfE",
  },
};

// No dynamic = "force-dynamic" here on purpose (objective 4). ClerkProvider
// itself does not force per-request rendering — verified empirically
// against a production build. What used to force it was SiteHeader's own
// getSessionUser() call (a Clerk auth(), which reads the session cookie —
// a Next.js "dynamic API" — and that bubbles up to mark the whole route
// dynamic), and SiteHeader used to render here, in the root layout, on
// every single page. It's been split instead: (member)/layout.tsx and
// app/admin/layout.tsx now render the original server-rendered SiteHeader
// directly (those routes are already dynamic for their own reasons, so
// there's nothing to lose there), while app/(marketing)/layout.tsx renders
// MarketingHeader — a client-auth counterpart (Clerk's useUser(), resolved
// in the browser after the page has already loaded as static HTML) — so
// the public marketing pages that have no other session dependency can
// actually be static/ISR. See components/marketing-header.tsx.
//
// ISR revalidation, not a one-shot static build: the static pages under
// this layout (/, /about + sub-pages, /privacy) still read from the
// database for a few things (lib/settings.ts's getSiteFonts(), plus
// HeroStats/CommunitiesSection on the homepage) — those reads fall back
// to safe defaults if the DB is unreachable, which it always is during
// `docker build` (standard build-stage isolation, no path to postgres).
// Without revalidation, that build-time fallback (empty community list,
// zero stats) would be frozen into the static HTML permanently, on every
// single deploy, since the Docker build stage never has DB access — not
// just "stale until the next deploy." Revalidating lets Next regenerate
// the page in the background on the *running* container shortly after
// each deploy, where the database genuinely is reachable, self-correcting
// without needing a rebuild.
export const revalidate = 60;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { bodyFont, headingFont } = await getSiteFonts();

  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/accept-invite">
      <html
        lang="en"
        className={cn(
          "font-sans",
          inter.variable,
          interTight.variable,
          ibmPlexSans.variable,
          montserrat.variable,
          mulish.variable,
          lora.variable,
          sourceSerif4.variable,
        )}
        style={
          {
            "--font-sans": `var(${BODY_FONT_OPTIONS[bodyFont].variable})`,
            "--font-heading": `var(${HEADING_FONT_OPTIONS[headingFont].variable})`,
          } as React.CSSProperties
        }
      >
        <body className="flex min-h-screen flex-col antialiased">
          <JsonLd data={buildOrganizationJsonLd()} />
          <Analytics />
          <OverlayCleanup />
          <SessionExpiryGuard />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
