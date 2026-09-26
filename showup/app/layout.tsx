import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served from Showup's own domain (no request to Google when someone visits).
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Showup",
  description: "Share your screen with anyone using just a code. Free, no account needed.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
