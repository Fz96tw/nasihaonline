import { z } from "zod";
import { ContactService } from "@/lib/generated/prisma/enums";

export const CONTACT_SERVICE_LABELS: Record<ContactService, string> = {
  [ContactService.research_curation]: "Research and Curation",
  [ContactService.peer_review_feedback]: "Peer Review and Feedback",
  [ContactService.teaching_sharing]: "Teaching and Sharing",
};

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  services: z.array(z.nativeEnum(ContactService)),
  subject: z.string().trim().min(1, "Subject is required").max(150, "Subject is too long"),
  message: z.string().trim().min(1, "Message is required").max(5000, "Message is too long"),
});

export type ContactFormValues = z.infer<typeof contactSchema>;
