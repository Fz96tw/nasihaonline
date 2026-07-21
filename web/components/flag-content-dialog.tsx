"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirm-before-flag dialog shared by the blog/forum/library flag buttons
 * (§4.8/§4.9/§4.13). Flagging has no self-service undo — only a moderator/
 * Steward resolving it from /admin/content clears the flag — so this both
 * warns the flagger up front and collects the reason stored alongside the
 * flag for that review.
 */
export function FlagContentDialog({
  open,
  onOpenChange,
  itemLabel,
  submitting,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemLabel: string;
  submitting: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setReason("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag this {itemLabel}?</DialogTitle>
          <DialogDescription>
            This sends it to moderators for review. Once submitted, it can only be undone by
            requesting the Nasiha board to remove the flag — there&apos;s no self-service undo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="flag-reason" className="text-sm font-medium">
            Why are you flagging this?
          </label>
          <Textarea
            id="flag-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Briefly describe the concern…"
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || reason.trim().length === 0}
            onClick={() => onConfirm(reason.trim())}
          >
            {submitting ? "Flagging…" : "Flag for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
