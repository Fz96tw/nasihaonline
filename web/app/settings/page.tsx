import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PasswordChangeForm } from "@/components/settings/password-change-form";

export const metadata: Metadata = {
  title: "Settings — Nasiha",
};

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account security. Notification, digest, and privacy
          preferences arrive in a later phase.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="text-sm text-muted-foreground">
            Change the password you use to sign in.
          </p>
        </div>
        <PasswordChangeForm />
      </section>
    </main>
  );
}
