"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendMessageDialog } from "@/components/inbox/send-message-dialog";
import { firstName } from "@/lib/message-templates";

/**
 * One-click Message action for places members already meet (forum replies,
 * event hosts, library authors, post-event attendee lists). Opens the same
 * compose dialog as the Directory, pre-addressed to the member, so starter
 * templates and shared-context prefill come along for free.
 *
 * Callers only render this for a member who passed the Directory visibility
 * gate (so they are Inbox-eligible) and who isn't the viewer — the dialog
 * itself would reject anything else server-side.
 *
 * - `inline`: a small outline button beside a name.
 * - `nudge`: a quiet "Reach out to {first name}" text link, for under a reply.
 */
export function MessageMemberButton({
  memberId,
  memberName,
  variant = "inline",
}: {
  memberId: string;
  memberName: string;
  variant?: "inline" | "nudge";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "nudge" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquare className="h-3 w-3" aria-hidden />
          Reach out to {firstName(memberName)}
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => setOpen(true)}
          aria-label={`Message ${memberName}`}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Message
        </Button>
      )}
      <SendMessageDialog recipientId={memberId} recipientName={memberName} open={open} onOpenChange={setOpen} />
    </>
  );
}
