import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumBySlug } from "@/lib/forums-server";
import { NewThreadForm } from "@/components/forums/new-thread-form";
import { CLINICAL_DISCUSSIONS_SLUG } from "@/lib/forums";

export const metadata: Metadata = {
  title: "New Thread — NASIHA",
};

/** /forums/[category]/new (§4.13) — "New Thread" form. */
export default async function NewForumThreadPage({ params }: { params: { category: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const result = await getForumBySlug(params.category, user.id);
  if (!result) notFound();
  const { forum } = result;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Thread in {forum.name}</h1>
      </div>
      <NewThreadForm
        forumId={forum.id}
        forumSlug={forum.slug}
        requireDeidentification={forum.slug === CLINICAL_DISCUSSIONS_SLUG}
      />
    </main>
  );
}
