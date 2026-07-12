import "server-only";
import { Client as MinioClient } from "minio";

const BUCKET_AVATARS = process.env.MINIO_BUCKET_AVATARS || "avatars";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

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
 * Validates size + real (magic-byte) file type for team member photo
 * uploads, then stores the object in the avatars/ bucket. Returns the
 * object key to persist on TeamMember.photoUrl — not a browser-facing URL,
 * since signed URLs expire and must be minted per-request (see getSignedPhotoUrl).
 */
export async function uploadTeamPhoto(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError("File exceeds the 5MB size limit.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new UploadValidationError("File must be a JPEG, PNG, or WebP image.");
  }

  await ensureBucket(BUCKET_AVATARS);
  const key = `team/${crypto.randomUUID()}.${detected.ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_AVATARS, key, buffer, buffer.length, {
    "Content-Type": detected.mime,
  });
  return key;
}

export async function getSignedPhotoUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  await ensureBucket(BUCKET_AVATARS);
  const minio = getClient();
  return minio.presignedGetObject(BUCKET_AVATARS, key, SIGNED_URL_EXPIRY_SECONDS);
}

export async function deleteTeamPhoto(key: string | null): Promise<void> {
  if (!key) return;
  await ensureBucket(BUCKET_AVATARS);
  const minio = getClient();
  await minio.removeObject(BUCKET_AVATARS, key).catch(() => undefined);
}
