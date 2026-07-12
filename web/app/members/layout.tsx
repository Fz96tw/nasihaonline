import { QueryProvider } from "@/components/providers/query-provider";

export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
