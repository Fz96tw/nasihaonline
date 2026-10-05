"use client";

import { UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberFollows } from "@/hooks/use-member-follows";
import { cn } from "@/lib/utils";

/**
 * Private "follow" toggle for a member — saves them to the viewer's "My
 * people" list (no notification, no public count). Reusable on any
 * member-authored surface; callers only render it for someone who passed the
 * Directory visibility gate and isn't the viewer (the API enforces both).
 *
 * - `button`: labeled outline button (profile, cards).
 * - `nudge`: quiet text link, to sit beside Reply/Edit actions and bylines.
 */
export function FollowMemberButton({
  memberId,
  memberName,
  variant = "button",
  className,
}: {
  memberId: string;
  memberName: string;
  variant?: "button" | "nudge";
  className?: string;
}) {
  const { loaded, isFollowing, setFollowing } = useMemberFollows();
  const following = isFollowing(memberId);
  const label = following ? "Following" : "Follow";
  const ariaLabel = following ? `Unfollow ${memberName}` : `Follow ${memberName}`;
  const Icon = following ? UserCheck : UserPlus;

  if (variant === "nudge") {
    return (
      <button
        type="button"
        disabled={!loaded}
        aria-pressed={following}
        aria-label={ariaLabel}
        title={following ? "In your My people list — click to remove" : "Save to your private My people list"}
        onClick={() => setFollowing(memberId, !following)}
        className={cn(
          "inline-flex items-center gap-1 text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          following ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={following ? "secondary" : "outline"}
      size="sm"
      disabled={!loaded}
      aria-pressed={following}
      aria-label={ariaLabel}
      title={following ? "In your My people list — click to remove" : "Save to your private My people list"}
      className={cn("h-8 gap-1.5 px-2.5 text-xs", className)}
      onClick={() => setFollowing(memberId, !following)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}
