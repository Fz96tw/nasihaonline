"use client";

import { useState } from "react";
import { MessageSquare, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendMessageDialog } from "@/components/inbox/send-message-dialog";

/**
 * "Send Message" opens the real compose flow (§4.7). "Request Meeting" is a
 * separate objective's scope — it stays a "coming soon" no-op entry point
 * for now, same rationale as before Phase 3 landed.
 */
export function MemberCardActions({
  memberId,
  memberName,
  isSelf,
}: {
  memberId: string;
  memberName: string;
  isSelf: boolean;
}) {
  const [messageOpen, setMessageOpen] = useState(false);
  const [meetingComingSoon, setMeetingComingSoon] = useState(false);

  if (isSelf) return null;

  if (meetingComingSoon) {
    return <p className="text-xs text-muted-foreground">Meeting requests arrive in a later phase.</p>;
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title="Send Message"
          aria-label="Send Message"
          onClick={() => setMessageOpen(true)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title="Request Meeting"
          aria-label="Request Meeting"
          onClick={() => setMeetingComingSoon(true)}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <SendMessageDialog
        recipientId={memberId}
        recipientName={memberName}
        open={messageOpen}
        onOpenChange={setMessageOpen}
      />
    </>
  );
}
