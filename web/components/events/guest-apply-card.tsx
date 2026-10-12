import { Button } from "@/components/ui/button";

/**
 * Shown to an anonymous event guest once the meeting is over (waiting room
 * after a Nasiha Conference room ends, the "you've left" page, or the
 * "event has ended" page) — their personal /join?gi= link, which prefills
 * the application and records who brought them. Callers only render it
 * when the guest isn't already a member or applicant.
 */
export function GuestApplyCard({ url }: { url: string }) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border p-4 text-left">
      <p className="text-sm font-medium">Enjoyed the session?</p>
      <p className="text-sm text-muted-foreground">
        NASIHA is a member-driven community for sharing knowledge, teaching and peer feedback. Members join sessions like
        this one, host their own, and connect directly with each other.
      </p>
      <div>
        <Button asChild size="sm">
          <a href={url}>Apply to join</a>
        </Button>
      </div>
    </div>
  );
}
