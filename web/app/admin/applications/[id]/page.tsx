import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/applications";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { HOW_HEARD_LABELS } from "@/lib/validation/application";
import { getProfileLinkLabel } from "@/lib/profile-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminApplicationReviewForm } from "@/components/admin-application-review-form";
import { AdminResendInviteButton } from "@/components/admin-resend-invite-button";

const PENDING_STATUSES = new Set(["submitted", "under_review"]);

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const application = await db.membershipApplication.findUnique({ where: { id: params.id } });
  if (!application) notFound();

  const isPending = PENDING_STATUSES.has(application.status);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin/applications" className="text-sm text-muted-foreground hover:underline">
          ← Back to applications
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {application.firstName} {application.lastName}
          </h1>
          <Badge variant={STATUS_BADGE_VARIANT[application.status]}>
            {STATUS_LABELS[application.status]}
          </Badge>
          {application.sourcedFromDonation && (
            <Badge variant="info" title="Auto-submitted from the donate form's Friend of NASIHA checkbox — professional title and how-heard were never collected.">
              From donation
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Application</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={application.email} />
            <Field label="Professional title / Specialty" value={application.professionalTitle} />
            <Field
              label={application.linkedinUrl ? getProfileLinkLabel(application.linkedinUrl) : "LinkedIn / Website"}
              value={
                application.linkedinUrl ? (
                  <a
                    href={application.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {application.linkedinUrl}
                  </a>
                ) : null
              }
            />
            <Field
              label="Requested tier"
              value={application.requestedTier ? TIER_LABELS[application.requestedTier] : "No preference"}
            />
            <Field label="Country / Region" value={application.countryRegion} />
            <Field
              label="How did you hear about NASIHA?"
              value={
                application.howHeardSource
                  ? [
                      HOW_HEARD_LABELS[application.howHeardSource],
                      application.howHeardMemberName,
                      application.howHeardOtherDetail,
                    ]
                      .filter(Boolean)
                      .join(" — ")
                  : null
              }
            />
            <Field label="Submitted" value={application.createdAt.toLocaleString()} />
            <Field label="Email updates opt-in" value={application.emailUpdatesOptIn ? "Yes" : "No"} />
          </dl>
        </CardContent>
      </Card>

      {isPending ? (
        <AdminApplicationReviewForm
          applicationId={application.id}
          requestedTier={application.requestedTier}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review outcome</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Decision"
              value={
                <Badge variant={STATUS_BADGE_VARIANT[application.status]}>
                  {STATUS_LABELS[application.status]}
                </Badge>
              }
            />
            {application.assignedTier && (
              <Field label="Assigned tier" value={TIER_LABELS[application.assignedTier]} />
            )}
            <Field label="Reviewed by" value={application.reviewedByEmail} />
            <Field
              label="Reviewed at"
              value={application.reviewedAt ? application.reviewedAt.toLocaleString() : null}
            />
            <div className="sm:col-span-2">
              <Field
                label={`Admin note${application.adminNoteVisibleToApplicant ? " (visible to applicant)" : ""}`}
                value={application.adminNote}
              />
            </div>
            {application.status === "approved" && (
              <AdminResendInviteButton applicationId={application.id} />
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
