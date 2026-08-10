"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Radix Dialog/Sheet/DropdownMenu lock <body> with pointer-events:none while
 * open and clear it a moment after closing. Clicking a Link that closes one
 * of these (e.g. MobileNav's SheetClose-wrapped links, UserMenu's
 * router.push on select) fires a client-side route change in the same
 * click that closes it — Next.js swaps out the tree before Radix's own
 * cleanup timer runs, so the lock never gets removed and every click on the
 * page silently no-ops until a hard reload. Clearing it on every route
 * change is the standard workaround for this Radix/Next.js interaction.
 */
export function OverlayCleanup() {
  const pathname = usePathname();

  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  }, [pathname]);

  return null;
}
