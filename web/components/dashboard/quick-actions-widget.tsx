"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  ChevronDown,
  ClipboardCheck,
  MessageSquare,
  PenLine,
  Search,
  Send,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

const ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Write a blog", href: "/blog", icon: PenLine },
  { label: "Start a discussion", href: "/forums", icon: MessageSquare },
  { label: "Request a peer review", href: "/review-feedback", icon: ClipboardCheck },
  { label: "Contribute to Knowledge Library", href: "/library/new", icon: BookOpen },
  { label: "Schedule an event", href: "/calendar", icon: CalendarPlus },
  { label: "Search member directory", href: "/members", icon: Search },
  { label: "Schedule 1-1 meeting", href: "/inbox", icon: Users },
  { label: "Send a direct message", href: "/inbox", icon: Send },
];

const OPEN_STORAGE_KEY = "nasiha:dashboard:quick-actions-open";

/** Dashboard shortcuts into the site's main compose/action flows. Collapsible on mobile to reclaim space. */
export function QuickActionsWidget() {
  const [open, setOpen] = useState(true);

  // Restore the persisted collapse state after mount (localStorage isn't available during SSR,
  // and reading it synchronously in the initializer would mismatch the server-rendered markup).
  useEffect(() => {
    const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
    if (stored !== null) setOpen(stored === "true");
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(OPEN_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Quick Actions</CardTitle>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="quick-actions-content"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="sr-only">{open ? "Hide quick actions" : "Show quick actions"}</span>
        </button>
      </CardHeader>
      <CardContent id="quick-actions-content" className={open ? "block" : "hidden lg:block"}>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {ACTIONS.map((action) => (
            <li key={action.label}>
              <Link
                href={action.href}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent hover:underline"
              >
                <action.icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{action.label}</span>
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
