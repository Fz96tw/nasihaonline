"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getCsrfToken } from "@/lib/csrf-client";

const ALL_COMMUNITIES_VALUE = "__all__";

export function CommunitySelectionForm({
  communities,
  initialSelectedIds,
  initialFollowsAll,
  redirectTo,
}: {
  communities: { id: string; name: string }[];
  initialSelectedIds: string[];
  initialFollowsAll: boolean;
  /** Where to send the member after a successful save — /dashboard when
   * reached via the header row's edit affordance, the (member) layout's
   * gate re-check (any (member) route) when reached from onboarding. */
  redirectTo: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialFollowsAll ? [ALL_COMMUNITIES_VALUE] : initialSelectedIds),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const followsAll = selected.has(ALL_COMMUNITIES_VALUE);

  function toggle(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value === ALL_COMMUNITIES_VALUE) {
        // Selecting "All Communities" clears/disables the individual
        // checkboxes (§design), and vice versa.
        return next.has(ALL_COMMUNITIES_VALUE) ? new Set() : new Set([ALL_COMMUNITIES_VALUE]);
      }
      next.delete(ALL_COMMUNITIES_VALUE);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function onSubmit() {
    if (selected.size === 0) {
      setError("Select at least one community, or choose All Communities.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/profile/communities", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          followsAllCommunities: followsAll,
          communityIds: followsAll ? [] : Array.from(selected),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.",
        );
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 rounded-md border p-3 text-sm font-medium">
          <Checkbox checked={followsAll} onCheckedChange={() => toggle(ALL_COMMUNITIES_VALUE)} />
          All Communities
        </label>
        <div className="flex flex-col gap-2 pl-1">
          {communities.map((community) => (
            <label
              key={community.id}
              className="flex items-center gap-2 text-sm data-[disabled]:opacity-50"
              data-disabled={followsAll || undefined}
            >
              <Checkbox
                checked={followsAll || selected.has(community.id)}
                disabled={followsAll}
                onCheckedChange={() => toggle(community.id)}
              />
              {community.name}
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={onSubmit} disabled={submitting} className="self-start">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
