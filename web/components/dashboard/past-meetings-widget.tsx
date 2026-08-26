import { getMemberEvents } from "@/lib/events-server";
import { getPastMeetingsForUser } from "@/lib/meeting-requests-server";
import { buildAttendanceHistory } from "@/lib/attendance-history";
import { PastMeetingsList } from "@/components/dashboard/past-meetings-list";

/** Dashboard section listing this member's own past Events + 1:1 Meetings (attended or hosted), with filtering/pagination handled client-side in PastMeetingsList. */
export async function PastMeetingsWidget({ userId }: { userId: string }) {
  const [events, pastMeetings] = await Promise.all([getMemberEvents(userId), getPastMeetingsForUser(userId)]);
  const items = buildAttendanceHistory(events, pastMeetings, userId);

  return <PastMeetingsList items={items} />;
}
