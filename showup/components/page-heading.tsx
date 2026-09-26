import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** A page's main heading with the Showup mark to its left, sized to the heading's own text so the two stay in proportion. */
export function PageHeading({ children, className = "text-3xl" }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`flex items-center gap-3 font-bold tracking-tight text-purple-600 ${className}`}>
      <Logo className="h-[1.3em] w-auto shrink-0" />
      {children}
    </h1>
  );
}
