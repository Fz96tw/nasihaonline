import Link from "next/link";
import { CONTENT_TYPE_LABELS, STATUS_BADGE_VARIANT, STATUS_LABELS } from "@/lib/library";
import type { MySubmission } from "@/lib/library";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteLibraryItemButton } from "@/components/library/delete-library-item-button";

/** Shared by /library/mine and /my-posts's Library tab — a member's own submissions, at any status. */
export function MySubmissionsTable({ submissions }: { submissions: MySubmission[] }) {
  return (
    <div className="rounded-[10px] border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                You haven&apos;t submitted any resources yet.
              </TableCell>
            </TableRow>
          )}
          {submissions.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.title}</TableCell>
              <TableCell className="text-muted-foreground">{CONTENT_TYPE_LABELS[item.contentType]}</TableCell>
              <TableCell className="text-muted-foreground">
                {item.categories.map((category) => category.name).join(", ")}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-3">
                  <Link href={`/library/${item.id}/edit`} className="text-sm text-primary hover:underline">
                    Edit
                  </Link>
                  <DeleteLibraryItemButton
                    itemId={item.id}
                    title={item.title}
                    hasEarnedHours={item.hasEarnedHours}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
