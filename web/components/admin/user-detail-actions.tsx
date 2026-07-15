"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Role, Tier } from "@/lib/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/validation/user-admin";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { getCsrfToken } from "@/lib/csrf-client";

const NO_TIER = "none";

export function UserDetailActions({
  userId,
  role: initialRole,
  tier: initialTier,
  suspended,
  isSelf,
}: {
  userId: string;
  role: Role;
  tier: Tier | null;
  suspended: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [tier, setTier] = useState<Tier | typeof NO_TIER>(initialTier ?? NO_TIER);
  const [pending, setPending] = useState<"save" | "suspend" | "reinstate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: Record<string, unknown>, kind: "save" | "suspend" | "reinstate") {
    setPending(kind);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  function saveRoleTier() {
    void submit(
      { action: "update_role_tier", role, tier: tier === NO_TIER ? null : tier },
      "save",
    );
  }

  function suspend() {
    if (!window.confirm("Suspend this user? They will immediately lose sign-in and member access.")) return;
    void submit({ action: "suspend" }, "suspend");
  }

  function reinstate() {
    void submit({ action: "reinstate" }, "reinstate");
  }

  return (
    <div className="flex flex-col gap-6 sm:grid sm:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-[10px] border p-4">
        <h3 className="text-sm font-semibold">Role &amp; Tier</h3>
        <Select value={role} onValueChange={(value) => setRole(value as Role)}>
          <SelectTrigger aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(Role).map((value) => (
              <SelectItem key={value} value={value}>
                {ROLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={(value) => setTier(value as Tier | typeof NO_TIER)}>
          <SelectTrigger aria-label="Tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TIER}>No tier</SelectItem>
            {Object.values(Tier).map((value) => (
              <SelectItem key={value} value={value}>
                {TIER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={pending !== null} onClick={saveRoleTier}>
          {pending === "save" ? "Saving…" : "Save role & tier"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border p-4">
        <h3 className="text-sm font-semibold">Account status</h3>
        <p className="text-sm text-muted-foreground">
          {suspended
            ? "This account is suspended: blocked from sign-in and member routes. Their existing ledger entries and content remain unchanged."
            : "This account has normal sign-in and member access."}
        </p>
        {suspended ? (
          <Button disabled={pending !== null} onClick={reinstate}>
            {pending === "reinstate" ? "Reinstating…" : "Reinstate"}
          </Button>
        ) : (
          <Button
            variant="destructive"
            disabled={pending !== null || isSelf}
            title={isSelf ? "You cannot suspend your own account" : undefined}
            onClick={suspend}
          >
            {pending === "suspend" ? "Suspending…" : "Suspend"}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
    </div>
  );
}
