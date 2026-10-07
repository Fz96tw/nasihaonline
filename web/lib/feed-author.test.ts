import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { buildFeedAuthor, type FeedAuthorSource } from "./feed-author.ts";
import { ORGANIZATION_AVATAR_URL } from "./system-user-id.ts";

// Same mapping as lib/storage's getProfileAvatarUrl.
const avatarUrlFor = (key: string | null) => (key ? `/api/profile/photo/${key}` : null);

function user(overrides: Partial<FeedAuthorSource> & { avatarKey?: string | null } = {}): FeedAuthorSource {
  const { avatarKey = null, ...rest } = overrides;
  return {
    id: "u1",
    clerkUserId: "user_2abc",
    name: "Real Member",
    profile: { avatarUrl: avatarKey, titleSpecialty: "Teacher", countryRegion: "Canada", showSpecialtyLocation: true },
    ...rest,
  };
}

const weeklyReflection = (avatarKey: string | null = null) =>
  user({ id: "sys1", clerkUserId: "system:weekly-reflection", name: "NASIHA Weekly Reflection", avatarKey });

describe("buildFeedAuthor", () => {
  it("shows the NASIHA logo, the account's own name and its real id for the Weekly Reflection system user", () => {
    const author = buildFeedAuthor(weeklyReflection(), avatarUrlFor);
    assert.equal(author.avatarUrl, ORGANIZATION_AVATAR_URL);
    assert.equal(author.name, "NASIHA Weekly Reflection");
    assert.equal(author.id, "sys1");
  });

  it("leaves real members unchanged: their own avatar, or null when they have none", () => {
    assert.equal(buildFeedAuthor(user({ avatarKey: "avatars/abc.jpg" }), avatarUrlFor).avatarUrl, "/api/profile/photo/avatars/abc.jpg");
    assert.equal(buildFeedAuthor(user(), avatarUrlFor).avatarUrl, null);
    assert.equal(buildFeedAuthor(user({ profile: null }), avatarUrlFor).avatarUrl, null);
  });

  it("lets a system account keep an avatar it has been given", () => {
    assert.equal(buildFeedAuthor(weeklyReflection("avatars/org.png"), avatarUrlFor).avatarUrl, "/api/profile/photo/avatars/org.png");
  });

  it("still honors showSpecialtyLocation for everyone", () => {
    const hidden = user({ profile: { avatarUrl: null, titleSpecialty: "Teacher", countryRegion: "Canada", showSpecialtyLocation: false } });
    const author = buildFeedAuthor(hidden, avatarUrlFor);
    assert.equal(author.titleSpecialty, null);
    assert.equal(author.countryRegion, null);
    assert.equal(buildFeedAuthor(user(), avatarUrlFor).titleSpecialty, "Teacher");
  });

  it("points at a logo file that really exists in public/", () => {
    assert.ok(existsSync(new URL(`../public${ORGANIZATION_AVATAR_URL}`, import.meta.url)), ORGANIZATION_AVATAR_URL);
  });
});
