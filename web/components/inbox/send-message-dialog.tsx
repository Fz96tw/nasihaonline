"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SendMessageForm } from "@/components/inbox/send-message-form";

/**
 * Compose UI opened from a Directory card's "Send Message" action (§4.7).
 * The form lives in SendMessageForm, shared with the /inbox/new page.
 */
export function SendMessageDialog({
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
          <DialogTitle>Message {recipientName}</DialogTitle>
          <DialogDescription>
            Sends an asynchronous message to their Inbox — not a live chat.
          </DialogDescription>
        </DialogHeader>
        <SendMessageForm recipientId={recipientId} recipientName={recipientName} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
