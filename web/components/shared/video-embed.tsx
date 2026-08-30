"use client";

import { useState } from "react";

/**
 * Inline embedded shared quick recording (shared video-sharing
 * infrastructure) — rendered by lib/linkify.tsx wherever a `![alt](url)`
 * token's url points at the recording-proxy route. A dedicated "use client"
 * file (not defined inline in linkify.tsx, which has no client boundary of
 * its own) since it needs local state, same reason components/ui/dialog.tsx
 * lives separately from linkify.tsx's own renderImage.
 *
 * linkifyText renders synchronously from plain text with no DB lookup, so
 * whether the recording still exists can't be known at render time — this
 * relies on the <video>'s own onError (its `src` request 410s once the
 * recording is deleted, or otherwise fails) to swap in a "deleted" message
 * instead of a broken player.
 */
export function VideoEmbed({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="my-1 text-sm italic text-muted-foreground">This video was deleted by its owner.</p>;
  }

  return (
    <video
      controls
      preload="metadata"
      src={url}
      onError={() => setFailed(true)}
      className="my-1 block max-h-80 max-w-full rounded-md border"
    />
  );
}
