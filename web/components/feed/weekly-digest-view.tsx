import Link from "next/link";
import { Award, BookOpen, CalendarDays, ClipboardCheck, Lock, MessageCircle, MessageSquare, Users, type LucideIcon } from "lucide-react";
import type { DigestContent, DigestIcon } from "@/lib/weekly-digest-compose";

const ICONS: Record<DigestIcon, LucideIcon> = {
  members: Users,
  library: BookOpen,
  events: CalendarDays,
  forums: MessageSquare,
  reviews: ClipboardCheck,
  replies: MessageCircle,
  hours: Award,
  private: Lock,
};

/**
 * The designed rendering of a weekly digest on its announcement detail page:
 * a row of stat tiles, then one card per section with public items as in-app
 * links. Renders from the structured digestContent saved at generation, which
 * holds only public titles and counts — the same content as the plain-text
 * body, which remains the fallback for old or admin-edited digests.
 */
export function WeeklyDigestView({ content }: { content: DigestContent }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{content.intro}</p>

      {content.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {content.stats.map((stat) => {
            const Icon = ICONS[stat.icon];
            return (
              <div key={`${stat.icon}-${stat.label}`} className="flex flex-col gap-1 rounded-[10px] border bg-card p-4 shadow-sm">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="text-2xl font-bold tracking-tight">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {content.sections.map((section) => {
        const Icon = ICONS[section.icon];
        const muted = section.icon === "private";
        return (
          <section key={section.heading} className="rounded-[10px] border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="text-base font-semibold">{section.heading}</h2>
            </div>
            {section.items && section.items.length > 0 && (
              <ul className="flex flex-col divide-y">
                {section.items.map((item) => (
                  <li key={item.path} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <Link href={item.path} className="text-sm font-medium text-primary hover:underline">
                      {item.title}
                    </Link>
                    {item.meta && <span className="flex-shrink-0 text-xs text-muted-foreground">{item.meta}</span>}
                  </li>
                ))}
              </ul>
            )}
            {section.lines.map((line) => (
              <p key={line} className={`text-sm ${muted || section.items ? "mt-2 text-muted-foreground" : ""}`}>
                {line}
              </p>
            ))}
          </section>
        );
      })}

      <p className="text-sm text-muted-foreground">{content.outro}</p>
    </div>
  );
}
