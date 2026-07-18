import { db } from "@/lib/db";
import { ApplicationStatus } from "@/lib/generated/prisma/enums";
import { getFlaggedContentCount } from "@/lib/moderation-server";
import { getPendingLedgerCountForAdmin } from "@/lib/contributions-server";
import { getReviewQueueCount } from "@/lib/library-server";
import { getOpenConductReportCount } from "@/lib/conduct-server";
import { getOpenPrivacyRequestCount } from "@/lib/privacy-server";

/** Pending membership applications (submitted or under review) — shared so /admin and the nav shield can't drift. */
export async function getPendingApplicationsCount(): Promise<number> {
  return db.membershipApplication.count({
    where: { status: { in: [ApplicationStatus.submitted, ApplicationStatus.under_review] } },
  });
}

/** Sum of every pending-review count surfaced on /admin, used by the nav shield icon's badge. */
export async function getPendingAdminReviewCount(): Promise<number> {
  const [applications, content, ledger, libraryReview, conduct, privacy] = await Promise.all([
    getPendingApplicationsCount(),
    getFlaggedContentCount(),
    getPendingLedgerCountForAdmin(),
    getReviewQueueCount(),
    getOpenConductReportCount(),
    getOpenPrivacyRequestCount(),
  ]);

  return applications + content + ledger + libraryReview + conduct + privacy;
}
