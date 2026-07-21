import { Suspense } from "react";
import Link from "next/link";
import { Award, User } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { StatsRow } from "@/components/dashboard/stats-row";
import { AccountNoticesWidget } from "@/components/dashboard/account-notices-widget";
import { UpcomingEventsWidget } from "@/components/dashboard/upcoming-events-widget";
import { RecentLibraryWidget } from "@/components/dashboard/recent-library-widget";
import { RecentBlogWidget } from "@/components/dashboard/recent-blog-widget";
import { RecentAnnouncementsWidget } from "@/components/dashboard/recent-announcements-widget";
import { ActiveSurveyWidget } from "@/components/dashboard/active-survey-widget";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT } from "@/lib/members";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-8 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
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
        </div>
      </div>

      <Suspense fallback={null}>
        <AccountNoticesWidget userId={user.id} />
      </Suspense>

      <StatsRow userId={user.id} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Suspense fallback={<WidgetSkeleton />}>
          <RecentAnnouncementsWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <ActiveSurveyWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <UpcomingEventsWidget userId={user.id} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <RecentLibraryWidget />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <RecentBlogWidget />
        </Suspense>
      </div>
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
