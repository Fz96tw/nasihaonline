import { MemberSidebar } from "@/components/members/member-sidebar";
import { getSessionUser } from "@/lib/auth";

// Explicit, not just relying on Next's automatic dynamic-API detection: a
// Docker build with no database reachable during the image build step
// hard-fails prerendering the moment getSessionUser()'s DB call executes
// (this layout's own, plus /events page's per-viewer RSVP/community
// filtering), instead of gracefully deferring to request time (objective 4).
export const dynamic = "force-dynamic";

export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) return <>{children}</>;

  return (
    <div className="flex flex-1">
      <MemberSidebar
        isAdmin={user.role === "admin"}
        canModerate={user.role === "moderator" || user.role === "admin"}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
