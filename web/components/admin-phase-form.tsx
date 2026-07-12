"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdmissionPhase } from "@/lib/generated/prisma/enums";
import { ADMISSION_PHASE_LABELS } from "@/lib/admission-phase";
import { getCsrfToken } from "@/lib/csrf-client";

export function AdminPhaseForm({ currentPhase }: { currentPhase: AdmissionPhase }) {
  const router = useRouter();
  const [phase, setPhase] = useState<AdmissionPhase>(currentPhase);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ admissionPhase: phase }),
      });
      if (!res.ok) throw new Error("Failed to update admission phase");
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Admission Phase</h2>
        <p className="text-sm text-muted-foreground">
          Controls the &ldquo;Current Phase&rdquo; copy shown publicly and whether the
          /join form requires a professional reference.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Select value={phase} onValueChange={(value) => setPhase(value as AdmissionPhase)}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(AdmissionPhase).map((value) => (
              <SelectItem key={value} value={value}>
                {ADMISSION_PHASE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={saving || phase === currentPhase}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
