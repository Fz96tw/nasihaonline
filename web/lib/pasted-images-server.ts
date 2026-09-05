import "server-only";
import { db } from "@/lib/db";
import { deletePastedImageObject } from "@/lib/storage";
import { PastedImageOwnerType, Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import {
  isThreadVisible,
  EVENT_THREAD_ACCESS_SELECT,
  KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
  OWN_THREAD_ACCESS_SELECT,
  FORUM_COMMUNITY_ACCESS_SELECT,
} from "@/lib/forums-server";
import { canViewKnowledgeItem } from "@/lib/library-server";
import { getMemberCommunityContext } from "@/lib/profile-server";

export class TooManyPastedImagesError extends Error {}

/**
 * A body can reference at most this many pasted images — generous enough
 * for a screenshot-heavy reply/post without one body pulling down hundreds
 * of MB of images on render.
 */
export const MAX_PASTED_IMAGES_PER_BODY = 6;

const OWNER_URL_PREFIX: Record<PastedImageOwnerType, string> = {
  [PastedImageOwnerType.forum_post]: "/api/forums/post-image/",
  [PastedImageOwnerType.inbox_message]: "/api/inbox/message-image/",
  [PastedImageOwnerType.library_item]: "/api/library/body-image/",
};

const OWNER_ID_FIELD: Record<PastedImageOwnerType, "forumPostId" | "inboxMessageId" | "knowledgeItemId"> = {
  [PastedImageOwnerType.forum_post]: "forumPostId",
  [PastedImageOwnerType.inbox_message]: "inboxMessageId",
  [PastedImageOwnerType.library_item]: "knowledgeItemId",
};

// Forum/Inbox bodies are plain text carrying a `![alt](url)` token per
// pasted image (see lib/linkify.tsx); a Library blog_post body is
// Tiptap-authored HTML carrying `<img src="...">` instead.
const MARKDOWN_IMAGE_URL_PATTERN = /!\[[^\]]*\]\(([^\s()]+)\)/g;
const HTML_IMG_SRC_PATTERN = /<img\b[^>]*\bsrc="([^"]*)"/gi;

/**
 * Distinct pasted-image object keys actually referenced in a body, matched
 * against this ownerType's known proxy URL prefix so an unrelated link or
 * externally-hosted image URL can't be mistaken for one of ours.
 */
function extractPastedImageKeys(body: string, ownerType: PastedImageOwnerType): string[] {
  const prefix = OWNER_URL_PREFIX[ownerType];
  const pattern =
    ownerType === PastedImageOwnerType.library_item ? HTML_IMG_SRC_PATTERN : MARKDOWN_IMAGE_URL_PATTERN;
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(body)) !== null) {
    const url = match[1];
    if (url.startsWith(prefix)) keys.add(url.slice(prefix.length));
  }
  return Array.from(keys);
}

/**
 * Pure count check, meant to be called by createForumPost/sendMessage/
 * createKnowledgeItem etc. BEFORE persisting the post/message/item itself,
 * so a rejected save never loses the caller's text edit.
 */
export function countPastedImageReferences(body: string, ownerType: PastedImageOwnerType): number {
  return extractPastedImageKeys(body, ownerType).length;
}

/**
 * Records a freshly uploaded pasted image, unlinked until linkPastedImages
 * confirms it's actually referenced by a saved body.
 */
export async function recordPastedImageUpload(params: {
  key: string;
  uploaderId: string;
  ownerType: PastedImageOwnerType;
}): Promise<void> {
  await db.pastedImage.create({
    data: { key: params.key, uploaderId: params.uploaderId, ownerType: params.ownerType },
  });
}

/**
 * Reconciles PastedImage rows against a just-saved body: links newly
 * referenced uploads (made by this uploader, still unlinked) to `ownerId`,
 * and deletes any previously-linked row whose key is no longer referenced
 * (an edit that removed the image) — both the DB row and its MinIO object,
 * since onDelete: Cascade only reaches the DB row. Also defensively
 * enforces MAX_PASTED_IMAGES_PER_BODY even though callers should already
 * reject via countPastedImageReferences before persisting the body itself.
 */
export async function linkPastedImages(params: {
  ownerType: PastedImageOwnerType;
  ownerId: string;
  body: string;
  uploaderId: string;
}): Promise<void> {
  const { ownerType, ownerId, body, uploaderId } = params;
  const idField = OWNER_ID_FIELD[ownerType];
  const referencedKeys = extractPastedImageKeys(body, ownerType);

  if (referencedKeys.length > MAX_PASTED_IMAGES_PER_BODY) {
    throw new TooManyPastedImagesError(`A post can reference at most ${MAX_PASTED_IMAGES_PER_BODY} pasted images.`);
  }

  if (referencedKeys.length > 0) {
    await db.pastedImage.updateMany({
      where: { key: { in: referencedKeys }, uploaderId, ownerType, [idField]: null },
      data: { [idField]: ownerId },
    });
  }

  const previouslyLinked = await db.pastedImage.findMany({
    where: { ownerType, [idField]: ownerId },
    select: { id: true, key: true },
  });
  const stillReferenced = new Set(referencedKeys);
  const toRemove = previouslyLinked.filter((image) => !stillReferenced.has(image.key));
  if (toRemove.length === 0) return;

  await db.pastedImage.deleteMany({ where: { id: { in: toRemove.map((image) => image.id) } } });
  await Promise.all(toRemove.map((image) => deletePastedImageObject(image.key)));
}

/**
 * Deletes every PastedImage linked to a post/message/item — both the DB
 * rows and their MinIO objects — called when the owning record itself is
 * deleted (deleteForumPost, deleteKnowledgeItem; Inbox messages have no
 * delete path today, so no caller needs this for ownerType inbox_message
 * yet).
 */
export async function unlinkAndDeleteAllPastedImages(params: {
  ownerType: PastedImageOwnerType;
  ownerId: string;
}): Promise<void> {
  const idField = OWNER_ID_FIELD[params.ownerType];
  const images = await db.pastedImage.findMany({
    where: { ownerType: params.ownerType, [idField]: params.ownerId },
    select: { id: true, key: true },
  });
  if (images.length === 0) return;

  await db.pastedImage.deleteMany({ where: { id: { in: images.map((image) => image.id) } } });
  await Promise.all(images.map((image) => deletePastedImageObject(image.key)));
}

export type PastedImageAccessRecord = {
  uploaderId: string;
  ownerType: PastedImageOwnerType;
  forumPostId: string | null;
  inboxMessageId: string | null;
  knowledgeItemId: string | null;
};

function isPrivilegedUser(user: UserModel): boolean {
  return user.role === Role.admin || user.role === Role.moderator;
}

/**
 * Whether `actingUser` may view a pasted image — dispatches by ownerType
 * and re-runs the exact visibility rule the owning content's own read path
 * already applies (forum thread visibility via isThreadVisible, Inbox
 * sender/recipient, canViewKnowledgeItem), so a pasted image is never more
 * visible than the post/message/item it's embedded in. An unlinked image
 * (uploaded but not yet saved into any body, e.g. an abandoned draft) is
 * visible only to its uploader.
 */
export async function canViewPastedImage(image: PastedImageAccessRecord, actingUser: UserModel): Promise<boolean> {
  if (image.ownerType === PastedImageOwnerType.forum_post) {
    if (!image.forumPostId) return image.uploaderId === actingUser.id;
    const post = await db.forumPost.findUnique({
      where: { id: image.forumPostId },
      select: {
        thread: {
          select: {
            event: EVENT_THREAD_ACCESS_SELECT,
            knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
            forum: FORUM_COMMUNITY_ACCESS_SELECT,
            ...OWN_THREAD_ACCESS_SELECT,
          },
        },
      },
    });
    if (!post) return false;
    const member = await getMemberCommunityContext(actingUser.id);
    return isThreadVisible(post.thread, actingUser.id, isPrivilegedUser(actingUser), member);
  }

  if (image.ownerType === PastedImageOwnerType.inbox_message) {
    if (!image.inboxMessageId) return image.uploaderId === actingUser.id;
    const message = await db.inboxMessage.findUnique({
      where: { id: image.inboxMessageId },
      select: { senderId: true, recipientId: true },
    });
    if (!message) return false;
    return message.senderId === actingUser.id || message.recipientId === actingUser.id;
  }

  // library_item
  if (!image.knowledgeItemId) return image.uploaderId === actingUser.id;
  const item = await db.knowledgeItem.findUnique({
    where: { id: image.knowledgeItemId },
    select: { visibility: true, contributorId: true, invitees: { select: { userId: true } } },
  });
  if (!item) return false;
  return canViewKnowledgeItem(item, actingUser);
}
