"use client";

import { useEffect, type ReactNode } from "react";

const SCROLL_THRESHOLD = 20;
const HEADER_HEIGHT_EXPANDED = "92px";
const HEADER_HEIGHT_COMPACT = "62px";

export function ScrollHeader({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const handleScroll = () => {
      root.style.setProperty(
        "--header-height",
        window.scrollY > SCROLL_THRESHOLD ? HEADER_HEIGHT_COMPACT : HEADER_HEIGHT_EXPANDED,
      );
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex h-[var(--header-height)] items-center gap-6 border-b bg-background px-4 shadow-sm transition-[height] duration-300 ease-in-out lg:px-8">
      {children}
    </header>
  );
}
