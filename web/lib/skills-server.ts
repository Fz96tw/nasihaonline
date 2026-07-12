import "server-only";
import { db } from "@/lib/db";
import type { SkillModel } from "@/lib/generated/prisma/models/Skill";

export async function getAllSkills(): Promise<SkillModel[]> {
  return db.skill.findMany({ orderBy: { name: "asc" } });
}
