import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { AdmissionPhase } from "@/lib/generated/prisma/enums";
import { getAdmissionPhase, setAdmissionPhase } from "@/lib/settings";

const patchSchema = z.object({
  admissionPhase: z.nativeEnum(AdmissionPhase),
});

export async function GET() {
  try {
    await requireRole([Role.admin]);
    return NextResponse.json({ admissionPhase: await getAdmissionPhase() });
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

  await setAdmissionPhase(parsed.data.admissionPhase);
  return NextResponse.json({ admissionPhase: parsed.data.admissionPhase });
}
