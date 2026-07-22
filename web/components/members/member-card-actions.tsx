"use client";

import { useState } from "react";
import { MessageSquare, CalendarPlus, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendMessageDialog } from "@/components/inbox/send-message-dialog";
import { RequestMeetingDialog } from "@/components/members/request-meeting-dialog";
import { ReportConductDialog } from "@/components/members/report-conduct-dialog";

/**
 * "Send Message" and "Request Meeting" both open into the Inbox domain
 * (§4.7) — no live chat entry point from the Directory. Neither is shown on
 * a Friend-tier member's card: Friend tier has no Inbox access at all
 * (§2.2), so there's nothing for either action to reach. Report is hidden
 * on the compact Directory card (`showReport={false}`) but stays available
 * from the full profile view.
 */
export function MemberCardActions({
  memberId,
  memberName,
  isSelf,
  isFriendTier,
  showReport = true,
}: {
  memberId: string;
  memberName: string;
  isSelf: boolean;
  isFriendTier: boolean;
  showReport?: boolean;
}) {
  const [messageOpen, setMessageOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end gap-2">
        {!isFriendTier && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title="Send Message"
              aria-label="Send Message"
              disabled={isSelf}
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
              disabled={isSelf}
              onClick={() => setMeetingOpen(true)}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {showReport && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title="Report"
            aria-label="Report"
            disabled={isSelf}
            onClick={() => setReportOpen(true)}
          >
            <Flag className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {!isSelf && (
        <>
          {!isFriendTier && (
            <>
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
          )}
          {showReport && (
            <ReportConductDialog
              reportedUserId={memberId}
              reportedUserName={memberName}
              open={reportOpen}
              onOpenChange={setReportOpen}
            />
          )}
        </>
      )}
    </>
  );
}
