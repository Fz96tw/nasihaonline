import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSignedPhotoUrls } from "@/lib/team";

export async function GET() {
  const members = await db.teamMember.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
  });

  return NextResponse.json({ members: await withSignedPhotoUrls(members) });
}
