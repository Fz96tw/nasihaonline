import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getReviewQueue } from "@/lib/library-server";
import { getKnowledgeDocumentUrl } from "@/lib/storage";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/library";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewQueueActions } from "@/components/library/review-queue-actions";

export const metadata: Metadata = {
  title: "Library Review Queue — Nasiha",
};

/**
 * Library Steward pre-publish review queue (§4.9), route per PRD §5's IA
 * table. Gated to moderator or admin — unlike /admin's other pages (admin
 * only), since Library Stewards are moderators, not necessarily full admins
 * (§11's "any moderator can act on any domain" v1 scoping decision).
 */
export default async function LibraryReviewQueuePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "moderator" && user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const items = await getReviewQueue();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library Review Queue</h1>
        <p className="text-muted-foreground">Review submitted resources before they publish to the Library.</p>
      </div>

      {items.length === 0 && (
        <p className="rounded-[10px] border p-8 text-center text-muted-foreground">
          No resources are waiting for review.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {item.contributor.name ?? item.contributor.email} · {item.category.name} ·{" "}
                  {CONTENT_TYPE_LABELS[item.contentType]} · {LEVEL_LABELS[item.level]}
                </p>
              </div>
              <ReviewQueueActions itemId={item.id} />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">{item.description}</p>

              <div className="flex flex-wrap items-center gap-2">
                {item.deidentificationConfirmed && <Badge variant="info">De-identification confirmed</Badge>}
                {item.youtubeUrl && (
                  <a
                    href={item.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    View YouTube link
                  </a>
                )}
                {item.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={getKnowledgeDocumentUrl(attachment.objectKey)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {attachment.fileName}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
