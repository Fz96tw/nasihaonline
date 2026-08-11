"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import type { PendingVolunteerOffer } from "@/lib/review";

/**
 * Submitter-only panel on a `seekingReviewers` item's detail page — lists
 * every pending volunteer offer with Accept/Decline. Accept converts the
 * offer into a real reviewer (same treatment as a direct invite); decline
 * notifies the volunteer gently.
 */
export function VolunteerOffersPanel({ itemId, initialOffers }: { itemId: string; initialOffers: PendingVolunteerOffer[] }) {
  const router = useRouter();
  const [offers, setOffers] = useState(initialOffers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(offerId: string, action: "accept" | "decline") {
    setPendingId(offerId);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/volunteer-offers/${offerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setOffers((current) => current.filter((offer) => offer.id !== offerId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (offers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-sm font-semibold">Volunteer Offers ({offers.length})</h2>
      <ul className="flex flex-col divide-y">
        {offers.map((offer) => (
          <li key={offer.id} className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2">
              <Avatar name={offer.name ?? "Member"} src={offer.avatarUrl} size="xs" />
              <div>
                <p className="text-sm font-medium">{offer.name ?? "A member"}</p>
                {offer.note && <p className="text-xs text-muted-foreground">{offer.note}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={pendingId === offer.id} onClick={() => respond(offer.id, "accept")}>
                Accept
              </Button>
              <Button size="sm" variant="outline" disabled={pendingId === offer.id} onClick={() => respond(offer.id, "decline")}>
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
