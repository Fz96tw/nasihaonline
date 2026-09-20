"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export type { DirectoryMapProps, MapBucket } from "@/components/members/directory-map";

// Leaflet touches `window` at import time, so the map is only ever loaded in
// the browser — import DirectoryMap from here, never from directory-map.tsx.
export const DirectoryMap = dynamic(
  () => import("@/components/members/directory-map").then((module) => module.DirectoryMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[320px] w-full rounded-[10px] md:h-[420px]" />,
  },
);
