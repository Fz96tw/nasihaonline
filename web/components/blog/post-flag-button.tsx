"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlagContentDialog } from "@/components/flag-content-dialog";
import { getCsrfToken } from "@/lib/csrf-client";

export function PostFlagButton({ slug, initialFlagged }: { slug: string; initialFlagged: boolean }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(initialFlagged);
  const [flagError, setFlagError] = useState<string | null>(null);

  async function handleFlag(reason: string) {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/blog/${slug}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setFlagged(true);
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFlagging(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {flagged ? (
        <Badge variant="danger">Flagged</Badge>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDialogOpen(true)}
          title="Flag this post for moderator review"
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" />
          Flag
        </Button>
      )}
      <FlagContentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        itemLabel="post"
        submitting={flagging}
        error={flagError}
        onConfirm={handleFlag}
      />
    </div>
  );
}
