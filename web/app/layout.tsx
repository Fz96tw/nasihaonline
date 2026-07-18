import type { Metadata } from "next";
import { Montserrat, Mulish } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-sans" });
const mulish = Mulish({ subsets: ["latin"], variable: "--font-heading" });

export const metadata: Metadata = {
  title: "NASIHA",
  description: "A member-driven community platform for knowledge sharing and expert networking.",
};

// ClerkProvider validates its key and resolves session state per-request,
// so the whole app is dynamically rendered rather than statically
// prerendered at build time (would otherwise fail the build whenever
// CLERK_SECRET_KEY/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY aren't real yet).
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/accept-invite">
      <html lang="en" className={cn("font-sans", montserrat.variable, mulish.variable)}>
        <body className="flex min-h-screen flex-col antialiased">
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
