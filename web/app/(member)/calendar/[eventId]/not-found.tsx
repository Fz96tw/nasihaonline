import { CalendarX } from "lucide-react";
import { BackLink } from "@/components/back-link";

/**
 * Segment-scoped 404 for /calendar/[eventId] — deliberately the same message
 * whether the id doesn't exist at all or belongs to a real (often
 * restricted-audience) event the viewer can no longer see, e.g. after being
 * removed as an invitee (getMemberEventById returns null for both, same
 * rationale as members/[memberId]/not-found.tsx). Keeping it generic avoids
 * confirming a restricted event's existence to someone who's lost access.
 */
export default function EventNotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <BackLink fallbackHref="/calendar" />

      <div className="flex flex-col items-center gap-3 rounded-[10px] border p-12 text-center">
        <CalendarX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-lg font-medium">This event isn&apos;t available</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been removed, or you may no longer have access to it.
        </p>
      </div>
    </main>
  );
}
