import { Suspense } from "react";
import Link from "next/link";
import { Award, LayoutDashboard, ListChecks, User } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { StatsRow } from "@/components/dashboard/stats-row";
import { AccountNoticesWidget } from "@/components/dashboard/account-notices-widget";
import { ScheduleWidget } from "@/components/dashboard/schedule-widget";
import { InboxWidget } from "@/components/dashboard/inbox-widget";
import { QuickActionsWidget } from "@/components/dashboard/quick-actions-widget";
import { TrendingSection } from "@/components/dashboard/trending-section";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT } from "@/lib/members";
import { cn } from "@/lib/utils";

/** Staggered fade+slide-in for the main/sidebar widgets on load. */
function StaggeredIn({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("animate-in fade-in slide-in-from-bottom-2 duration-500", className)}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {children}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-8 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <LayoutDashboard className="h-7 w-7" />
            Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground">
              Welcome back, {user.name ?? user.email}
            </p>
            {user.tier && (
              <Badge variant={TIER_BADGE_VARIANT[user.tier]}>{DIRECTORY_TIER_LABELS[user.tier]}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/profile"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <User className="h-4 w-4" />
            My Profile
          </Link>
          <Link
            href="/contributions"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Award className="h-4 w-4" />
            My Knowledge Hours
          </Link>
          <Link
            href="/my-posts"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ListChecks className="h-4 w-4" />
            All My Activity
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <AccountNoticesWidget userId={user.id} />
      </Suspense>

      <StatsRow userId={user.id} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StaggeredIn index={1} className="order-1 lg:order-none lg:col-start-2 lg:row-start-1 lg:self-start">
          <QuickActionsWidget />
        </StaggeredIn>
        <StaggeredIn
          index={0}
          className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-2"
        >
          <Suspense fallback={<WidgetSkeleton />}>
            <ScheduleWidget userId={user.id} />
          </Suspense>
        </StaggeredIn>
        <StaggeredIn index={2} className="order-3 lg:order-none lg:col-start-2 lg:row-start-2 lg:self-start">
          <Suspense fallback={<WidgetSkeleton />}>
            <InboxWidget userId={user.id} />
          </Suspense>
        </StaggeredIn>
      </div>

      <StaggeredIn index={3}>
        <Suspense fallback={null}>
          <TrendingSection userId={user.id} isPrivileged={isPrivileged} />
        </Suspense>
      </StaggeredIn>
    </main>
  );
}

function WidgetSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
