import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getCityById } from "@/lib/cities-server";
import { resolveCountry } from "@/lib/country-centroids";
import { db } from "@/lib/db";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { profilePatchSchema } from "@/lib/validation/profile";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const profile = await getOrCreateProfile(user.id);

  return NextResponse.json({
    user: { name: user.name, email: user.email },
    profile: withResolvedAvatarUrl(profile),
  });
}

export async function PATCH(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existingProfile = await getOrCreateProfile(user.id);

  // Members can only attach existing catalog skills (§4.3/§7.3), not create
  // new ones inline — reject anything that isn't a real Skill id rather than
  // silently dropping it.
  const skillIds = Array.from(new Set(parsed.data.skillIds));
  const validSkills = await db.skill.findMany({ where: { id: { in: skillIds } } });
  if (validSkills.length !== skillIds.length) {
    return NextResponse.json({ error: "One or more selected skills are invalid." }, { status: 400 });
  }

  // The client only sends the picked city's id; the name is resolved here so it
  // can't drift from the bundled list, and a city that contradicts the stated
  // country is rejected rather than plotted somewhere the member didn't mean.
  const city = parsed.data.cityId == null ? null : getCityById(parsed.data.cityId);
  if (parsed.data.cityId != null) {
    if (!city) return NextResponse.json({ error: "That city isn't recognized. Please pick one from the list." }, { status: 400 });
    const country = resolveCountry(parsed.data.countryRegion);
    if (country && country.iso2 !== city.iso2) {
      return NextResponse.json({ error: "The selected city isn't in the country you entered." }, { status: 400 });
    }
  }

  const [, , profile] = await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { name: parsed.data.name } }),
    db.profileSkill.deleteMany({
      where: { profileId: existingProfile.id, skillId: { notIn: skillIds } },
    }),
    db.profile.update({
      where: { userId: user.id },
      data: {
        bio: parsed.data.bio,
        countryRegion: parsed.data.countryRegion,
        city: city?.name ?? null,
        cityGeonameId: city?.id ?? null,
        titleSpecialty: parsed.data.titleSpecialty,
        careerStage: parsed.data.careerStage,
        linkedinUrl: parsed.data.linkedinUrl || null,
        expertiseAreas: parsed.data.expertiseAreas,
        learningTopics: parsed.data.learningTopics,
        interestAreas: parsed.data.interestAreas,
        availability: parsed.data.availability,
        listInDirectory: parsed.data.listInDirectory,
        showSpecialtyLocation: parsed.data.showSpecialtyLocation,
        skills: {
          createMany: {
            data: skillIds.map((skillId) => ({ skillId })),
            skipDuplicates: true,
          },
        },
      },
      include: { skills: { include: { skill: true } }, communities: { include: { community: true } } },
    }),
  ]);

  await enqueueProfileIndexSync(user.id);

  return NextResponse.json({
    user: { name: parsed.data.name, email: user.email },
    profile: withResolvedAvatarUrl(profile),
  });
}
