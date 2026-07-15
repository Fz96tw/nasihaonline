"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCsrfToken } from "@/lib/csrf-client";

export function PostFlagButton({ slug, initialFlagged }: { slug: string; initialFlagged: boolean }) {
  const router = useRouter();
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(initialFlagged);
  const [flagError, setFlagError] = useState<string | null>(null);

  async function handleFlag() {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/blog/${slug}/flag`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setFlagged(true);
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
          disabled={flagging}
          onClick={handleFlag}
          title="Flag this post for moderator review"
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" />
          {flagging ? "Flagging…" : "Flag"}
        </Button>
      )}
      {flagError && <p className="text-xs text-destructive">{flagError}</p>}
    </div>
  );
}
