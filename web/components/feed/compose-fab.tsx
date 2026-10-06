"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookPlus, CalendarPlus, ClipboardCheck, MessageSquarePlus, PenLine, Plus, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Post message to everyone", href: "/forums/general/new", icon: MessageSquarePlus },
  { label: "Write a blog post", href: "/library/new?type=blog_post", icon: PenLine },
  { label: "Create library item", href: "/library/new", icon: BookPlus },
  { label: "Request peer review", href: "/review-feedback/new", icon: ClipboardCheck },
  { label: "Schedule an event", href: "/calendar/new", icon: CalendarPlus },
  { label: "Message a member", href: "/inbox/new", icon: Send },
];

const FROSTED =
  "border border-white/40 bg-primary/10 shadow-lg shadow-primary/10 backdrop-blur-md backdrop-saturate-150 dark:border-white/15 dark:bg-primary/20";

/**
 * Floating frosted "compose" button on What's New. Fans out into the main
 * post/create actions so a member who wants to say something to the whole
 * community doesn't have to discover Forums → General → New Thread.
 */
export function ComposeFab() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // "click", not "pointerdown": on touch devices a scroll gesture starts
    // with a pointerdown on the feed, which would close the menu mid-scroll.
    // A scroll never fires click. Capture phase so iOS Safari still delivers
    // it for non-interactive targets.
    function onOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onOutsideClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-8 sm:right-8">
      <ul className="flex flex-col items-end gap-2" aria-hidden={!open}>
        {ACTIONS.map((action, index) => (
          <li
            key={action.label}
            className={cn(
              "transition-all duration-200 ease-out motion-reduce:transition-none",
              open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
            )}
            style={{ transitionDelay: open ? `${(ACTIONS.length - 1 - index) * 40}ms` : "0ms" }}
          >
            <Link
              href={action.href}
              tabIndex={open ? 0 : -1}
              className={cn(
                FROSTED,
                "flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-sm font-medium text-foreground transition-transform hover:scale-105 motion-reduce:transition-none",
              )}
            >
              <action.icon className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? "Close compose menu" : "Post message to everyone"}
        className={cn(
          FROSTED,
          "relative flex h-14 w-14 items-center justify-center rounded-full text-primary transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        )}
      >
        {!open && (
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/20 [animation-duration:2.5s] motion-reduce:hidden"
          />
        )}
        <Plus
          className={cn("h-6 w-6 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-45")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
