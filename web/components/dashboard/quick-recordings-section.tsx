import { Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQuickRecordingsForDashboard } from "@/lib/quick-recordings-server";
import { QuickRecordingsList } from "@/components/dashboard/quick-recordings-list";

/** "My Quick Recordings" (video-library objective) — every one of the user's own quick recordings (ready/processing/failed), with inline playback, rename, and delete. */
export async function QuickRecordingsSection({ userId }: { userId: string }) {
  const recordings = await getQuickRecordingsForDashboard(userId);
  if (recordings.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Video className="h-5 w-5" />
          My Quick Recordings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <QuickRecordingsList initialRecordings={recordings} />
      </CardContent>
    </Card>
  );
}
