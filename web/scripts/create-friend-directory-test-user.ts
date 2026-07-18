import "dotenv/config";
import { db } from "@/lib/db";
import { Role, Tier } from "@/lib/generated/prisma/enums";

/**
 * One-off local fixture: a Friend-tier User + Profile, directly in the DB
 * (not via Clerk invitation like scripts/create-test-user.ts), so the
 * Directory's "Friend is listed with its own tier badge, no Send
 * Message/Request Meeting actions" behavior (PRD §2.2/§4.5) can be viewed
 * without waiting on a real signup. clerkUserId is a placeholder — this
 * account can't log in, it's directory-listing only.
 *
 *   npx tsx scripts/create-friend-directory-test-user.ts
 */
async function main() {
  const email = "friend-test-user@example.com";

  const user = await db.user.upsert({
    where: { email },
    update: { tier: Tier.friend, role: Role.member },
    create: {
      email,
      clerkUserId: `test_friend_${Date.now()}`,
      name: "Farah Idris (Friend Test)",
      role: Role.member,
      tier: Tier.friend,
    },
  });

  await db.profile.upsert({
    where: { userId: user.id },
    update: { listInDirectory: true },
    create: {
      userId: user.id,
      titleSpecialty: "Friend of NASIHA",
      countryRegion: "Toronto, Canada",
      bio: "Following NASIHA's events and webinars as a Friend member.",
      listInDirectory: true,
      showSpecialtyLocation: true,
    },
  });

  console.log(`Friend-tier test user ready: ${user.name} <${user.email}> (id: ${user.id}).`);
  console.log("Visit /members to see them listed with the Friend tier badge and no message/meeting actions.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
