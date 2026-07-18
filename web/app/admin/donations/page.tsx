import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FREQUENCY_LABELS: Record<string, string> = {
  one_time: "One-time",
  recurring: "Monthly",
};

export default async function AdminDonationsPage() {
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

  const donations = await db.donation.findMany({ orderBy: { createdAt: "desc" } });
  const totalCents = donations.reduce((sum, d) => sum + d.amountCents, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← Back to Admin
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Donations</h1>
          <p className="text-muted-foreground">
            {donations.length} donation{donations.length === 1 ? "" : "s"} · $
            {(totalCents / 100).toFixed(2)} total. Read-only with respect to Knowledge Hours and
            membership tier — no relationship whatsoever.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/admin/donations?export=csv">Export CSV</a>
        </Button>
      </div>

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Recognition</TableHead>
              <TableHead>Email Updates</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {donations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No donations yet.
                </TableCell>
              </TableRow>
            )}
            {donations.map((donation) => (
              <TableRow key={donation.id}>
                <TableCell className="text-muted-foreground">
                  {donation.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{donation.donorName}</span>
                    <span className="text-xs text-muted-foreground">{donation.donorEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  ${(donation.amountCents / 100).toFixed(2)} {donation.currency.toUpperCase()}
                </TableCell>
                <TableCell>{FREQUENCY_LABELS[donation.frequency] ?? donation.frequency}</TableCell>
                <TableCell>
                  <Badge variant={donation.recognitionConsent ? "success" : "neutral"}>
                    {donation.recognitionConsent ? "Opted in" : "Anonymous"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={donation.emailUpdatesOptIn ? "success" : "neutral"}>
                    {donation.emailUpdatesOptIn ? "Opted in" : "Opted out"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {donation.note || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
