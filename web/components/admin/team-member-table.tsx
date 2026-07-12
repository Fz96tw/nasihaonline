"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TEAM_ROLE_LABELS, TEAM_ROLE_BADGE_VARIANT } from "@/lib/team";
import type { TeamMemberWithPhotoUrl } from "@/lib/team";
import { getCsrfToken } from "@/lib/csrf-client";

export function TeamMemberTable({ members }: { members: TeamMemberWithPhotoUrl[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reorder(orderedIds: string[]) {
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/team/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      router.refresh();
    } catch {
      setError("Failed to reorder. Please try again.");
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= members.length) return;
    const ids = members.map((m) => m.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void reorder(ids);
  }

  async function toggleActive(member: TeamMemberWithPhotoUrl) {
    setPendingId(member.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const body = new FormData();
      body.set("name", member.name);
      body.set("roleBadge", member.roleBadge);
      body.set("title", member.title);
      body.set("bio", member.bio);
      body.set("active", String(!member.active));
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "PATCH",
        headers: { "x-csrf-token": csrfToken },
        body,
      });
      if (!res.ok) throw new Error("Failed to update");
      router.refresh();
    } catch {
      setError("Failed to update. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(member: TeamMemberWithPhotoUrl) {
    if (!window.confirm(`Remove ${member.name} from the team?`)) return;
    setPendingId(member.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("Failed to remove");
      router.refresh();
    } catch {
      setError("Failed to remove. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No team members yet.
                </TableCell>
              </TableRow>
            )}
            {members.map((member, index) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move up"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === members.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      ↓
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} src={member.photoUrl} size="sm" />
                    <span className="font-medium">{member.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={TEAM_ROLE_BADGE_VARIANT[member.roleBadge]}>
                    {TEAM_ROLE_LABELS[member.roleBadge]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{member.title}</TableCell>
                <TableCell>
                  <Badge variant={member.active ? "success" : "neutral"}>
                    {member.active ? "Visible" : "Hidden"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendingId === member.id}
                      onClick={() => toggleActive(member)}
                    >
                      {member.active ? "Hide" : "Show"}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/team/${member.id}`}>Edit</Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pendingId === member.id}
                      onClick={() => remove(member)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
