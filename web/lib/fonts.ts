import { BodyFont, HeadingFont } from "@/lib/generated/prisma/enums";

/**
 * Curated, admin-selectable font set. Each entry's `variable` must match the
 * CSS variable name a next/font/google loader was given in app/layout.tsx —
 * next/font self-hosts fonts at build time, so the admin picks among a fixed
 * preloaded set rather than typing an arbitrary Google Font name.
 */
export const BODY_FONT_OPTIONS: Record<BodyFont, { label: string; variable: string }> = {
  [BodyFont.inter]: { label: "Inter", variable: "--font-inter" },
  [BodyFont.ibm_plex_sans]: { label: "IBM Plex Sans", variable: "--font-ibm-plex-sans" },
  [BodyFont.montserrat]: { label: "Montserrat", variable: "--font-montserrat" },
  [BodyFont.mulish]: { label: "Mulish", variable: "--font-mulish" },
};

export const HEADING_FONT_OPTIONS: Record<HeadingFont, { label: string; variable: string }> = {
  [HeadingFont.inter]: { label: "Inter", variable: "--font-inter" },
  [HeadingFont.lora]: { label: "Lora", variable: "--font-lora" },
  [HeadingFont.source_serif_4]: { label: "Source Serif 4", variable: "--font-source-serif-4" },
  [HeadingFont.mulish]: { label: "Mulish", variable: "--font-mulish" },
};
