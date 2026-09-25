import "server-only";
import { z } from "zod";
import { CODE_MAX_LENGTH, CODE_MIN_LENGTH, normalizeCode } from "@/lib/room-code";

/** Body shared by /api/rooms/start and /api/rooms/join. */
export const roomRequestSchema = z.object({
  code: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z
        .string()
        .min(CODE_MIN_LENGTH, `Codes need at least ${CODE_MIN_LENGTH} characters.`)
        .max(CODE_MAX_LENGTH, `Codes can be at most ${CODE_MAX_LENGTH} characters.`),
    ),
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Enter your name.").max(40, "Names can be at most 40 characters.")),
});

export type RoomRequest = z.infer<typeof roomRequestSchema>;

/** First user-facing validation message from a failed parse. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
