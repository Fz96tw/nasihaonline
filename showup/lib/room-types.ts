/** Safe to import from client components (no server-only dependency). */

/** What /api/rooms/start and /api/rooms/join return on success; the room page reads it back from sessionStorage. */
export type RoomCredentials = {
  token: string;
  serverUrl: string;
  role: "host" | "guest";
  identity: string;
  /** Normalized code, shown in the in-meeting banner. */
  code: string;
  /** Display name, kept so the host can reclaim the meeting after a refresh without re-asking. */
  name: string;
  /** Host only. Proves this tab started the meeting; presented to /api/rooms/start to reclaim host. Never sent to guests. */
  hostSecret?: string;
};

/** sessionStorage key the landing page writes and the room page reads. Per-tab, so a second tab never inherits a meeting. */
export const CREDENTIALS_STORAGE_KEY = "showup:credentials";
