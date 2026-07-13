// Client-safe Events types/constants (PRD §4.6) — kept separate from
// events-server.ts so client components can import them without pulling
// in the "server-only" query logic.
import { EventType } from "@/lib/generated/prisma/enums";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EventType.webinar]: "Webinar",
  [EventType.workshop]: "Workshop",
  [EventType.case_discussion]: "Case Discussion",
  [EventType.student_event]: "Student Event",
  [EventType.roundtable]: "Roundtable",
  [EventType.lecture]: "Lecture",
};

// The public /events listing (§4.5's unauthenticated route) — deliberately
// excludes meetingUrl and deidentificationConfirmed, neither of which is
// ever meant to reach an unauthenticated/non-RSVP'd visitor.
export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string | null;
  open: boolean;
  icon: string | null;
  hostName: string | null;
};
