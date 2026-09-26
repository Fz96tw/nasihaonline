import "server-only";
import { NextResponse } from "next/server";
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
  /** Only sent by a host reclaiming their own meeting (e.g. after a refresh). */
  hostSecret: z.string().max(128).optional(),
});

export type RoomRequest = z.infer<typeof roomRequestSchema>;

/** First user-facing validation message from a failed parse. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}

/** Seconds a client should wait before retrying when a dependency is down. */
const RETRY_AFTER_SECONDS = 15;

/** Clean "try again shortly" answer for when Redis or LiveKit can't be reached, instead of a 500. */
export function unavailableResponse() {
  return NextResponse.json(
    { error: "Showup is temporarily unavailable. Please try again in a moment." },
    { status: 503, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
  );
}

/** 429 with a Retry-After computed from the limiter's reset time. */
export function tooManyRequestsResponse(resetEpochSeconds?: number) {
  const wait = resetEpochSeconds ? Math.max(1, resetEpochSeconds - Math.floor(Date.now() / 1000)) : 60;
  return NextResponse.json(
    { error: "Too many attempts. Please wait a bit and try again." },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
