import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSentAnnouncement } from "@/lib/feed-server";
import { formatTimestamp } from "@/lib/format-date";
import { linkifyAnnouncementBody } from "@/lib/linkify";
import { Avatar } from "@/components/ui/avatar";

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
      <Link href="/whats-new" className="inline-block text-sm text-muted-foreground hover:underline">
        ← Back to What&apos;s New
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{announcement.title}</h1>
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

      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {linkifyAnnouncementBody(announcement.body)}
      </p>
    </main>
  );
}
