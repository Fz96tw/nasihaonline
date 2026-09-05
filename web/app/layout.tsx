import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, IBM_Plex_Sans, Montserrat, Mulish, Lora, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SiteHeader, SiteHeaderSkeleton } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OverlayCleanup } from "@/components/overlay-cleanup";
import { SessionExpiryGuard } from "@/components/session-expiry-guard";
import { getSiteFonts } from "@/lib/settings";
import { BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/fonts";

// The full curated font set is preloaded here regardless of which one is
// active — next/font/google self-hosts fonts at build time, so the admin's
// choice (SiteSettings.bodyFont/headingFont) can only select among fonts
// already bundled, not load an arbitrary Google Font at runtime. See
// lib/fonts.ts for the option list and CSS variable names.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const mulish = Mulish({ subsets: ["latin"], variable: "--font-mulish" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });
const sourceSerif4 = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif-4" });

export const metadata: Metadata = {
  title: "NASIHA",
  description: "A member-driven community platform for knowledge sharing and expert networking.",
};

// ClerkProvider validates its key and resolves session state per-request,
// so the whole app is dynamically rendered rather than statically
// prerendered at build time (would otherwise fail the build whenever
// CLERK_SECRET_KEY/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY aren't real yet).
export const dynamic = "force-dynamic";

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
          <OverlayCleanup />
          <SessionExpiryGuard />
          <Suspense fallback={<SiteHeaderSkeleton />}>
            <SiteHeader />
          </Suspense>
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
