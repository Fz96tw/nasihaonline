import Link from "next/link";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";

export type ActivitySection = {
  eyebrow: string;
  title: string;
  body: string;
};

export type ActivityLink = {
  label: string;
  href: string;
};

export function ActivityDetailPage({
  image,
  eyebrow,
  title,
  intro,
  sections,
  links,
}: {
  image: string;
  eyebrow: string;
  title: string;
  intro: string;
  sections: ActivitySection[];
  links: ActivityLink[];
}) {
  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src={image} priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <BackLink
            fallbackHref="/about"
            className="mb-4 inline-flex items-center gap-1 text-sm text-primary-foreground/80 hover:text-primary-foreground hover:underline"
          />
          <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-[#93c5fd]">
            {eyebrow}
          </p>
          <h1 className="mb-4 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">
            {title}
          </h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            {intro}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[760px] px-8 py-16">
        <div className="flex flex-col gap-6">
          {sections.map((section, index) => (
            <Reveal key={section.title} index={index}>
              <div className="flex flex-col gap-1.5 rounded-[10px] border bg-card p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[.08em] text-primary">
                  {section.eyebrow}
                </p>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="leading-[1.8] text-muted-foreground">{section.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <p className="mb-3 text-lg font-bold text-primary">Get Involved</p>
          <p className="mb-5 leading-[1.7] text-foreground/80">
            Ready to take part? Here&rsquo;s where this happens on NASIHA.
          </p>
          <div className="flex flex-wrap gap-3">
            {links.map((link) => (
              <Button key={link.href} variant="outline" asChild>
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
            <Button asChild>
              <Link href="/getinvolved">Get Involved</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
