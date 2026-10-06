import { KnowledgeVisibility } from "@/lib/generated/prisma/enums";

// Mirrors ALLOWED_DOCUMENT_MIME_TYPES in lib/storage.ts (uploadKnowledgeDocument,
// shared by Library and Peer Review) — a browser accept hint only, the
// server re-validates regardless. Video (mp4/webm/mov) has a higher size cap
// than documents (see MAX_VIDEO_UPLOAD_BYTES there).
export const DOCUMENT_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,image/jpeg,image/png,image/webp,image/gif,image/bmp,video/mp4,video/webm,video/quicktime";

export const VISIBILITY_LABELS: Record<KnowledgeVisibility, string> = {
  [KnowledgeVisibility.public]: "Public — visible to every member",
  [KnowledgeVisibility.restricted]: "Restricted — invited members only",
};
