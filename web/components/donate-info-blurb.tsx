/**
 * Nonprofit/tax-deductible status + fund-usage copy shown above both
 * donation entry points (/donate and /getinvolved's "Support Us" tab —
 * components/getinvolved/get-involved-tabs.tsx). Kept as one shared
 * component rather than duplicated text so the two stay in sync.
 */
export function DonateInfoBlurb() {
  return (
    <div className="text-base leading-relaxed text-foreground">
      <p>
        NASIHA is a registered 501(c)(3) nonprofit organization, and your donation is
        tax-deductible to the fullest extent allowed by law. You&rsquo;ll receive a receipt
        from Stripe for your records.
      </p>
      <p className="mt-4">
        Donations fund the day-to-day costs of keeping NASIHA free and open to every
        member — hosting and platform infrastructure, live events, and community programs
        like mentorship, peer review, and outreach to bring in new contributors. We
        maintain transparent financial records and operate within a budget approved by
        our Board of Directors, so every gift goes directly toward strengthening the
        community.
      </p>
    </div>
  );
}
