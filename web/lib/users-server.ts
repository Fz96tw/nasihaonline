import "server-only";
import { db } from "@/lib/db";

const ADMIN_USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  tier: true,
  suspended: true,
  suspendedAt: true,
  createdAt: true,
  profile: { select: { titleSpecialty: true } },
} as const;

/** Full user list for /admin/users — small enough to filter client-side (no Meilisearch needed here, unlike the public Directory). */
export async function getAdminUsers() {
  return db.user.findMany({
    select: ADMIN_USER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function getAdminUserDetail(id: string) {
  return db.user.findUnique({
    where: { id },
    include: { profile: true },
  });
}
