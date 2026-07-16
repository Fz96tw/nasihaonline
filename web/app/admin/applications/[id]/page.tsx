import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/applications";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { CAREER_STAGE_LABELS, AVAILABILITY_LABELS, AREA_OF_INTEREST_LABELS } from "@/lib/validation/application";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminApplicationReviewForm } from "@/components/admin-application-review-form";

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
              label="Requested tier"
              value={application.requestedTier ? TIER_LABELS[application.requestedTier] : "No preference"}
            />
            <Field label="Career stage" value={CAREER_STAGE_LABELS[application.careerStage]} />
            <Field label="Availability" value={AVAILABILITY_LABELS[application.availability]} />
            <Field label="Area of interest" value={AREA_OF_INTEREST_LABELS[application.areaOfInterest]} />
            <Field label="Country / Region" value={application.countryRegion} />
            <Field label="Referral" value={application.referral} />
            <Field
              label="Professional reference"
              value={
                application.professionalReferenceName || application.professionalReferenceContact
                  ? `${application.professionalReferenceName ?? ""} ${
                      application.professionalReferenceContact
                        ? `(${application.professionalReferenceContact})`
                        : ""
                    }`.trim()
                  : null
              }
            />
            <Field label="Submitted" value={application.createdAt.toLocaleString()} />
          </dl>
          <div className="mt-4 grid gap-4">
            <Field label="Why do you want to join Nasiha?" value={application.whyJoin} />
            <Field label="Areas of expertise to share" value={application.expertiseToShare} />
            <Field label="Topics most want to learn" value={application.topicsToLearn} />
          </div>
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
          </CardContent>
        </Card>
      )}
    </main>
  );
}
