import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateProfile, getMissingRequiredProfileFields, withResolvedAvatarUrl } from "@/lib/profile-server";
import { getAllSkills } from "@/lib/skills-server";
import { ProfileForm } from "@/components/profile/profile-form";
import { joinList } from "@/lib/validation/profile";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT } from "@/lib/members";

export const metadata: Metadata = {
  title: "My Profile — NASIHA",
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const rawProfile = await getOrCreateProfile(user.id);
  const missingFields = getMissingRequiredProfileFields(rawProfile);
  const profile = withResolvedAvatarUrl(rawProfile);
  const skills = await getAllSkills();

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-8 p-8">
      <div>
        <BackLink fallbackHref="/dashboard" />
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
          {user.tier && (
            <Badge variant={TIER_BADGE_VARIANT[user.tier]}>{DIRECTORY_TIER_LABELS[user.tier]}</Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          This information appears wherever your identity shows up across NASIHA.
        </p>
      </div>

      {missingFields.length > 0 && (
        <div className="rounded-[10px] border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Finish setting up your profile to continue</p>
          <p className="mt-1 text-muted-foreground">
            Your application only asked for the basics. Fill in the following below before you
            can access the rest of NASIHA:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}

      <ProfileForm
        email={user.email}
        avatarUrl={profile.avatarUrl}
        availableSkills={skills}
        defaultValues={{
          name: user.name ?? "",
          bio: profile.bio ?? "",
          countryRegion: profile.countryRegion ?? "",
          titleSpecialty: profile.titleSpecialty ?? "",
          careerStage: profile.careerStage ?? "",
          linkedinUrl: profile.linkedinUrl ?? "",
          skillIds: profile.skills.map(({ skill }) => skill.id),
          expertiseAreas: joinList(profile.expertiseAreas),
          learningTopics: profile.learningTopics ?? "",
          interestAreas: profile.interestAreas,
          availability: profile.availability,
          listInDirectory: profile.listInDirectory,
          showSpecialtyLocation: profile.showSpecialtyLocation,
        }}
      />
    </main>
  );
}
