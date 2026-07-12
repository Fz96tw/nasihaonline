import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { StatsRow } from "@/components/dashboard/stats-row";
import { UpcomingEventsWidget } from "@/components/dashboard/upcoming-events-widget";
import { RecentLibraryWidget } from "@/components/dashboard/recent-library-widget";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user.name ?? user.email}
          </p>
        </div>
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>

      <StatsRow />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingEventsWidget />
        <RecentLibraryWidget />
      </div>
    </main>
  );
}
