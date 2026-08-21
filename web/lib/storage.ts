import "server-only";
import { Client as MinioClient } from "minio";
import sharp from "sharp";

const BUCKET_AVATARS = process.env.MINIO_BUCKET_AVATARS || "avatars";
// Knowledge Library document/article/case-study binaries (§4.9) — never video.
const BUCKET_DOCUMENTS = process.env.MINIO_BUCKET_DOCUMENTS || "documents";
// Blog post hero images (§4.8) and other non-avatar image attachments.
const BUCKET_ATTACHMENTS = process.env.MINIO_BUCKET_ATTACHMENTS || "attachments";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

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

// Tracked per-bucket-name — a single shared flag would short-circuit and
// never create the second bucket once any one bucket had been ensured.
const ensuredBuckets = new Set<string>();

async function ensureBucket(bucket: string) {
  if (ensuredBuckets.has(bucket)) return;
  const minio = getClient();
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) await minio.makeBucket(bucket);
  ensuredBuckets.add(bucket);
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

// KnowledgeAttachment binaries are "document/article/case-study only —
// never for video" (§4.9). No fixed magic-byte check (unlike
// validateImageUpload) since legitimate documents come in many binary
// formats pdf.js/the OS can't sniff from a handful of header bytes — instead
// this validates the browser-declared MIME type against an explicit
// allowlist. That allowlist doubles as XSS hardening: without it, an
// uploaded .html/.svg file would be stored and later served back by
// /api/library/document with a Content-Type that renders/executes in the
// browser rather than downloading.
const VIDEO_EXTENSIONS = ["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v"];
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

/**
 * Validates a Knowledge Library document upload (size, not-a-video, and
 * MIME allowlist), then stores it in the documents/ bucket. Returns the
 * fields needed to populate a KnowledgeAttachment row — objectKey is not a
 * servable URL, same convention as Profile.avatarUrl.
 */
export async function uploadKnowledgeDocument(
  file: File,
): Promise<{ objectKey: string; fileName: string; mimeType: string; sizeBytes: number }> {
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new UploadValidationError("File exceeds the 20MB size limit.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(ext)) {
    throw new UploadValidationError(
      "Video files are not accepted here — submit a recorded lecture as a YouTube link instead.",
    );
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
    throw new UploadValidationError(
      "Unsupported file type — upload a PDF, Word, PowerPoint, plain text, or image (JPEG/PNG/WebP/GIF/BMP) file.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await ensureBucket(BUCKET_DOCUMENTS);
  const objectKey = `library/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const minio = getClient();
  const mimeType = file.type || "application/octet-stream";
  await minio.putObject(BUCKET_DOCUMENTS, objectKey, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
  return { objectKey, fileName: file.name, mimeType, sizeBytes: file.size };
}

/** Proxy URL rationale matches getSignedPhotoUrl — keeps MinIO off the public internet. */
export function getKnowledgeDocumentUrl(objectKey: string): string {
  return `/api/library/document/${objectKey}`;
}

/**
 * Same documents/ bucket and getKnowledgeDocumentObject as the Knowledge
 * Library, but ReviewItemAttachment rows aren't visible to
 * /api/library/document's KnowledgeAttachment-only ownership check — Peer
 * Review submissions need their own proxy route/URL so canViewReviewItem
 * (not canViewKnowledgeItem) gates access instead.
 */
export function getReviewDocumentUrl(objectKey: string): string {
  return `/api/review-feedback/document/${objectKey}`;
}

/**
 * Fetches a stored Knowledge Library document (documents/ bucket) for
 * streaming through the /api/library/document proxy — same shape/rationale
 * as getAttachmentObject/getAvatarObject, just the documents bucket.
 */
export async function getKnowledgeDocumentObject(
  objectKey: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  await ensureBucket(BUCKET_DOCUMENTS);
  const minio = getClient();
  try {
    const stat = await minio.statObject(BUCKET_DOCUMENTS, objectKey);
    const stream = await minio.getObject(BUCKET_DOCUMENTS, objectKey);
    return { stream, contentType: stat.metaData["content-type"] || "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteKnowledgeDocument(objectKey: string | null): Promise<void> {
  if (!objectKey) return;
  await ensureBucket(BUCKET_DOCUMENTS);
  const minio = getClient();
  await minio.removeObject(BUCKET_DOCUMENTS, objectKey).catch(() => undefined);
}

/**
 * Validates and stores an Event's optional hero image (§4.6) in the
 * attachments/ bucket. Reuses the same size + magic-byte image validation
 * as avatar uploads — hero images are ordinary web images, just not the
 * avatars/-bucket kind. Returns the object key to persist on
 * Event.heroImageUrl.
 */
export async function uploadEventHeroImage(file: File): Promise<string> {
  const { buffer, ext, mime } = await validateImageUpload(file);

  await ensureBucket(BUCKET_ATTACHMENTS);
  const key = `event-hero/${crypto.randomUUID()}.${ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_ATTACHMENTS, key, buffer, buffer.length, {
    "Content-Type": mime,
  });
  return key;
}

// Sentinel stored on Event.heroImageUrl (in place of a real MinIO object
// key) for a restricted event created without a hero image upload — lets
// every existing getEventHeroImageUrl caller pick up the fallback for free
// instead of threading `visibility` through each read path.
export const RESTRICTED_EVENT_DEFAULT_HERO_KEY = "default:restricted-event";

export function getEventHeroImageUrl(key: string | null): string | null {
  if (!key) return null;
  if (key === RESTRICTED_EVENT_DEFAULT_HERO_KEY) return "/images/restricted-event.jpg";
  return `/api/events/hero/${key}`;
}

/** Called when an edit replaces an event's existing hero image. */
export async function deleteEventHeroImage(key: string | null): Promise<void> {
  if (!key || key === RESTRICTED_EVENT_DEFAULT_HERO_KEY) return;
  await ensureBucket(BUCKET_ATTACHMENTS);
  const minio = getClient();
  await minio.removeObject(BUCKET_ATTACHMENTS, key).catch(() => undefined);
}

/**
 * Same validation/storage shape as uploadEventHeroImage, for a Board
 * Announcement's single optional cover image (§4.10). Returns the object
 * key to persist on Announcement.heroImageUrl.
 */
export async function uploadAnnouncementHeroImage(file: File): Promise<string> {
  const { buffer, ext, mime } = await validateImageUpload(file);

  await ensureBucket(BUCKET_ATTACHMENTS);
  const key = `announcement-hero/${crypto.randomUUID()}.${ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_ATTACHMENTS, key, buffer, buffer.length, {
    "Content-Type": mime,
  });
  return key;
}

export function getAnnouncementHeroImageUrl(key: string | null): string | null {
  if (!key) return null;
  return `/api/announcements/hero/${key}`;
}

/**
 * Same validation/storage shape as uploadAnnouncementHeroImage, for a
 * Survey's single optional cover image — shown on the compose form, the
 * invite email, the public respond page, and the What's New feed row.
 * Returns the object key to persist on Survey.heroImageUrl.
 */
export async function uploadSurveyHeroImage(file: File): Promise<string> {
  const { buffer, ext, mime } = await validateImageUpload(file);

  await ensureBucket(BUCKET_ATTACHMENTS);
  const key = `survey-hero/${crypto.randomUUID()}.${ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_ATTACHMENTS, key, buffer, buffer.length, {
    "Content-Type": mime,
  });
  return key;
}

// Same sentinel approach as RESTRICTED_EVENT_DEFAULT_HERO_KEY — stored on
// Survey.heroImageUrl in place of a real MinIO object key when a survey is
// created without a cover image upload, so every existing
// getSurveyHeroImageUrl caller picks up the fallback for free.
export const DEFAULT_SURVEY_HERO_KEY = "default:quick-survey";

export function getSurveyHeroImageUrl(key: string | null): string | null {
  if (!key) return null;
  if (key === DEFAULT_SURVEY_HERO_KEY) return "/images/quick-survey.jpg";
  return `/api/surveys/hero/${key}`;
}

/**
 * Same validation/storage shape as uploadEventHeroImage, for a Knowledge
 * Library item's optional cover image (§4.9, including the blog_post
 * content type). Returns the object key to persist on
 * KnowledgeItem.heroImageUrl.
 */
export async function uploadKnowledgeItemHeroImage(file: File): Promise<string> {
  const { buffer, ext, mime } = await validateImageUpload(file);

  await ensureBucket(BUCKET_ATTACHMENTS);
  const key = `library-hero/${crypto.randomUUID()}.${ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_ATTACHMENTS, key, buffer, buffer.length, {
    "Content-Type": mime,
  });
  return key;
}

export function getKnowledgeItemHeroImageUrl(key: string | null): string | null {
  if (!key) return null;
  return `/api/library/hero/${key}`;
}

/** Same shape/rationale as deleteEventHeroImage — called when an edit replaces a library item's existing hero image. */
export async function deleteKnowledgeItemHeroImage(key: string | null): Promise<void> {
  if (!key) return;
  await ensureBucket(BUCKET_ATTACHMENTS);
  const minio = getClient();
  await minio.removeObject(BUCKET_ATTACHMENTS, key).catch(() => undefined);
}

/**
 * Same validation/storage shape as uploadEventHeroImage, for an in-app
 * meeting waiting room's optional organizer message image (Event and
 * MeetingRequest both use this). Returns the object key to persist on
 * *.meetingOrganizerMessageImageKey. Retrieval reuses getAttachmentObject
 * below — no dedicated read helper needed, same bucket.
 */
export async function uploadMeetingMessageImage(file: File): Promise<string> {
  const { buffer, ext, mime } = await validateImageUpload(file);

  await ensureBucket(BUCKET_ATTACHMENTS);
  const key = `meeting-message/${crypto.randomUUID()}.${ext}`;
  const minio = getClient();
  await minio.putObject(BUCKET_ATTACHMENTS, key, buffer, buffer.length, {
    "Content-Type": mime,
  });
  return key;
}

/** Same shape/rationale as deleteEventHeroImage, for uploadMeetingMessageImage. */
export async function deleteMeetingMessageImage(key: string | null): Promise<void> {
  if (!key) return;
  await ensureBucket(BUCKET_ATTACHMENTS);
  const minio = getClient();
  await minio.removeObject(BUCKET_ATTACHMENTS, key).catch(() => undefined);
}

/** Same shape/rationale as getEventHeroImageUrl, for uploadMeetingMessageImage. */
export function getMeetingMessageImageUrl(key: string | null): string | null {
  if (!key) return null;
  return `/api/meet/message-image/${key}`;
}

/**
 * Fetches a stored blog hero image (attachments/ bucket) for streaming
 * through the /api/blog/hero proxy — same shape/rationale as
 * getAvatarObject, just the other bucket.
 */
export async function getAttachmentObject(
  key: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
  await ensureBucket(BUCKET_ATTACHMENTS);
  const minio = getClient();
  try {
    const stat = await minio.statObject(BUCKET_ATTACHMENTS, key);
    const stream = await minio.getObject(BUCKET_ATTACHMENTS, key);
    return { stream, contentType: stat.metaData["content-type"] || "application/octet-stream" };
  } catch {
    return null;
  }
}
