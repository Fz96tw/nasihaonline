"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequestMeetingForm } from "@/components/members/request-meeting-form";

/**
 * "Request Meeting" compose UI opened from a Directory card (§4.7). The
 * form lives in RequestMeetingForm, shared with the /inbox/new page.
 */
export function RequestMeetingDialog({
  recipientId,
  recipientName,
  open,
  onOpenChange,
}: {
  recipientId: string;
  recipientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a meeting with {recipientName}</DialogTitle>
          <DialogDescription>
            Sends a structured request to their Inbox — they can accept, decline, or propose a new time.
          </DialogDescription>
        </DialogHeader>
        <RequestMeetingForm recipientId={recipientId} recipientName={recipientName} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
