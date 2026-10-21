// No "server-only" guard: used by the posting job in scripts/worker.ts and by
// the admin "post now" route, like lib/weekly-reflection-post.ts.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { isReflectionImageFile, pickNextImage } from "@/lib/reflection-images";

const IMAGE_DIR = path.join(process.cwd(), "public", "images", "weeklyreflection");

/**
 * Image file names currently in public/images/weeklyreflection/. The folder
 * ships inside the Docker image (COPY . .), so the app and the worker see the
 * same files. A missing or unreadable folder means "no images", never an error:
 * the post just falls back to the gradient look.
 */
export async function listReflectionImageFiles(): Promise<string[]> {
  try {
    return (await readdir(IMAGE_DIR)).filter(isReflectionImageFile).sort();
  } catch {
    return [];
  }
}

export type NextReflectionImage = {
  file: string;
  /** "override" = an admin picked it; "rotation" = least recently used. */
  via: "override" | "rotation";
};

/**
 * The background image the next post will use — the single source of truth
 * for both the poster and the admin preview, like resolveNextReflectionQuote.
 * An admin's pick wins while that file is still in the folder; otherwise the
 * least-recently-used rotation applies. Null when the folder has no images
 * (the post then gets the gradient look).
 */
export async function resolveNextReflectionImage(
  listImages: () => Promise<string[]> = listReflectionImageFiles,
): Promise<NextReflectionImage | null> {
  const [files, settings] = await Promise.all([
    listImages(),
    db.siteSettings.findUnique({ where: { id: 1 }, select: { weeklyReflectionNextImageFile: true } }),
  ]);
  const override = settings?.weeklyReflectionNextImageFile;
  if (override && isReflectionImageFile(override) && files.includes(override)) return { file: override, via: "override" };

  const lastUsed = new Map<string, Date>();
  for (const row of await db.reflectionPost.findMany({
    where: { imageFile: { not: null } },
    select: { imageFile: true, postedAt: true },
    orderBy: { postedAt: "asc" },
  })) {
    if (row.imageFile) lastUsed.set(row.imageFile, row.postedAt);
  }
  const file = pickNextImage(files, lastUsed);
  return file ? { file, via: "rotation" } : null;
}
