import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as {user.email} ({user.role})
      </p>
      <SignOutButton redirectUrl="/sign-in">
        <Button variant="outline">Sign out</Button>
      </SignOutButton>
    </main>
  );
}
