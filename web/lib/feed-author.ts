// Pure builder for the author shown on a What's New feed row — no db, no "@/"
// alias, so it is unit-testable under node:test. The avatar-key-to-URL mapping
// is injected (lib/storage's getProfileAvatarUrl in the app).
import { ORGANIZATION_AVATAR_URL, isSystemUser } from "./system-user-id.ts";

export type FeedAuthorSource = {
  id: string;
  clerkUserId: string;
  name: string | null;
  profile: {
    avatarUrl: string | null;
    titleSpecialty: string | null;
    countryRegion: string | null;
    showSpecialtyLocation: boolean;
  } | null;
};

/**
 * A member's own photo wins. An organizational account with no photo of its
 * own (the Weekly Reflection author) shows the NASIHA logo instead of an
 * initials circle, but keeps its own name and real id. Everyone else with no
 * photo stays null, exactly as before.
 */
export function buildFeedAuthor(user: FeedAuthorSource, avatarUrlFor: (key: string | null) => string | null) {
  const ownAvatar = avatarUrlFor(user.profile?.avatarUrl ?? null);
  return {
    id: user.id,
    name: user.name,
    avatarUrl: ownAvatar ?? (isSystemUser(user) ? ORGANIZATION_AVATAR_URL : null),
    // Same showSpecialtyLocation enforcement as the Directory (lib/members-server.ts).
    titleSpecialty: user.profile?.showSpecialtyLocation ? user.profile.titleSpecialty : null,
    countryRegion: user.profile?.showSpecialtyLocation ? user.profile.countryRegion : null,
  };
}
