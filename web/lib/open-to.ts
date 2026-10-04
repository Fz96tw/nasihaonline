// Client-safe labels for Profile.openTo (see OpenToTag in schema.prisma).
import { OpenToTag } from "@/lib/generated/prisma/enums";

export const OPEN_TO_LABELS: Record<OpenToTag, string> = {
  [OpenToTag.mentoring]: "Mentoring others",
  [OpenToTag.being_mentored]: "Being mentored",
  [OpenToTag.study_partner]: "Study partner",
  [OpenToTag.collaboration]: "Collaboration",
  [OpenToTag.just_chatting]: "Just chatting",
};

export const OPEN_TO_OPTIONS = Object.values(OpenToTag);
