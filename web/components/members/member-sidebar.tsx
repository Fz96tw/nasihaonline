"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpen,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  PenLine,
  Settings,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: LucideIcon;
} & ({ href: string; soon?: false } | { href?: undefined; soon: true });

type NavSection = {
  title: string;
  items: NavItem[];
};

// Contributions/Inbox/Calendar/Forums/Blogs/Library ship in later phases
// (PRD §10, Phases 3-5) — listed here per ui-system.md's Member Navigation
// spec so the IA is visible early, but disabled until their routes exist.
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "My Profile", href: "/profile", icon: User },
      { label: "Knowledge Hours", icon: Award, soon: true },
      { label: "Inbox", icon: Inbox, soon: true },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Member Directory", href: "/members", icon: Users },
      { label: "Calendar", icon: CalendarDays, soon: true },
      { label: "Forums", icon: MessageSquare, soon: true },
      { label: "Blogs", icon: PenLine, soon: true },
    ],
  },
  {
    title: "Knowledge",
    items: [{ label: "Library", icon: BookOpen, soon: true }],
  },
];

const linkClasses =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:justify-center lg:justify-start";

export function MemberSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[62px] hidden h-[calc(100vh-62px)] w-[72px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r bg-background py-6 sm:flex lg:w-[280px] lg:px-3">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <div className="hidden px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">
            {section.title}
          </div>
          {section.items.map((item) => {
            const isActive = item.href != null && pathname.startsWith(item.href);
            const Icon = item.icon;

            if (item.soon) {
              return (
                <div
                  key={item.label}
                  aria-disabled="true"
                  title={`${item.label} — coming soon`}
                  className={cn(
                    linkClasses,
                    "cursor-not-allowed text-muted-foreground/50",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="hidden truncate lg:inline">{item.label}</span>
                  <Badge variant="neutral" className="ml-auto hidden lg:inline-flex">
                    Soon
                  </Badge>
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  linkClasses,
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="hidden truncate lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto pt-4">
        <Link
          href="/settings"
          title="Settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={cn(
            linkClasses,
            pathname.startsWith("/settings")
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Settings className="h-[18px] w-[18px] flex-shrink-0" />
          <span className="hidden truncate lg:inline">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
