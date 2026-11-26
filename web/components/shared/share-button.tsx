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

/**
 * "Share" for publicly readable content (events, Library items, forum
 * threads). Callers render it only when the page at `path` actually opens
 * for a signed-out visitor, so the button doubles as a "non-members can
 * open this" signal and never hands out a link that ends at sign-in or 404.
 *
 * On a touch device with the Web Share API, tapping goes straight to the
 * OS share sheet (WhatsApp, Messages, Mail…). Everywhere else it opens a
 * small menu: Copy link, or Share by email via a prefilled mailto: in the
 * member's own mail client — nothing is sent from NASIHA's servers.
 */
export function ShareButton({
  path,
  title,
  emailSubject,
  emailIntro,
  align = "start",
}: {
  /** Site-relative path of the public page, e.g. `/library/abc`. */
  path: string;
  title: string;
  /** Defaults to `title`. */
  emailSubject?: string;
  /** Opening line of the email body; the link follows on its own line. */
  emailIntro?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const intro = emailIntro ?? `Thought you might find this interesting on NASIHA: ${title}`;
  const mailto = `mailto:?subject=${encodeURIComponent(emailSubject ?? title)}&body=${encodeURIComponent(
    `${intro}\n\n${url}`,
  )}`;

  function shouldUseNativeShare() {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }

  function handleOpenChange(next: boolean) {
    if (next && shouldUseNativeShare()) {
      // URL only, no `text`: Android's share-sheet "Copy" (and some targets)
      // join text + url into one string, so the pasted link carried the
      // message along with it. Chat apps still show the title/image from
      // the page's Open Graph preview. A cancelled sheet rejects with
      // AbortError — nothing to do.
      navigator.share({ title, url }).catch(() => {});
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
      <DropdownMenuContent align={align} className="w-64">
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
