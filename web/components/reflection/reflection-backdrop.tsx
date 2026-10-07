"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The Weekly Reflection look, shared by the feed panel and the thread-page
 * hero: a background image filling the whole box, a dark gradient over it so
 * the white text on top stays readable on any photo, and `children` layered
 * above. With no image (empty images folder) or one that fails to load, a
 * brand-blue gradient stands in, so the look never breaks. The text is always
 * real DOM text passed as children, never part of the image.
 */
export function ReflectionBackdrop({
  imageUrl,
  className,
  children,
}: {
  imageUrl: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  // Tracks the specific URL that failed, so a later different image still tries to load.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showImage = !!imageUrl && brokenUrl !== imageUrl;
  const imgRef = useRef<HTMLImageElement>(null);

  // A server-rendered <img> can fail before React attaches onError, which then
  // never fires — so also check once mounted whether it already failed (same
  // approach as components/ui/avatar.tsx).
  useEffect(() => {
    const img = imgRef.current;
    if (imageUrl && img && img.complete && img.naturalWidth === 0) setBrokenUrl(imageUrl);
  }, [imageUrl]);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-gradient-to-br from-blue-700 via-blue-900 to-slate-950 text-white [text-shadow:0_1px_8px_rgba(0,0,0,.5)]",
        className,
      )}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- static file from public/, sized by the container (object-cover); same rationale as the feed's other hero images
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          onError={() => setBrokenUrl(imageUrl)}
        />
      )}
      {/* A light scrim over the whole panel (text sits at the top, middle and bottom), a little more at the
          edges. Kept gentle so the photo still reads as a photo; the white text stays legible on bright
          images through the soft text-shadow on the wrapper above rather than a heavy overlay. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/35 via-black/15 to-black/40" aria-hidden="true" />
      {children}
    </div>
  );
}
