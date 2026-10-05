import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { MessageMemberButton } from "@/components/members/message-member-button";
import { FollowMemberButton } from "@/components/members/follow-member-button";
import { memberLocation } from "@/lib/cities";
import type { DirectoryMember } from "@/lib/members";

const MAX_SHOWN = 12;

/**
 * Post-event list of the other members who took part (see
 * getPeopleYouMetAtEvent for who qualifies and the privacy gate), each with
 * a one-click Message. Renders nothing when there's nobody to show.
 */
export function PeopleYouMet({ members }: { members: DirectoryMember[] }) {
  if (members.length === 0) return null;

  const shown = members.slice(0, MAX_SHOWN);
  const rest = members.length - shown.length;

  return (
    <section aria-labelledby="people-you-met" className="border-t pt-8">
      <h2 id="people-you-met" className="text-lg font-semibold">
        People you met here
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Others who took part in this event — a good moment to say hello.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((member) => {
          const name = member.name ?? "NASIHA Member";
          const subtitle = [member.titleSpecialty, memberLocation(member)].filter(Boolean).join(" · ");
          return (
            <li key={member.id} className="flex items-center justify-between gap-3 rounded-[10px] border p-3">
              <Link
                href={`/members/${member.id}`}
                aria-label={`View ${name}'s profile`}
                className="flex min-w-0 items-center gap-2.5"
              >
                <Avatar name={name} src={member.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold hover:underline">{name}</div>
                  {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
                </div>
              </Link>
              <div className="flex flex-shrink-0 items-center gap-2">
                <FollowMemberButton memberId={member.id} memberName={name} />
                <MessageMemberButton memberId={member.id} memberName={name} />
              </div>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          and {rest} more — find them in the{" "}
          <Link href="/members" className="underline">
            Member Directory
          </Link>
          .
        </p>
      )}
    </section>
  );
}
