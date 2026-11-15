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
  groupComposer,
}: {
  recipientId: string;
  recipientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set from the Inbox page — the sender may add people to make it a group message (§4.7). */
  groupComposer?: { currentUserId: string };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{groupComposer ? "New message" : `Message ${recipientName}`}</DialogTitle>
          <DialogDescription>
            {groupComposer
              ? "Sends an asynchronous message to their Inbox — not a live chat. Add more people to start a group message."
              : "Sends an asynchronous message to their Inbox — not a live chat."}
          </DialogDescription>
        </DialogHeader>
        <SendMessageForm
          recipientId={recipientId}
          recipientName={recipientName}
          onDone={() => onOpenChange(false)}
          groupComposer={groupComposer}
        />
      </DialogContent>
    </Dialog>
  );
}
