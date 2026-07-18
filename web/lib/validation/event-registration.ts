import { z } from "zod";

export const eventRegistrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email address"),
});

export type EventRegistrationFormValues = z.infer<typeof eventRegistrationSchema>;
