"use client";

import { useState } from "react";
import { MessageSquare, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

// The Inbox domain (§4.7) that these CTAs open into doesn't ship until
// Phase 3, so they're real, clickable entry points that no-op into a
// "coming soon" state rather than being disabled/hidden — establishing the
// entry point Phase 3 wires up.
export function MemberCardActions() {
  const [comingSoon, setComingSoon] = useState(false);

  if (comingSoon) {
    return (
      <p className="text-xs text-muted-foreground">
        Messaging &amp; meeting requests arrive with the Inbox in Phase 3.
      </p>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        title="Send Message"
        aria-label="Send Message"
        onClick={() => setComingSoon(true)}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        title="Request Meeting"
        aria-label="Request Meeting"
        onClick={() => setComingSoon(true)}
      >
        <CalendarPlus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
