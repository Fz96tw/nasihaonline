import "server-only";
import { Client as MinioClient } from "minio";

/**
 * Deliberately a SEPARATE MinIO client/credential pair from lib/storage.ts's
 * shared getClient() (avatars/documents/attachments buckets) — objective 4
 * decided against reusing the shared MINIO_ACCESS_KEY/MINIO_SECRET_KEY root
 * creds for recordings, since those are the shared "nasiha"/"nasiha123" dev
 * creds with full-account access. This uses a dedicated, narrowly-scoped
 * MinIO user (`livekit-egress`) whose policy only grants
 * PutObject/GetObject/ListBucket/AbortMultipartUpload on the
 * livekit-recordings bucket, provisioned via `mc admin user add` against
 * the running minio container — see the objective's Planning decisions for
 * the full rationale.
 */
const BUCKET_RECORDINGS = process.env.MINIO_BUCKET_RECORDINGS || "livekit-recordings";
const PRESIGN_EXPIRY_SECONDS = 5 * 60;

let client: MinioClient | undefined;

function getRecordingsClient(): MinioClient | null {
  if (!process.env.MINIO_RECORDINGS_ACCESS_KEY || !process.env.MINIO_RECORDINGS_SECRET_KEY) return null;
  if (!client) {
    client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_RECORDINGS_ACCESS_KEY,
      secretKey: process.env.MINIO_RECORDINGS_SECRET_KEY,
    });
  }
  return client;
}

/** S3-shaped config LiveKit's egress request writes segments to — see lib/livekit-egress.ts. */
export function getRecordingsS3Config(): {
  accessKey: string;
  secret: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
} | null {
  const accessKey = process.env.MINIO_RECORDINGS_ACCESS_KEY;
  const secret = process.env.MINIO_RECORDINGS_SECRET_KEY;
  if (!accessKey || !secret) return null;
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const endpoint = `${useSSL ? "https" : "http"}://${process.env.MINIO_ENDPOINT || "localhost"}:${process.env.MINIO_PORT || 9000}`;
  return { accessKey, secret, bucket: BUCKET_RECORDINGS, endpoint, forcePathStyle: true };
}

/**
 * Mints a short-lived presigned GET URL for one recording segment — used by
 * the streaming route (app/api/events/[id]/recording/[recordingId]/route.ts
 * and its MeetingRequest counterpart) to 302-redirect an already-authorized
 * caller straight to MinIO, so the browser talks to MinIO directly and gets
 * native HTTP Range support (streaming/seeking) instead of the app server
 * proxying every byte. Deliberately NOT stored/cached anywhere — minted
 * fresh per request, since a stored presigned URL would go stale sitting in
 * a DB row (MinIO/S3 presigned URLs are capped well under a meeting's
 * likely shelf life).
 */
export async function getRecordingPresignedUrl(objectKey: string): Promise<string | null> {
  const minio = getRecordingsClient();
  if (!minio) return null;
  try {
    return await minio.presignedGetObject(BUCKET_RECORDINGS, objectKey, PRESIGN_EXPIRY_SECONDS);
  } catch (error) {
    console.error("[recordings-storage] Failed to presign recording URL", error);
    return null;
  }
}
