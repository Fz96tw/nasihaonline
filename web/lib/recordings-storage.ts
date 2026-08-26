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

// Deliberately MINIO_PUBLIC_* (s3.nasihaforyou.org), not MINIO_ENDPOINT/
// MINIO_PORT/MINIO_USE_SSL — those point at the Docker-internal "minio"
// hostname, which is correct for lib/storage.ts's app-server-to-MinIO
// traffic but unreachable by the two external parties these functions
// actually serve: LiveKit Cloud's remote egress workers (getRecordingsS3Config)
// and a member's own browser, redirected to a presigned URL minted by
// getRecordingPresignedUrl below. See the nginx-proxy-manager setup in
// scripts/setup-minio-recordings.sh's comment header.
function getRecordingsClient(): MinioClient | null {
  if (!process.env.MINIO_RECORDINGS_ACCESS_KEY || !process.env.MINIO_RECORDINGS_SECRET_KEY) return null;
  if (!process.env.MINIO_PUBLIC_ENDPOINT) return null;
  if (!client) {
    client = new MinioClient({
      endPoint: process.env.MINIO_PUBLIC_ENDPOINT,
      port: Number(process.env.MINIO_PUBLIC_PORT || 443),
      useSSL: process.env.MINIO_PUBLIC_USE_SSL !== "false",
      accessKey: process.env.MINIO_RECORDINGS_ACCESS_KEY,
      secretKey: process.env.MINIO_RECORDINGS_SECRET_KEY,
      // Without this, the SDK auto-discovers the bucket's region via a live
      // call on first use (the region is part of the SigV4 signing string,
      // needed even just to presign) — that call goes to the public
      // endpoint above, which this app server can't reach (same host as
      // the reverse proxy fronting it, hairpin NAT). Setting it explicitly
      // makes presigning purely local, no network round-trip at all.
      // MinIO's server-side default, unchanged by this deploy's config.
      region: "us-east-1",
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
  region: string;
} | null {
  const accessKey = process.env.MINIO_RECORDINGS_ACCESS_KEY;
  const secret = process.env.MINIO_RECORDINGS_SECRET_KEY;
  const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT;
  if (!accessKey || !secret || !publicEndpoint) return null;
  const useSSL = process.env.MINIO_PUBLIC_USE_SSL !== "false";
  const endpoint = `${useSSL ? "https" : "http"}://${publicEndpoint}:${process.env.MINIO_PUBLIC_PORT || 443}`;
  // Same region-ambiguity root cause as getRecordingsClient() above —
  // LiveKit Cloud's egress workers are genuinely external so this hasn't
  // been observed to fail, but there's no reason to leave it unset.
  return { accessKey, secret, bucket: BUCKET_RECORDINGS, endpoint, forcePathStyle: true, region: "us-east-1" };
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
 *
 * Pass `downloadFilename` for the "Download recording" button variant — it
 * asks MinIO to echo back a `response-content-disposition: attachment`
 * header on the object response, which is what makes the browser save the
 * file instead of opening the video inline (the plain "Watch recording"
 * link omits this, since scrubbing/streaming wants the inline player).
 */
export async function getRecordingPresignedUrl(objectKey: string, downloadFilename?: string): Promise<string | null> {
  const minio = getRecordingsClient();
  if (!minio) return null;
  try {
    const reqParams = downloadFilename
      ? { "response-content-disposition": `attachment; filename="${downloadFilename}"` }
      : undefined;
    return await minio.presignedGetObject(BUCKET_RECORDINGS, objectKey, PRESIGN_EXPIRY_SECONDS, reqParams);
  } catch (error) {
    console.error("[recordings-storage] Failed to presign recording URL", error);
    return null;
  }
}
