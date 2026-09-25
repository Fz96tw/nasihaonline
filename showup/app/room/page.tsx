"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShowupRoom } from "@/components/showup-room";
import { CREDENTIALS_STORAGE_KEY, type RoomCredentials } from "@/lib/room-types";

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

  useEffect(() => {
    const found = readCredentials();
    if (!found) {
      router.replace("/");
      return;
    }
    setCredentials(found);
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
        try {
          sessionStorage.removeItem(CREDENTIALS_STORAGE_KEY);
        } catch {
          // Storage unavailable: nothing to clear.
        }
        router.replace("/");
      }}
    />
  );
}
