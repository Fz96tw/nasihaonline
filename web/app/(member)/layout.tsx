import { QueryProvider } from "@/components/providers/query-provider";
import { MemberSidebar } from "@/components/members/member-sidebar";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <div className="flex flex-1">
        <MemberSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
