import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { AdmissionPhase } from "@/lib/generated/prisma/enums";
import {
  getAdmissionPhase,
  setAdmissionPhase,
  getWelcomeAnnouncementSettings,
  setWelcomeAnnouncementSettings,
  getQuickRecordingMaxDuration,
  setQuickRecordingMaxDuration,
} from "@/lib/settings";

const patchSchema = z.object({
  admissionPhase: z.nativeEnum(AdmissionPhase).optional(),
  welcomeAnnouncementInFeed: z.boolean().optional(),
  welcomeAnnouncementNotify: z.boolean().optional(),
  welcomeAnnouncementEmail: z.boolean().optional(),
  quickRecordingMaxDurationSeconds: z.number().int().min(1).max(3600).optional(),
});

export async function GET() {
  try {
    await requireRole([Role.admin]);
    return NextResponse.json({
      admissionPhase: await getAdmissionPhase(),
      ...(await getWelcomeAnnouncementSettings()),
      quickRecordingMaxDurationSeconds: await getQuickRecordingMaxDuration(),
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.admissionPhase !== undefined) {
    await setAdmissionPhase(parsed.data.admissionPhase);
  }

  const { welcomeAnnouncementInFeed, welcomeAnnouncementNotify, welcomeAnnouncementEmail } = parsed.data;
  if (
    welcomeAnnouncementInFeed !== undefined ||
    welcomeAnnouncementNotify !== undefined ||
    welcomeAnnouncementEmail !== undefined
  ) {
    const current = await getWelcomeAnnouncementSettings();
    await setWelcomeAnnouncementSettings({
      welcomeAnnouncementInFeed: welcomeAnnouncementInFeed ?? current.welcomeAnnouncementInFeed,
      welcomeAnnouncementNotify: welcomeAnnouncementNotify ?? current.welcomeAnnouncementNotify,
      welcomeAnnouncementEmail: welcomeAnnouncementEmail ?? current.welcomeAnnouncementEmail,
    });
  }

  if (parsed.data.quickRecordingMaxDurationSeconds !== undefined) {
    await setQuickRecordingMaxDuration(parsed.data.quickRecordingMaxDurationSeconds);
  }

  return NextResponse.json({
    admissionPhase: await getAdmissionPhase(),
    ...(await getWelcomeAnnouncementSettings()),
    quickRecordingMaxDurationSeconds: await getQuickRecordingMaxDuration(),
  });
}
