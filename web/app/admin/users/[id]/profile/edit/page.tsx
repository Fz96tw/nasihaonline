import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdminUserDetail } from "@/lib/users-server";
import { cityLabel } from "@/lib/cities";
import { getCityById } from "@/lib/cities-server";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { getAllSkills } from "@/lib/skills-server";
import { ProfileForm } from "@/components/profile/profile-form";
import { QueryProvider } from "@/components/providers/query-provider";
import { joinList } from "@/lib/validation/profile";

export const metadata: Metadata = {
  title: "Edit Member Profile",
};

/**
 * Admin-on-behalf-of-a-member profile edit — the same ProfileForm the
 * member sees at /profile, pointed at the admin PATCH routes
 * (app/api/admin/users/[id]/profile[/avatar]) instead of the self-service
 * ones, so an admin can correct a member's profile without needing their
 * credentials. Every save is logged to AdminActionLog (see that route's
 * doc comment) and visible on /admin/activity.
 */
export default async function AdminEditMemberProfilePage({ params }: { params: { id: string } }) {
  const admin = await getSessionUser();
  if (!admin) redirect("/sign-in");

  if (admin.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const target = await getAdminUserDetail(params.id);
  if (!target) notFound();

  const rawProfile = await getOrCreateProfile(target.id);
  const profile = withResolvedAvatarUrl(rawProfile);
  const skills = await getAllSkills();
  const savedCity = getCityById(rawProfile.cityGeonameId);
  const initialCity = savedCity ? { id: savedCity.id, label: cityLabel(savedCity), iso2: savedCity.iso2 } : null;

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-8 p-8">
      <div>
        <Link href={`/admin/users/${target.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to {target.name ?? target.email}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit Profile</h1>
        <p className="text-muted-foreground">
          Editing {target.name ?? target.email}&apos;s profile as an admin. This save is recorded on the
          Activity Log.
        </p>
      </div>

      <QueryProvider>
        <ProfileForm
          email={target.email}
          avatarUrl={profile.avatarUrl}
          availableSkills={skills}
          isOnboarding={false}
          initialCity={initialCity}
          endpoint={`/api/admin/users/${target.id}/profile`}
          avatarEndpoint={`/api/admin/users/${target.id}/profile/avatar`}
          defaultValues={{
            name: target.name ?? "",
            bio: profile.bio ?? "",
            countryRegion: profile.countryRegion ?? "",
            cityId: initialCity ? initialCity.id : null,
            titleSpecialty: profile.titleSpecialty ?? "",
            careerStage: profile.careerStage ?? "",
            linkedinUrl: profile.linkedinUrl ?? "",
            skillIds: profile.skills.map(({ skill }) => skill.id),
            expertiseAreas: joinList(profile.expertiseAreas),
            learningTopics: profile.learningTopics ?? "",
            interestAreas: profile.interestAreas,
            availability: profile.availability,
            openTo: profile.openTo,
            listInDirectory: profile.listInDirectory,
            showSpecialtyLocation: profile.showSpecialtyLocation,
          }}
        />
      </QueryProvider>
    </main>
  );
}
