"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MODERATION_TYPE_LABELS, type ModerationItem } from "@/lib/moderation";
import { getCsrfToken } from "@/lib/csrf-client";

const TYPE_BADGE_VARIANT: Record<ModerationItem["type"], "info" | "success" | "warning"> = {
  blog_post: "info",
  library_item: "success",
  forum_post: "warning",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ContentModerationQueue({ initialItems }: { initialItems: ModerationItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(item: ModerationItem, action: "dismiss" | "remove") {
    if (action === "remove" && !window.confirm(`Remove this ${MODERATION_TYPE_LABELS[item.type].toLowerCase()} item? This takes it down from public view.`)) {
      return;
    }
    setPendingId(item.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ type: item.type, action }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setItems((current) => current.filter((existing) => existing.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No flagged content right now.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.map((item) => (
        <Card key={`${item.type}-${item.id}`}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant={TYPE_BADGE_VARIANT[item.type]}>{MODERATION_TYPE_LABELS[item.type]}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
              </div>
              <Link href={item.href} className="font-medium hover:underline" target="_blank">
                {item.title}
              </Link>
              <span className="text-xs text-muted-foreground">{item.authorName ?? "A member"}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="line-clamp-3 text-sm text-muted-foreground">{item.excerpt}</p>
            {item.flagReason && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Flag reason:</span> {item.flagReason}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === item.id}
                onClick={() => resolve(item, "dismiss")}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pendingId === item.id}
                onClick={() => resolve(item, "remove")}
              >
                Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
