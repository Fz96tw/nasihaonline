import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getConductNoticesForUser } from "@/lib/conduct-server";
import type { ConductNoticeView } from "@/lib/conduct";
import { getPrivacyRequestsForUser } from "@/lib/privacy-server";
import type { PrivacyRequestView } from "@/lib/privacy";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { PrivacyRequestsSection } from "@/components/settings/privacy-requests-section";
import { ConductNoticesSection } from "@/components/settings/conduct-notices-section";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const metadata: Metadata = {
  title: "Settings — Nasiha",
};

const TAB_VALUES = ["password", "privacy", "conduct"] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const notices = await getConductNoticesForUser(user.id);
  const noticeViews: ConductNoticeView[] = notices.map((notice) => ({
    id: notice.id,
    description: notice.description,
    actionTaken: notice.actionTaken!,
    actionTakenAt: notice.actionTakenAt!.toISOString(),
    acknowledgedAt: notice.acknowledgedAt ? notice.acknowledgedAt.toISOString() : null,
  }));
  const unacknowledgedConductCount = noticeViews.filter((notice) => !notice.acknowledgedAt).length;

  const privacyRequests = await getPrivacyRequestsForUser(user.id);
  const privacyRequestViews: PrivacyRequestView[] = privacyRequests.map((request) => ({
    id: request.id,
    type: request.type,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    fulfilledAt: request.fulfilledAt ? request.fulfilledAt.toISOString() : null,
  }));
  const pendingPrivacyCount = privacyRequestViews.filter((request) => request.status === "pending").length;

  const showConduct = noticeViews.length > 0;
  const requestedTab = TAB_VALUES.find((tab) => tab === searchParams.tab);
  const defaultTab = requestedTab && (requestedTab !== "conduct" || showConduct) ? requestedTab : "password";

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account security and privacy. Notification and digest preferences arrive in a
          later phase.
        </p>
      </div>

      <SettingsTabs
        defaultTab={defaultTab}
        pendingPrivacyCount={pendingPrivacyCount}
        unacknowledgedConductCount={unacknowledgedConductCount}
        passwordContent={
          <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Password</h2>
              <p className="text-sm text-muted-foreground">Change the password you use to sign in.</p>
            </div>
            <PasswordChangeForm />
          </section>
        }
        privacyContent={
          <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Privacy</h2>
              <p className="text-sm text-muted-foreground">
                Request access to or deletion of your personal data.
              </p>
            </div>
            <PrivacyRequestsSection initialRequests={privacyRequestViews} />
          </section>
        }
        conductContent={
          showConduct ? (
            <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Conduct notices</h2>
                <p className="text-sm text-muted-foreground">
                  Visible only to you and to admins — never shown to other members. Acknowledging a
                  notice only clears it from your Dashboard; it stays here for your records.
                </p>
              </div>
              <ConductNoticesSection initialNotices={noticeViews} />
            </section>
          ) : null
        }
      />
    </main>
  );
}
