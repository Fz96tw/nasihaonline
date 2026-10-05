/**
 * Caps on guest invitations for an open event. Invites go to strangers from
 * the shared mail.nasihaforyou.org sending domain. Kept in a file with no
 * server-only imports so the host panel's help text can quote the same
 * numbers the server enforces (lib/event-guest-invites-server.ts).
 */
export const MAX_INVITES_PER_REQUEST = 20;
export const MAX_INVITES_PER_EVENT = 50;
export const MAX_INVITES_PER_HOST_PER_DAY = 100;
