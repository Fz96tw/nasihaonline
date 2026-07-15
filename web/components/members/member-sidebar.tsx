"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MEMBER_NAV_SECTIONS, memberFooterItems } from "@/lib/member-nav";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const linkClasses =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";

export function MemberSidebar({
  isAdmin = false,
  canModerate = false,
}: {
  isAdmin?: boolean;
  canModerate?: boolean;
}) {
  const pathname = usePathname();
  const footerItems = memberFooterItems({ isAdmin, canModerate });

  return (
    <aside className="sticky top-[62px] hidden h-[calc(100vh-62px)] w-[280px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r bg-background px-3 py-6 lg:flex">
      {MEMBER_NAV_SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  <span className="truncate">{item.label}</span>
                  <Badge variant="neutral" className="ml-auto">
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
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto pt-4">
        {footerItems.map((item) => {
          const isActive = item.href != null && pathname.startsWith(item.href);
          const Icon = item.icon;
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
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
