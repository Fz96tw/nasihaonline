// Shared conduct types (§4.15) — mirrors lib/moderation.ts's split between
// plain, client-safe data shapes (this file) and DB-touching queries
// (lib/conduct-server.ts).

export const CONDUCT_ACTIONS = ["warning", "suspension", "removal"] as const;
export type ConductAction = (typeof CONDUCT_ACTIONS)[number];

export const CONDUCT_ACTION_LABELS: Record<ConductAction, string> = {
  warning: "Warning",
  suspension: "Suspension",
  removal: "Removal",
};

export type ConductNoticeView = {
  id: string;
  description: string;
  actionTaken: ConductAction;
  actionTakenAt: string;
  acknowledgedAt: string | null;
};

export type OpenConductReportView = {
  id: string;
  description: string;
  createdAt: string;
  reportedUser: { id: string; name: string | null; email: string };
  reporter: { id: string; name: string | null; email: string } | null;
  priorViolations: ConductNoticeView[];
};
