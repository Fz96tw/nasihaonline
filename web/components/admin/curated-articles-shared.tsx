"use client";

import { getCsrfToken } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import type { CommunityOption } from "@/lib/curated-articles";

/** JSON request to an admin curated-articles route; throws the route's error message on failure. */
export async function curatedAdminRequest<T = unknown>(method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown): Promise<T> {
  const csrfToken = await getCsrfToken();
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.");
  return payload as T;
}

/** Toggle-chip multi-select of communities. No selection = not tied to a community (shown to everyone). */
export function CommunityPicker({
  communities,
  value,
  onChange,
  disabled,
  label = "Communities",
}: {
  communities: CommunityOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const selected = new Set(value);
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {communities.map((community) => {
          const on = selected.has(community.id);
          return (
            <button
              key={community.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((id) => id !== community.id) : [...value, community.id])}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {community.name}
            </button>
          );
        })}
      </div>
      {value.length === 0 && <p className="text-xs text-muted-foreground">None selected: shown to every member, not tied to a community.</p>}
    </fieldset>
  );
}

export function communityNames(communities: CommunityOption[], ids: string[]): string[] {
  const byId = new Map(communities.map((community) => [community.id, community.name]));
  return ids.flatMap((id) => {
    const name = byId.get(id);
    return name ? [name] : [];
  });
}
