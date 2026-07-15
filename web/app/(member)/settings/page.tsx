import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getConductNoticesForUser } from "@/lib/conduct-server";
import { CONDUCT_ACTION_LABELS } from "@/lib/conduct";
import { Badge } from "@/components/ui/badge";
import { PasswordChangeForm } from "@/components/settings/password-change-form";

export const metadata: Metadata = {
  title: "Settings — Nasiha",
};

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const notices = await getConductNoticesForUser(user.id);

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

      {notices.length > 0 && (
        <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Conduct notices</h2>
            <p className="text-sm text-muted-foreground">
              Visible only to you and to admins — never shown to other members.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {notices.map((notice) => (
              <li key={notice.id} className="flex flex-col gap-1 rounded-[10px] border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant={notice.actionTaken === "warning" ? "warning" : "danger"}>
                    {CONDUCT_ACTION_LABELS[notice.actionTaken!]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {notice.actionTakenAt!.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{notice.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
