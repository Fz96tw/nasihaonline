import "server-only";
import { db } from "@/lib/db";

/** Unviewed donations — feeds the nav shield/dashboard badge (PRD §4.14). */
export async function getNewDonationsCount(): Promise<number> {
  return db.donation.count({ where: { viewedByAdminAt: null } });
}

/**
 * Marks every currently-unviewed donation as viewed. Called as a side
 * effect of loading /admin/donations — unlike applications/reports/etc., a
 * donation needs no per-item admin decision, so simply viewing the list is
 * the "handled" signal rather than requiring an explicit per-row action.
 */
export async function markAllDonationsViewed(): Promise<void> {
  await db.donation.updateMany({ where: { viewedByAdminAt: null }, data: { viewedByAdminAt: new Date() } });
}
