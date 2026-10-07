// No "server-only" guard: used by the posting job in scripts/worker.ts and by
// the admin "post now" route, like lib/weekly-reflection-post.ts.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { isReflectionImageFile } from "@/lib/reflection-images";

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
