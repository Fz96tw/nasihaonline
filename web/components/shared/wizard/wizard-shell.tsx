"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WizardStatus = "not_started" | "incomplete" | "complete" | "optional" | "attention";

export type WizardStep = {
  id: string;
  label: string;
  status: WizardStatus;
};

/** What triggered a step change — lets the caller validate on "next" only, never when jumping via the map. */
export type WizardNavSource = "map" | "next" | "back";

const STATUS_LABELS: Record<WizardStatus, string> = {
  not_started: "Not started",
  incomplete: "Incomplete",
  complete: "Complete",
  optional: "Optional",
  attention: "Needs attention",
};

const STATUS_BADGE_VARIANTS: Record<WizardStatus, NonNullable<BadgeProps["variant"]>> = {
  not_started: "neutral",
  incomplete: "warning",
  complete: "success",
  optional: "info",
  attention: "danger",
};

const WizardActiveContext = createContext<string | null>(null);

/**
 * Generic step-by-step wizard chrome: a sticky step map with a status label per
 * step (click any step to jump to it), the active step's panel, and Back/Next.
 * It owns no form state — the caller derives each step's `status`, decides what
 * "next" validates, and renders one <WizardPanel> per step. Inactive panels stay
 * mounted (just hidden) so field state and uncontrolled inputs survive step changes.
 */
export function WizardShell({
  steps,
  activeId,
  onSelect,
  children,
}: {
  steps: WizardStep[];
  activeId: string;
  onSelect: (id: string, source: WizardNavSource) => void;
  children: ReactNode;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRenderRef = useRef(true);

  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeId),
  );
  const active = steps[activeIndex];
  const previous = steps[activeIndex - 1];
  const next = steps[activeIndex + 1];

  // Bring the new step's top into view (below the sticky header) when the step changes.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeId]);

  return (
    <div ref={rootRef} className="flex scroll-mt-[calc(var(--header-height)+var(--search-row-height))] flex-col gap-6">
      <nav
        aria-label="Progress"
        className="sticky top-[calc(var(--header-height)+var(--search-row-height))] z-30 -mx-2 border-b bg-background/95 px-2 py-3 backdrop-blur"
      >
        {/* Phone: collapsed "Step N of M" bar that expands into the full map. */}
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium sm:hidden"
          aria-expanded={mapOpen}
          onClick={() => setMapOpen((open) => !open)}
        >
          <span>
            Step {activeIndex + 1} of {steps.length}: {active?.label}
          </span>
          <span className="flex items-center gap-2">
            {active && <Badge variant={STATUS_BADGE_VARIANTS[active.status]}>{STATUS_LABELS[active.status]}</Badge>}
            <ChevronDown className={cn("h-4 w-4 transition-transform", mapOpen && "rotate-180")} />
          </span>
        </button>

        <ol className={cn("mt-3 flex-col gap-1 sm:mt-0 sm:flex sm:flex-row sm:gap-2", mapOpen ? "flex" : "hidden")}>
          {steps.map((step, index) => {
            const isActive = step.id === activeId;
            return (
              <li key={step.id} className="sm:flex-1">
                <button
                  type="button"
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => {
                    setMapOpen(false);
                    onSelect(step.id, "map");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted sm:flex-col sm:items-start sm:gap-1",
                    isActive ? "border-primary bg-muted/60" : "border-transparent",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                        step.status === "complete" ? "bg-success text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {step.status === "complete" ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    {step.label}
                  </span>
                  <Badge variant={STATUS_BADGE_VARIANTS[step.status]}>{STATUS_LABELS[step.status]}</Badge>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <WizardActiveContext.Provider value={activeId}>{children}</WizardActiveContext.Provider>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!previous}
          onClick={() => previous && onSelect(previous.id, "back")}
        >
          Back
        </Button>
        {next && (
          <Button type="button" onClick={() => onSelect(next.id, "next")}>
            Next: {next.label}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One step's content — only visible while it's the wizard's active step. */
export function WizardPanel({ id, children }: { id: string; children: ReactNode }) {
  const activeId = useContext(WizardActiveContext);
  return (
    <div role="group" aria-hidden={activeId !== id} className={cn("flex-col gap-5", activeId === id ? "flex" : "hidden")}>
      {children}
    </div>
  );
}
