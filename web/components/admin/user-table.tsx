"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Role, Tier } from "@/lib/generated/prisma/enums";
import { ROLE_LABELS, ROLE_BADGE_VARIANT } from "@/lib/validation/user-admin";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { TIER_BADGE_VARIANT } from "@/lib/members";
import type { getAdminUsers } from "@/lib/users-server";

type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>[number];

type RoleFilter = Role | "all";
type TierFilter = Tier | "all";
type SuspendedFilter = "all" | "suspended" | "active";

export function UserTable({ users }: { users: AdminUser[] }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [tier, setTier] = useState<TierFilter>("all");
  const [suspendedFilter, setSuspendedFilter] = useState<SuspendedFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (role !== "all" && user.role !== role) return false;
      if (tier !== "all" && user.tier !== tier) return false;
      if (suspendedFilter === "suspended" && !user.suspended) return false;
      if (suspendedFilter === "active" && user.suspended) return false;
      if (q) {
        const haystack = `${user.name ?? ""} ${user.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [users, role, tier, suspendedFilter, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Select value={role} onValueChange={(value) => setRole(value as RoleFilter)}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by role">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {Object.values(Role).map((value) => (
              <SelectItem key={value} value={value}>
                {ROLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={(value) => setTier(value as TierFilter)}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by tier">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {Object.values(Tier).map((value) => (
              <SelectItem key={value} value={value}>
                {TIER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={suspendedFilter}
          onValueChange={(value) => setSuspendedFilter(value as SuspendedFilter)}
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    <div className="font-medium">{user.name ?? user.email}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_BADGE_VARIANT[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                </TableCell>
                <TableCell>
                  {user.tier ? (
                    <Badge variant={TIER_BADGE_VARIANT[user.tier]}>{TIER_LABELS[user.tier]}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={user.suspended ? "danger" : "success"}>
                    {user.suspended ? "Suspended" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.createdAt.toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No users match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
