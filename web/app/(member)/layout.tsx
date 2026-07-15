import { redirect } from "next/navigation";
import { QueryProvider } from "@/components/providers/query-provider";
import { MemberSidebar } from "@/components/members/member-sidebar";
import { getSessionUser } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Single choke point for every route under (member): a suspended user
  // (§4.15) is blocked from all of them, without needing each page to check.
  if (user?.suspended) redirect("/account-suspended");

  return (
    <QueryProvider>
      <div className="flex flex-1">
        <MemberSidebar
          isAdmin={user?.role === "admin"}
          canReviewLibrary={user?.role === "moderator" || user?.role === "admin"}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
