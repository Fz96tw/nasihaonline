"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pin, PinOff } from "lucide-react";
import { MEMBER_NAV_SECTIONS, memberFooterItems } from "@/lib/member-nav";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const linkClasses =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";

const PINNED_STORAGE_KEY = "member-sidebar-pinned";

export function MemberSidebar({
  isAdmin = false,
  canModerate = false,
}: {
  isAdmin?: boolean;
  canModerate?: boolean;
}) {
  const pathname = usePathname();
  const footerItems = memberFooterItems({ isAdmin, canModerate });

  const [pinned, setPinned] = useState(true);
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;

  useEffect(() => {
    const stored = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (stored != null) setPinned(stored === "true");
  }, []);

  const togglePinned = () => {
    setPinned((prev) => {
      const next = !prev;
      window.localStorage.setItem(PINNED_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div
      className={cn(
        // `position: sticky` always starts its own stacking context; without an
        // explicit z-index here (not just on the <aside> inside it), that whole
        // context sits in the z-index:auto paint layer, which renders BELOW any
        // ordinary page content that happens to set a positive z-index (e.g.
        // FullCalendar's internal grid uses z-index:1/3) — regardless of the
        // z-30 set on the <aside> below, since that's scoped inside this context.
        "sticky top-[var(--header-height)] z-40 hidden h-[calc(100vh-var(--header-height))] flex-shrink-0 transition-[width,top,height] duration-300 ease-in-out lg:block",
        pinned ? "w-[240px]" : "w-16",
      )}
    >
      {/*
        Hover hitbox is a separate, non-animated box from the visual <aside>
        below. It snaps to its full size the instant `expanded` flips, so the
        mouseleave boundary is always the final width — not wherever the
        <aside>'s width transition happens to be mid-animation. Without this
        split, a fast mouse can cross the aside's still-growing edge and
        collapse it before it ever finishes opening.
      */}
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn("absolute left-0 top-0 h-full", expanded ? "w-[240px]" : "w-16")}
      >
        <aside
          className={cn(
            "absolute left-0 top-0 z-30 flex h-full flex-col gap-1 overflow-y-auto border-r bg-background py-6 transition-[width,box-shadow] duration-200 ease-in-out",
            expanded ? "w-[240px] px-3" : "w-16 px-2",
            !pinned && expanded && "shadow-lg",
          )}
        >
          <div className="mb-2 flex items-center justify-end px-1">
            <button
              type="button"
              onClick={togglePinned}
              title={pinned ? "Unpin sidebar" : "Pin sidebar expanded"}
              className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              {pinned ? (
                <Pin className="h-4 w-4" />
              ) : (
                <PinOff className="h-4 w-4" />
              )}
            </button>
          </div>

          {MEMBER_NAV_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-1">
              <div
                className={cn(
                  "truncate px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  !expanded && "invisible",
                )}
                aria-hidden={!expanded}
              >
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
                        !expanded && "justify-center px-0",
                        "cursor-not-allowed text-muted-foreground/50",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                      {expanded && (
                        <>
                          <span className="truncate">{item.label}</span>
                          <Badge variant="neutral" className="ml-auto">
                            Soon
                          </Badge>
                        </>
                      )}
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
                      !expanded && "justify-center px-0",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                    {expanded && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}

          <div className="mt-auto pt-4">
            {canModerate && !isAdmin && (
              <div
                className={cn(
                  "truncate px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  !expanded && "invisible",
                )}
                aria-hidden={!expanded}
              >
                Action Needed
              </div>
            )}
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
                    !expanded && "justify-center px-0",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {expanded && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
