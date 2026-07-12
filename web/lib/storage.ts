import "server-only";
import { Client as MinioClient } from "minio";
import sharp from "sharp";

const BUCKET_AVATARS = process.env.MINIO_BUCKET_AVATARS || "avatars";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

// Profile avatars are always resized/cropped to this square thumbnail before
// storage — the original upload is never persisted or served at avatar size
// (PRD §4.3/§9).
const PROFILE_AVATAR_THUMBNAIL_PX = 256;

let client: MinioClient | undefined;

function getClient(): MinioClient {
  if (!client) {
    client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }
  return client;
}

let bucketEnsured = false;

async function ensureBucket(bucket: string) {
  if (bucketEnsured) return;
  const minio = getClient();
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) await minio.makeBucket(bucket);
  bucketEnsured = true;
}

// Signature bytes, not the browser-supplied Content-Type, are the source of
// truth for file type — a spoofed extension/mime shouldn't pass validation.
const IMAGE_SIGNATURES: { mime: string; ext: string; bytes: number[]; offset?: number }[] = [
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/webp", ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"; "WEBP" at offset 8 checked below
];

export class UploadValidationError extends Error {}

function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  for (const sig of IMAGE_SIGNATURES) {
    const offset = sig.offset ?? 0;
    const matches = sig.bytes.every((byte, i) => buffer[offset + i] === byte);
    if (!matches) continue;
    if (sig.mime === "image/webp") {
      const webpTag = buffer.subarray(8, 12).toString("ascii");
      if (webpTag !== "WEBP") continue;
    }
    return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

/**
 * Shared size + real (magic-byte) file type validation for avatar-style
 * image uploads (team photos, profile photos). Throws UploadValidationError
 * with a message safe to surface inline next to the offending field.
 */
async function validateImageUpload(
  file: File,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError("File exceeds the 5MB size limit.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new UploadValidationError("File must be a JPEG, PNG, or WebP image.");
  }

  return { buffer, ...detected };
}

/**
 * Validates size + real (magic-byte) file type for team member photo
 * uploads, then stores the object in the avatars/ bucket. Returns the
 * object key to persist on TeamMember.photoUrl — not a browser-facing URL,
 * since signed URLs expire and must be minted per-request (see getSignedPhotoUrl).
 */
export async function uploadTeamPhoto(file: File): Promise<string> {
  const { buffer, mime, ext } = await validateImageUpload(file);

  await ensureBucket(BUCKET_AVATARS);
  const key = `team/${crypto.randomUUID()}.${ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_AVATARS, key, buffer, buffer.length, {
    "Content-Type": mime,
  });
  return key;
}

/**
 * Validates a member's uploaded profile photo, then resizes/crops it
 * server-side to a fixed square thumbnail (never storing/serving the
 * original at avatar size, per PRD §4.3/§9) before storing it in the
 * avatars/ bucket. Returns the object key to persist on Profile.avatarUrl.
 */
export async function uploadProfileAvatar(file: File): Promise<string> {
  const { buffer } = await validateImageUpload(file);

  const thumbnail = await sharp(buffer)
    .rotate() // apply EXIF orientation before the fixed-size crop
    .resize(PROFILE_AVATAR_THUMBNAIL_PX, PROFILE_AVATAR_THUMBNAIL_PX, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();

  await ensureBucket(BUCKET_AVATARS);
  const key = `profile/${crypto.randomUUID()}.webp`;
  const minio = getClient();
  await minio.putObject(BUCKET_AVATARS, key, thumbnail, thumbnail.length, {
    "Content-Type": "image/webp",
  });
  return key;
}

/**
 * Returns a browser-facing URL for a team photo. This proxies through our
 * own /api/team/photo route rather than handing back a MinIO presigned URL
 * directly: presigned URLs are stamped with MINIO_ENDPOINT, which is only
 * reachable from wherever the Next.js server can reach MinIO (e.g.
 * "localhost" or the Docker service name) — not necessarily wherever the
 * browser is (a different host, an ngrok tunnel, etc). Proxying keeps the
 * image same-origin with the page that requested it, and keeps MinIO itself
 * off the public internet.
 */
export function getSignedPhotoUrl(key: string | null): string | null {
  if (!key) return null;
  return `/api/team/photo/${key}`;
}

/** Same proxy rationale as getSignedPhotoUrl, for profile avatars. */
export function getProfileAvatarUrl(key: string | null): string | null {
  if (!key) return null;
  return `/api/profile/photo/${key}`;
}

/**
 * Fetches a stored avatar-style image (team photo or profile photo — same
 * bucket, the key's prefix already disambiguates) for streaming through a
 * proxy route.
 */
export async function getAvatarObject(
  key: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  await ensureBucket(BUCKET_AVATARS);
  const minio = getClient();
  try {
    const stat = await minio.statObject(BUCKET_AVATARS, key);
    const stream = await minio.getObject(BUCKET_AVATARS, key);
    return { stream, contentType: stat.metaData["content-type"] || "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteAvatarObject(key: string | null): Promise<void> {
  if (!key) return;
  await ensureBucket(BUCKET_AVATARS);
  const minio = getClient();
  await minio.removeObject(BUCKET_AVATARS, key).catch(() => undefined);
}
