"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Matches the open state of any Radix overlay (Dialog/AlertDialog/Sheet/
// DropdownMenu/Select/...) that legitimately holds the body pointer-events
// lock below.
const OPEN_OVERLAY_SELECTOR = '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]';

function clearStaleLock() {
  if (document.body.style.pointerEvents !== "none") return;
  if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return;
  document.body.style.pointerEvents = "";
}

/**
 * Radix Dialog/Sheet/DropdownMenu lock <body> with pointer-events:none while
 * open and clear it a moment after closing. That release can fail to happen
 * at all — not just get delayed — whenever a modal overlay is dismissed by
 * something other than Radix's own close path: a Link that closes the menu
 * and navigates in the same click (Next.js swaps out the tree before
 * Radix's cleanup runs), or a select handler that opens an unrelated
 * overlay instead of navigating (e.g. UserMenu's "Manage Clerk Account",
 * which calls clerk.openUserProfile() — no route change ever fires). A
 * pathname-triggered clear alone can't recover from the latter case: with
 * every click on the page dead, no further navigation ever happens to
 * trigger it. The poll below is the actual repair mechanism (self-heals
 * within a second of any stale lock, regardless of cause); the pathname
 * effect just clears it instantly on the common path where a route change
 * does occur.
 */
export function OverlayCleanup() {
  const pathname = usePathname();

  useEffect(clearStaleLock, [pathname]);

  useEffect(() => {
    const interval = setInterval(clearStaleLock, 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
