import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LEDGER_STATUS_BADGE_VARIANT,
  LEDGER_STATUS_LABELS,
  type ContributionTransaction,
} from "@/lib/contributions";
import { LedgerStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatSignedHours(hours: number): string {
  const sign = hours > 0 ? "+" : "";
  const rounded = Math.abs(hours) % 1 === 0 ? Math.abs(hours) : Math.abs(hours).toFixed(1);
  return `${sign}${hours < 0 ? "-" : ""}${rounded}`;
}

export function ContributionsHistoryTable({ transactions }: { transactions: ContributionTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <p className="rounded-[10px] border bg-card py-16 text-center text-muted-foreground shadow-sm">
        No contributions logged yet.
      </p>
    );
  }

  return (
    <div className="rounded-[10px] border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead>Counterpart</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => {
            const notConfirmed = transaction.status !== LedgerStatus.confirmed;
            return (
              <TableRow key={transaction.id} className={cn(notConfirmed && "text-muted-foreground")}>
                <TableCell>{formatDate(transaction.date)}</TableCell>
                <TableCell>{transaction.activity}</TableCell>
                <TableCell>{transaction.counterpartName ?? "—"}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    !notConfirmed && transaction.hours > 0 && "text-success",
                    !notConfirmed && transaction.hours < 0 && "text-destructive",
                  )}
                >
                  {formatSignedHours(transaction.hours)}
                </TableCell>
                <TableCell>
                  <Badge variant={LEDGER_STATUS_BADGE_VARIANT[transaction.status]}>
                    {LEDGER_STATUS_LABELS[transaction.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
