"use client";

import { useCallback, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";
import { countPastedImageTokens } from "@/lib/linkify";

const MAX_IMAGES_PER_BODY = 6;

/**
 * Uploads a single pasted/dropped image file to `uploadUrl` (one of the
 * app's paste-image endpoints) and returns its embeddable url. Shared by
 * usePasteImageUpload (plain-textarea composers, which insert a
 * `![](url)` token) and the Library Tiptap editor (which inserts a real
 * image node instead) so both go through identical CSRF/error handling.
 */
export async function uploadPastedImage(uploadUrl: string, file: File): Promise<string> {
  const csrfToken = await getCsrfToken();
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "x-csrf-token": csrfToken },
    body: formData,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(typeof payload?.error === "string" ? payload.error : "Image upload failed.");
  }
  const { url } = await res.json();
  return url;
}

/**
 * Shared clipboard paste-to-upload handler for the app's plain-textarea
 * composers (Forum new-thread/reply/edit; later Inbox reply/new-message).
 * On paste, if the clipboard carries an image, uploads it to `uploadUrl`
 * and inserts a `![](url)` token via `onInserted` — the caller decides
 * where in its value that token goes (e.g. at the caret). Locally caps at
 * MAX_IMAGES_PER_BODY images already present in `value` as a UX nicety —
 * the server (lib/pasted-images-server.ts's MAX_PASTED_IMAGES_PER_BODY) is
 * the real enforcement point, since this client-side count is trivially
 * bypassable.
 */
export function usePasteImageUpload({
  uploadUrl,
  value,
  onInserted,
}: {
  uploadUrl: string;
  value: string;
  onInserted: (markdown: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const item = Array.from(event.clipboardData.items).find((candidate) => candidate.type.startsWith("image/"));
      if (!item) return;

      event.preventDefault();
      setError(null);

      if (countPastedImageTokens(value) >= MAX_IMAGES_PER_BODY) {
        setError(`You can paste at most ${MAX_IMAGES_PER_BODY} images per post.`);
        return;
      }

      const file = item.getAsFile();
      if (!file) return;

      setUploading(true);
      void (async () => {
        try {
          const url = await uploadPastedImage(uploadUrl, file);
          onInserted(`![](${url})`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Image upload failed.");
        } finally {
          setUploading(false);
        }
      })();
    },
    [uploadUrl, value, onInserted],
  );

  return { onPaste, uploading, error };
}
