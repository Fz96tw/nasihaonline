import { MemberSidebar } from "@/components/members/member-sidebar";
import { getSessionUser } from "@/lib/auth";

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
