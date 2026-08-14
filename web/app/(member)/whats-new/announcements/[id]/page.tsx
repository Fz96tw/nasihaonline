import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSentAnnouncement } from "@/lib/feed-server";
import { formatTimestamp } from "@/lib/format-date";
import { linkifyText } from "@/lib/linkify";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT } from "@/lib/members";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { FEED_TYPE_LABELS } from "@/lib/feed";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const announcement = await getSentAnnouncement(params.id);
  return { title: announcement ? `${announcement.title} — NASIHA` : "Announcement not found — NASIHA" };
}

/** /whats-new/announcements/[id] — minimal detail page a feed row's Announcement click-through lands on. */
export default async function AnnouncementDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const announcement = await getSentAnnouncement(params.id);
  if (!announcement) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <BackLink fallbackHref="/whats-new" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline" />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FEED_TYPE_LABELS.announcement}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{announcement.title}</h1>
          {announcement.titleTier && (
            <Badge variant={TIER_BADGE_VARIANT[announcement.titleTier]}>
              {DIRECTORY_TIER_LABELS[announcement.titleTier]}
            </Badge>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Avatar name={announcement.author.name ?? "NASIHA Member"} src={announcement.author.avatarUrl} size="sm" />
          <p className="text-sm text-muted-foreground">
            {announcement.author.name ?? "NASIHA Member"} · {formatTimestamp(announcement.sentAt)}
          </p>
        </div>
      </div>

      {announcement.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
        <img
          src={announcement.imageUrl}
          alt=""
          className="max-h-96 w-full rounded-md object-cover"
        />
      )}

      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {linkifyText(announcement.body)}
      </p>
    </main>
  );
}
