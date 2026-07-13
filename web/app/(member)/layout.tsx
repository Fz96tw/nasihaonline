import { QueryProvider } from "@/components/providers/query-provider";
import { MemberSidebar } from "@/components/members/member-sidebar";
import { getSessionUser } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <QueryProvider>
      <div className="flex flex-1">
        <MemberSidebar isAdmin={user?.role === "admin"} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
