import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { getAllSkills } from "@/lib/skills-server";
import { ProfileForm } from "@/components/profile/profile-form";
import { joinList } from "@/lib/validation/profile";

export const metadata: Metadata = {
  title: "My Profile — Nasiha",
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const profile = withResolvedAvatarUrl(await getOrCreateProfile(user.id));
  const skills = await getAllSkills();

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">
          This information appears wherever your identity shows up across Nasiha.
        </p>
      </div>

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
          skillIds: profile.skills.map(({ skill }) => skill.id),
          expertiseAreas: joinList(profile.expertiseAreas),
          learningTopics: joinList(profile.learningTopics),
          listInDirectory: profile.listInDirectory,
          showSpecialtyLocation: profile.showSpecialtyLocation,
        }}
      />
    </main>
  );
}
