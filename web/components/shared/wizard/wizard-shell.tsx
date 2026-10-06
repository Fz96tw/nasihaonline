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

/**
 * How the newly shown panel arrives. Next/Back slide in from the direction of
 * travel; jumping via the map (no direction) just fades. Null (the initial
 * render) doesn't animate at all. Full class strings so Tailwind can see them;
 * every effect is `motion-safe:` so reduced-motion users get an instant swap.
 */
type PanelEntrance = "forward" | "back" | "fade" | null;

const PANEL_ENTRANCE_CLASSES: Record<NonNullable<PanelEntrance>, string> = {
  forward: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-3 motion-safe:duration-200",
  back: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-3 motion-safe:duration-200",
  fade: "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
};

const WizardActiveContext = createContext<{ activeId: string; entrance: PanelEntrance }>({
  activeId: "",
  entrance: null,
});

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
  const [entrance, setEntrance] = useState<PanelEntrance>(null);
  // Steps that just flipped to "complete" — their check circle plays a one-off
  // pop. Steps that were already complete on first render never do.
  const [justCompleted, setJustCompleted] = useState<ReadonlySet<string>>(new Set());
  const previousStatusesRef = useRef<Record<string, WizardStatus> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRenderRef = useRef(true);

  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeId),
  );
  const active = steps[activeIndex];
  const previous = steps[activeIndex - 1];
  const next = steps[activeIndex + 1];

  useEffect(() => {
    const current = Object.fromEntries(steps.map((step) => [step.id, step.status]));
    const previous = previousStatusesRef.current;
    previousStatusesRef.current = current;
    if (!previous) return;
    setJustCompleted((old) => {
      const next = new Set<string>();
      old.forEach((id) => {
        if (current[id] === "complete") next.add(id);
      });
      for (const step of steps) {
        if (step.status === "complete" && previous[step.id] !== "complete") next.add(step.id);
      }
      let unchanged = next.size === old.size;
      next.forEach((id) => {
        if (!old.has(id)) unchanged = false;
      });
      return unchanged ? old : next;
    });
  }, [steps]);

  function select(id: string, source: WizardNavSource) {
    setEntrance(source === "next" ? "forward" : source === "back" ? "back" : "fade");
    onSelect(id, source);
  }

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
                    select(step.id, "map");
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
                        justCompleted.has(step.id) &&
                          "motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200",
                      )}
                    >
                      {step.status === "complete" ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    {step.label}
                  </span>
                  {/* Keyed by status so a change remounts it and replays the fade. */}
                  <Badge
                    key={step.status}
                    variant={STATUS_BADGE_VARIANTS[step.status]}
                    className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                  >
                    {STATUS_LABELS[step.status]}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <WizardActiveContext.Provider value={{ activeId, entrance }}>{children}</WizardActiveContext.Provider>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!previous}
          onClick={() => previous && select(previous.id, "back")}
        >
          Back
        </Button>
        {next && (
          <Button type="button" onClick={() => select(next.id, "next")}>
            Next: {next.label}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One step's content — only visible while it's the wizard's active step. */
export function WizardPanel({ id, children }: { id: string; children: ReactNode }) {
  const { activeId, entrance } = useContext(WizardActiveContext);
  const active = activeId === id;
  return (
    <div
      role="group"
      aria-hidden={!active}
      // display:none -> flex restarts the CSS animation each time the panel is shown.
      className={cn("flex-col gap-5", active ? cn("flex", entrance && PANEL_ENTRANCE_CLASSES[entrance]) : "hidden")}
    >
      {children}
    </div>
  );
}
