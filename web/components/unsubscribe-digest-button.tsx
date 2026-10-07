"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

export function UnsubscribeDigestButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function unsubscribe() {
    setState("working");
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/unsubscribe/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-muted-foreground">You&apos;re unsubscribed — you won&apos;t get these emails anymore.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={unsubscribe} disabled={state === "working"}>
        {state === "working" ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
      {state === "error" && <p className="text-sm text-destructive">Couldn&apos;t unsubscribe. Please try again.</p>}
    </div>
  );
}
