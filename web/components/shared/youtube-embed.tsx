"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/**
 * Click-to-play YouTube embed for a link pasted into plain text (forum
 * posts, via lib/linkify.tsx's `youtubeBudget` option). Shows the video's
 * thumbnail with a play button; the iframe only mounts on click so a thread
 * full of links doesn't load a player per link. Built from <span>s (not
 * <div>s) because it renders inside the post's <p>. A dedicated "use client"
 * file for the same reason as VideoEmbed.
 */
export function YoutubeEmbed({ embedUrl, thumbnailUrl }: { embedUrl: string; thumbnailUrl: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <span className="my-2 block aspect-video w-full max-w-lg overflow-hidden rounded-md border bg-black">
      {playing ? (
        <iframe
          src={`${embedUrl}?autoplay=1`}
          title="YouTube video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" aria-label="Play video" className="relative block h-full w-full" onClick={() => setPlaying(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-white">
              <Play className="h-6 w-6 fill-current" />
            </span>
          </span>
        </button>
      )}
    </span>
  );
}
