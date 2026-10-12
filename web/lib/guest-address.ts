/**
 * Parses one entry from the host's "Invite by email" box. Accepts a bare
 * address or the familiar `Jane Doe <jane@example.com>` form, so a host can
 * name a guest up front (it prefills the guest's name prompt). Address
 * validation stays with the caller's email schema.
 */
export function parseGuestAddress(raw: string): { email: string; name: string | null } {
  const trimmed = raw.trim();
  const match = /^(.*?)<\s*([^<>\s]+)\s*>$/.exec(trimmed);
  if (!match) return { email: trimmed, name: null };
  const name = match[1].trim().replace(/^["']|["']$/g, "").trim();
  return { email: match[2], name: name ? name.slice(0, 120) : null };
}

/**
 * Splits the invite box's free text into entries: newlines, commas and
 * semicolons always separate; whitespace separates only outside a
 * `Name <email>` entry, so "a@x.com b@y.com" still means two guests.
 */
export function splitGuestAddresses(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .flatMap((piece) => (piece.includes("<") ? [piece] : piece.split(/\s+/)))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** What other meeting participants see for an anonymous guest — never their email. */
export function guestDisplayName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed} (guest)` : "Guest";
}
