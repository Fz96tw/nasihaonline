"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Icon-button "Copy link" action, shared by the Event detail page and the
 * 1:1 MeetingRequest detail pane, sitting in the same icon row as each
 * recording's Download button. Copies `url` verbatim — callers are
 * responsible for passing something durable/absolute (a Meet recording's
 * own Drive link, or this app's own /recording/:id redirect route rather
 * than the short-lived presigned MinIO URL it resolves to) since the whole
 * point is a link a member can paste into a forum post, announcement, or
 * library item and have it still work later.
 */
export function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy} aria-label={label} title={label}>
        {status === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      {status === "copied" && <span className="text-xs text-muted-foreground">Copied!</span>}
      {status === "error" && <span className="text-xs text-destructive">Couldn&apos;t copy link</span>}
    </span>
  );
}
