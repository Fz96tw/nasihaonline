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
  /** Host only. Id of this meeting's recording (which exists once the host first records). */
  recId?: string;
  /** Guest only. True while `token` is a lobby token (camera-only, no access to the meeting) rather than a main-room token. */
  lobby?: boolean;
  /** Guest in the lobby only. Presented with `identity` to /api/rooms/lobby/redeem to collect an approval. */
  lobbySecret?: string;
  /** Host only. Four-word passcode shown once at start; with the code it recovers the recording if the link is lost. */
  passcode?: string;
};

/** Metadata LiveKit pushes to everyone in the room (see RoomMetadata in lib/livekit.ts); read by the recording banner. */
export type RoomRecordingMetadata = { recording: boolean; egressId: string | null };

/** localStorage key for the host's saved recording links on this device. */
export const SAVED_RECORDINGS_KEY = "showup:recordings";
export type SavedRecording = { recId: string; hostSecret: string; code: string; savedAt: number };

/** sessionStorage key the landing page writes and the room page reads. Per-tab, so a second tab never inherits a meeting. */
export const CREDENTIALS_STORAGE_KEY = "showup:credentials";

/** Data message the server sends a lobby guest on the "lobby" topic when the host decides. */
export type LobbyMessage = { type: "approved" | "rejected" };
export const LOBBY_TOPIC = "lobby";
