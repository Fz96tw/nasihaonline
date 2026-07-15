"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Follow/unfollow toggle for a forum (§4.13). Following suppresses
 * per-post forum_reply_mention notifications in favor of the future
 * digest (§4.10, Phase 6) — see createForumPost's follower check.
 */
export function FollowForumButton({
  forumId,
  initialFollowing,
}: {
  forumId: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/${forumId}/follow`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const data = (await res.json()) as { following: boolean };
      setFollowing(data.following);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" disabled={pending} onClick={toggle}>
        {following ? <BellOff className="mr-1.5 h-4 w-4" /> : <Bell className="mr-1.5 h-4 w-4" />}
        {following ? "Following" : "Follow"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
