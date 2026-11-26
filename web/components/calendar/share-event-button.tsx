"use client";

import { useState } from "react";
import { Check, Link2, Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatShareDate(startsAt: string) {
  return new Date(startsAt).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * "Share" on the member event detail page — hands out the public
 * /events/[eventId] URL, never the member-only /calendar/[eventId] one a
 * member would otherwise copy from their address bar (that redirects a
 * signed-out recipient to /sign-in). Only rendered when the event is
 * actually publicly visible (isEventPubliclyVisible), so the link never
 * 404s for the recipient.
 *
 * On a touch device with the Web Share API, tapping goes straight to the
 * OS share sheet (WhatsApp, Messages, Mail…). Everywhere else it opens a
 * small menu: Copy link, or Share by email via a prefilled mailto: in the
 * member's own mail client — nothing is sent from NASIHA's servers.
 */
export function ShareEventButton({ eventId, title, startsAt }: { eventId: string; title: string; startsAt: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = typeof window === "undefined" ? `/events/${eventId}` : `${window.location.origin}/events/${eventId}`;
  const when = formatShareDate(startsAt);
  const shareText = `Thought you might be interested in this NASIHA event: ${title}, ${when}.`;
  const mailto = `mailto:?subject=${encodeURIComponent(`${title} — ${when}`)}&body=${encodeURIComponent(
    `${shareText}\n\nDetails and registration:\n${url}`,
  )}`;

  function shouldUseNativeShare() {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }

  function handleOpenChange(next: boolean) {
    if (next && shouldUseNativeShare()) {
      // A cancelled share sheet rejects with AbortError — nothing to do.
      navigator.share({ title, text: shareText, url }).catch(() => {});
      return;
    }
    setOpen(next);
    setCopied(false);
  }

  function copyLink(e: Event) {
    // Keep the menu open so the "Copied" confirmation is visible.
    e.preventDefault();
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setOpen(false), 1200);
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2 className="mr-1.5 h-4 w-4" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={copyLink}>
          {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Link2 className="mr-2 h-4 w-4" />}
          {copied ? "Link copied" : "Copy link"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={mailto}>
            <Mail className="mr-2 h-4 w-4" />
            Share by email
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Anyone can open this link — no account needed.
          <span className="mt-1 block break-all font-mono">{url.replace(/^https?:\/\//, "")}</span>
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
