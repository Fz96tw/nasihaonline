"use client";

import { Download } from "lucide-react";
import { formatDuration, formatSize, type RecordingViewJson } from "@/lib/recording-client";

/** Download list for one recording. Links are single-use-ish presigned URLs (15 minutes), so a reload gets fresh ones. */
export function RecordingParts({ view }: { view: RecordingViewJson }) {
  const expires = new Date(view.expiresAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-3">
      {view.status === "processing" && (
        <p className="text-sm text-muted-foreground">Preparing your recording… this page updates on its own.</p>
      )}
      {view.error && (
        <p role="alert" className="text-sm text-destructive">
          {view.status === "failed" ? "The recording didn't finish. " : "Part of the recording didn't finish. "}
          {view.error}
        </p>
      )}
      {view.status === "none" && <p className="text-sm text-muted-foreground">No recording was made in this meeting.</p>}
      {view.parts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {view.parts.map((part) => (
            <li key={part.index} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
              <span className="text-sm">
                Part {part.index}
                <span className="text-muted-foreground">
                  {[formatDuration(part.durationSeconds), formatSize(part.sizeBytes)].filter(Boolean).map((v) => ` · ${v}`).join("")}
                </span>
              </span>
              {part.url ? (
                <a
                  href={part.url}
                  download
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Link unavailable, reload</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.parts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Download links are good for 15 minutes; reload this page for fresh ones. The recording is deleted after {expires}.
        </p>
      )}
    </div>
  );
}
