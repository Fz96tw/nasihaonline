"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShowupRoom } from "@/components/showup-room";
import { RECORDED_FLAG } from "@/components/recording-controls";
import { recordingLink } from "@/lib/recording-client";
import { CREDENTIALS_STORAGE_KEY, type RoomCredentials } from "@/lib/room-types";

function storeCredentials(credentials: RoomCredentials) {
  try {
    sessionStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Storage unavailable: the meeting still works, it just can't survive a refresh.
  }
}

/**
 * A host who refreshes the tab still holds the hostSecret from when they
 * started. Presenting it re-runs /api/rooms/start as the same host: it keeps
 * their identity, mints a fresh token and pushes the code's claim out. If the
 * server can't be reached we fall back to the stored token (still valid); if
 * the claim is lost (another host has the code) the stored meeting is gone.
 */
async function reclaimHost(stored: RoomCredentials): Promise<RoomCredentials | "lost"> {
  try {
    const res = await fetch("/api/rooms/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: stored.code, name: stored.name, hostSecret: stored.hostSecret }),
    });
    if (res.ok) return { ...((await res.json()) as RoomCredentials), passcode: stored.passcode };
    if (res.status === 409) return "lost";
  } catch {
    // Network problem: keep the stored credentials.
  }
  return stored;
}

function readCredentials(): RoomCredentials | null {
  try {
    const raw = sessionStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomCredentials>;
    if (!parsed.token || !parsed.serverUrl || !parsed.identity || !parsed.code) return null;
    return parsed as RoomCredentials;
  } catch {
    return null;
  }
}

/**
 * Reads the credentials the landing page stored for this tab. There is nothing
 * to render without them (opening /room directly, or in a fresh tab), so those
 * visitors are sent back to the landing page.
 */
export default function RoomPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  // LiveKit disconnects on page unload (refresh, tab close) and reports it like a deliberate leave.
  // Only a deliberate leave may clear the stored credentials, otherwise a refresh loses the
  // hostSecret and can't reclaim host.
  const unloading = useRef(false);

  useEffect(() => {
    const mark = () => {
      unloading.current = true;
    };
    window.addEventListener("beforeunload", mark);
    window.addEventListener("pagehide", mark);
    return () => {
      window.removeEventListener("beforeunload", mark);
      window.removeEventListener("pagehide", mark);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const found = readCredentials();
    if (!found) {
      router.replace("/");
      return;
    }
    if (found.role !== "host" || !found.hostSecret) {
      setCredentials(found);
      return;
    }
    reclaimHost(found).then((result) => {
      if (cancelled) return;
      if (result === "lost") {
        router.replace("/");
        return;
      }
      storeCredentials(result);
      setCredentials(result);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!credentials) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">Connecting…</p>
      </div>
    );
  }

  return (
    <ShowupRoom
      credentials={credentials}
      onLeave={() => {
        if (unloading.current) return;
        let recorded = false;
        try {
          recorded = credentials.role === "host" && sessionStorage.getItem(RECORDED_FLAG) === "1";
          sessionStorage.removeItem(CREDENTIALS_STORAGE_KEY);
          sessionStorage.removeItem(RECORDED_FLAG);
        } catch {
          // Storage unavailable: nothing to clear.
        }
        if (recorded && credentials.recId && credentials.hostSecret) {
          // Leaving ends any recording in progress; go straight to the download screen.
          void fetch("/api/rooms/recording", {
            method: "POST",
            keepalive: true,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: credentials.code, hostSecret: credentials.hostSecret, action: "stop" }),
          }).catch(() => undefined);
          router.replace(recordingLink(credentials.recId, credentials.hostSecret));
          return;
        }
        router.replace("/");
      }}
    />
  );
}
