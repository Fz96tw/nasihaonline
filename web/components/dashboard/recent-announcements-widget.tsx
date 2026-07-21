import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentAnnouncementsForDashboard } from "@/lib/announcements-server";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function RecentAnnouncementsWidget() {
  const announcements = await getRecentAnnouncementsForDashboard();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Board Announcements</CardTitle>
      </CardHeader>
      <CardContent>
        {announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {announcements.map((announcement) => (
              <li key={announcement.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <Link
                  href={`/whats-new/announcements/${announcement.id}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {announcement.title}
                </Link>
                <p className="text-xs text-muted-foreground">{formatDate(announcement.sentAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
