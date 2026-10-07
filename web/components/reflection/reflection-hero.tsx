import { ReflectionBackdrop } from "@/components/reflection/reflection-backdrop";

/** Hero banner at the top of a Weekly Reflection thread page: the quote, as real text, over the post's image. */
export function ReflectionHero({
  reflection,
}: {
  reflection: { imageUrl: string | null; quote: string; attribution: string };
}) {
  return (
    <ReflectionBackdrop imageUrl={reflection.imageUrl} className="rounded-xl px-6 py-10 sm:px-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Weekly Reflection</p>
      <blockquote className="mt-4 text-3xl font-semibold leading-snug [text-shadow:0_2px_12px_rgba(0,0,0,.6)] sm:text-4xl">
        &ldquo;{reflection.quote}&rdquo;
      </blockquote>
      {reflection.attribution && <p className="mt-4 text-base text-white/90">&mdash; {reflection.attribution}</p>}
    </ReflectionBackdrop>
  );
}
