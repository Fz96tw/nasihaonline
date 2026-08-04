// Shared contact-message types — mirrors lib/privacy.ts's split between
// plain, client-safe data shapes (this file) and DB-touching queries
// (lib/contact-server.ts).
import type { ContactService } from "@/lib/generated/prisma/enums";

export type ContactMessageView = {
  id: string;
  name: string;
  email: string;
  services: ContactService[];
  subject: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};
