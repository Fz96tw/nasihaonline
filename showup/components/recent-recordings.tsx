"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSavedRecordings, recordingLink } from "@/lib/recording-client";
import type { SavedRecording } from "@/lib/room-types";

/** Recording links saved on this device (recovery path 1), plus the entry point to code + passcode recovery. */
export function RecentRecordings() {
  const [saved, setSaved] = useState<SavedRecording[]>([]);
  useEffect(() => setSaved(readSavedRecordings()), []);

  return (
    <section className="flex flex-col gap-2 text-sm">
      {saved.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-4">
          <h2 className="font-semibold">Recordings on this device</h2>
          <ul className="flex flex-col gap-1">
            {saved.map((rec) => (
              <li key={rec.recId}>
                <Link href={recordingLink(rec.recId, rec.hostSecret)} className="underline">
                  Recording from {new Date(rec.savedAt).toLocaleString()}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-center text-muted-foreground">
        Hosts can record a showup session; everyone sees a banner while it runs.{" "}
        <Link href="/recover" className="underline">
          Get my recording
        </Link>
      </p>
    </section>
  );
}
