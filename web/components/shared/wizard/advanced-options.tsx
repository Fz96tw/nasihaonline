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
      {/* Height animates via the 0fr -> 1fr grid-row trick; children stay mounted
        either way. visibility:hidden (flipped at the end of the collapse) keeps
        collapsed fields out of the tab order and away from screen readers. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none",
          expanded ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        )}
      >
        {/* p-1/-m-1 gives focus rings room that overflow-hidden would otherwise clip. */}
        <div className="-m-1 min-h-0 overflow-hidden p-1">
          <div className="flex flex-col gap-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
