import "server-only";
import { Client as MinioClient } from "minio";

/**
 * Showup's recordings live in their OWN MinIO bucket, written and read with a
 * scoped user that can only touch that bucket (see
 * scripts/setup-minio-showup-recordings.sh) — never MinIO's root credentials.
 *
 * Two different addresses for the same bucket, on purpose:
 * - egress (LiveKit's recorder, on the same Docker network as MinIO) writes to
 *   the internal `MINIO_ENDPOINT` (http://minio:9000);
 * - the host's browser downloads through a presigned URL, so that URL has to be
 *   signed for a name the browser can reach: `MINIO_PUBLIC_ENDPOINT`.
 */
const BUCKET = process.env.MINIO_RECORDINGS_BUCKET || "showup-recordings";
/** Fresh presigned links are minted per request; they're never stored. */
export const PRESIGN_EXPIRY_SECONDS = 15 * 60;

let client: MinioClient | undefined;

function getPresignClient(): MinioClient | null {
  const accessKey = process.env.MINIO_RECORDINGS_ACCESS_KEY;
  const secretKey = process.env.MINIO_RECORDINGS_SECRET_KEY;
  const endPoint = process.env.MINIO_PUBLIC_ENDPOINT;
  if (!accessKey || !secretKey || !endPoint) return null;
  if (!client) {
    client = new MinioClient({
      endPoint,
      port: Number(process.env.MINIO_PUBLIC_PORT || 443),
      useSSL: process.env.MINIO_PUBLIC_USE_SSL !== "false",
      accessKey,
      secretKey,
      // Setting the region makes presigning a purely local computation; without
      // it the SDK would call the public endpoint first to discover it.
      region: "us-east-1",
    });
  }
  return client;
}

/** S3 target handed to LiveKit egress. Null when recording storage isn't configured. */
export function getEgressS3Config(): {
  accessKey: string;
  secret: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
} | null {
  const accessKey = process.env.MINIO_RECORDINGS_ACCESS_KEY;
  const secret = process.env.MINIO_RECORDINGS_SECRET_KEY;
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!accessKey || !secret || !endpoint) return null;
  return { accessKey, secret, bucket: BUCKET, endpoint, forcePathStyle: true, region: "us-east-1" };
}

/** Short-lived download link for one recording part (forces a save-as with a friendly filename). */
export async function presignRecordingDownload(objectKey: string, downloadFilename: string): Promise<string | null> {
  const minio = getPresignClient();
  if (!minio) return null;
  try {
    return await minio.presignedGetObject(BUCKET, objectKey, PRESIGN_EXPIRY_SECONDS, {
      "response-content-disposition": `attachment; filename="${downloadFilename}"`,
    });
  } catch (error) {
    console.error("[recordings-storage] Failed to presign download", error);
    return null;
  }
}
