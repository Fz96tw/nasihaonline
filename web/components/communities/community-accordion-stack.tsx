"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface CommunityAccordionTile {
  id: string;
  name: string;
  description: string | null;
  image: string;
}

export function CommunityAccordionStack({ communities }: { communities: CommunityAccordionTile[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActiveId(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }, []);

  // A fast sweep across the narrow slivers fires onMouseEnter on every
  // panel in quick succession — without this debounce, each one restarts
  // the flex-width transition before the last settles, producing jitter.
  // Only a deliberate dwell (~90ms) commits the expand.
  function scheduleActive(id: string) {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setActiveId(id), 90);
  }

  function collapseNow() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setActiveId(null);
  }

  return (
    <div
      ref={containerRef}
      onMouseLeave={collapseNow}
      className="mx-auto flex h-[480px] w-full max-w-[1120px] flex-col overflow-hidden rounded-xl border shadow-lg sm:h-[230px] sm:flex-row md:h-[260px]"
    >
      {communities.map((community) => {
        const isActive = activeId === community.id;

        return (
          <button
            key={community.id}
            type="button"
            aria-expanded={isActive}
            onMouseEnter={() => scheduleActive(community.id)}
            onFocus={() => setActiveId(community.id)}
            onClick={() => setActiveId(isActive ? null : community.id)}
            className={cn(
              "group relative w-full overflow-hidden border-b text-left transition-[flex] duration-500 ease-in-out last:border-b-0 sm:h-full sm:w-auto sm:border-b-0 sm:border-r sm:last:border-r-0",
              isActive && "sm:max-w-[360px]",
            )}
            style={{ flex: isActive ? "3 1 0%" : "1 1 0%" }}
          >
            <Image
              src={community.image}
              alt=""
              fill
              sizes="(min-width: 640px) 300px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Collapsed: horizontal sliver label, truncated to fit */}
            <p
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-4 truncate px-2 text-center text-sm font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)] transition-opacity duration-200",
                isActive ? "opacity-0" : "opacity-100",
              )}
            >
              {community.name}
            </p>

            {/* Expanded: full title + description */}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 p-3 transition-opacity duration-300",
                isActive ? "opacity-100 delay-150" : "pointer-events-none opacity-0",
              )}
            >
              <p className="text-2xl font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)]">
                {community.name}
              </p>
              <p className="mt-1 max-w-[280px] text-lg leading-[1.7] text-white/90 sm:max-w-[320px]">
                {community.description ?? "No description yet."}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
