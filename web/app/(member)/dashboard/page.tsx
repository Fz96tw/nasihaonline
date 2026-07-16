import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { StatsRow } from "@/components/dashboard/stats-row";
import { AccountNoticesWidget } from "@/components/dashboard/account-notices-widget";
import { UpcomingEventsWidget } from "@/components/dashboard/upcoming-events-widget";
import { RecentLibraryWidget } from "@/components/dashboard/recent-library-widget";
import { RecentBlogWidget } from "@/components/dashboard/recent-blog-widget";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.name ?? user.email}
        </p>
      </div>

      <Suspense fallback={null}>
        <AccountNoticesWidget userId={user.id} />
      </Suspense>

      <StatsRow userId={user.id} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
