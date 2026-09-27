/**
 * The room's participant list (Showup 24): the pure logic.
 * Turns a snapshot of who is in the LiveKit room into the rows the "People" list shows: every participant by name
 * (camera on or off), who is you and who is the host, mic / camera / speaking state, and, on the host's view, which
 * guests are on the shared-screen overlay. Uses only what LiveKit already shares with everyone in the room.
 */

/** What the list needs to know about one participant, read straight off the LiveKit participant. */
export type ParticipantInfo = {
  identity: string;
  name?: string;
  /** The token's metadata (JSON, set by the server when it minted the token, e.g. `{"role":"host"}`). */
  metadata?: string;
  isLocal: boolean;
  micOn: boolean;
  cameraOn: boolean;
  speaking: boolean;
};

export type PersonRow = {
  id: string;
  /** Shown as the person's name: their name, or "Guest" if they gave none. */
  name: string;
  you: boolean;
  host: boolean;
  micOn: boolean;
  cameraOn: boolean;
  speaking: boolean;
  /** A guest currently on the shared-screen overlay (only set on the host's view). */
  onOverlay: boolean;
};

/** The name shown for someone who gave none. */
export const UNNAMED = "Guest";

/** Display name: trimmed, or "Guest" when empty. */
export function displayName(name: string | undefined | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : UNNAMED;
}

/** The role in a participant's token metadata, or null when it isn't the JSON shape the server writes. */
export function roleOf(metadata: string | undefined | null): string | null {
  if (!metadata) return null;
  try {
    const value: unknown = JSON.parse(metadata);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const role = (value as Record<string, unknown>).role;
      return typeof role === "string" ? role : null;
    }
  } catch {
    // Not JSON: no role.
  }
  return null;
}

/** Lobby participants belong to the lobby room, never the main one; if one ever shows up, it isn't listed. */
function isLobbyRole(role: string | null): boolean {
  return role === "lobby" || role === "lobby-host";
}

const byName = (a: PersonRow, b: PersonRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id);

/**
 * The rows, in the order shown: you first, then the host, then everyone else by name. `viewerIsHost` turns on the
 * overlay tag, which is a host-side detail: `overlayIds` are the participants on the overlay, and the presenter's own
 * row isn't tagged (they are the share).
 */
export function buildRoster(participants: readonly ParticipantInfo[], overlayIds: readonly string[], viewerIsHost: boolean): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const participant of participants) {
    const role = roleOf(participant.metadata);
    if (isLobbyRole(role)) continue;
    const host = role === "host";
    rows.push({
      id: participant.identity,
      name: displayName(participant.name),
      you: participant.isLocal,
      host,
      micOn: participant.micOn,
      cameraOn: participant.cameraOn,
      speaking: participant.speaking,
      onOverlay: viewerIsHost && !host && !participant.isLocal && overlayIds.includes(participant.identity),
    });
  }
  const rank = (row: PersonRow) => (row.you ? 0 : row.host ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

/** A short text that changes exactly when what the list shows changes, so the UI only re-renders then. */
export function rosterSignature(rows: readonly PersonRow[]): string {
  return rows.map((row) => `${row.id}|${row.name}|${+row.you}${+row.host}${+row.micOn}${+row.cameraOn}${+row.speaking}${+row.onOverlay}`).join("\n");
}
