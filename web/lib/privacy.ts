// Shared privacy types (§4.15) — mirrors lib/conduct.ts's split between
// plain, client-safe data shapes (this file) and DB-touching queries
// (lib/privacy-server.ts).

export const PRIVACY_REQUEST_TYPES = ["export", "deletion"] as const;
export type PrivacyRequestTypeValue = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_TYPE_LABELS: Record<PrivacyRequestTypeValue, string> = {
  export: "Data export",
  deletion: "Account deletion",
};

export const PRIVACY_REQUEST_STATUSES = ["pending", "fulfilled", "rejected"] as const;
export type PrivacyRequestStatusValue = (typeof PRIVACY_REQUEST_STATUSES)[number];

export type PrivacyRequestView = {
  id: string;
  type: PrivacyRequestTypeValue;
  status: PrivacyRequestStatusValue;
  requestedAt: string;
  fulfilledAt: string | null;
};

export type OpenPrivacyRequestView = PrivacyRequestView & {
  user: { id: string; name: string | null; email: string };
  /**
   * True when the member has ContributionLedger and/or authored content
   * (Blog, Library, Forum). Those rows are never deleted or hidden by a
   * fulfilled deletion request (§4.4's immutable ledger) — only profile PII
   * can be deleted/anonymized.
   */
  hasRetainedHistory: boolean;
};
