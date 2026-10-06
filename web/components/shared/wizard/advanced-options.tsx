"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible "Advanced options" group for rarely used fields inside a wizard
 * step. Starts open when `defaultOpen` (something in it is already set), and
 * stays forced open while `hasError` so a problem inside is never hidden.
 * Children stay mounted while collapsed so their state is kept.
 */
export function AdvancedOptions({
  title = "Advanced options",
  summary,
  defaultOpen = false,
  hasError = false,
  children,
}: {
  title?: string;
  /** One-line hint of what's inside, shown next to the title while collapsed. */
  summary?: string;
  defaultOpen?: boolean;
  hasError?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = open || hasError;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className="flex items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
        {title}
        {summary && !expanded && <span className="text-xs font-normal">· {summary}</span>}
      </button>
      <div className={cn("flex-col gap-5", expanded ? "flex" : "hidden")}>{children}</div>
    </div>
  );
}
