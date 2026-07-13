"use client";

import { useState } from "react";
import { MessageSquare, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendMessageDialog } from "@/components/inbox/send-message-dialog";
import { RequestMeetingDialog } from "@/components/members/request-meeting-dialog";

/**
 * "Send Message" and "Request Meeting" both open into the Inbox domain
 * (§4.7) — no live chat entry point from the Directory.
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
  const [meetingOpen, setMeetingOpen] = useState(false);

  if (isSelf) return null;

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
          onClick={() => setMeetingOpen(true)}
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
      <RequestMeetingDialog
        recipientId={memberId}
        recipientName={memberName}
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
      />
    </>
  );
}
