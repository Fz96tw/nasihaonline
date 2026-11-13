import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const CURATED_ARTICLES_NAV = [
  { href: "/admin/curated-articles", label: "Review queue" },
  { href: "/admin/curated-articles/sources", label: "Sources" },
] as const;

/**
 * Admin gate shared by the From the Web pages — same behavior as
 * weeklyReflectionAdminGate: signed-out visitors go to sign-in, signed-in
 * non-admins see Forbidden without any admin data being loaded.
 */
export async function curatedArticlesAdminGate(): Promise<React.ReactElement | null> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role === "admin" && !user.suspended) return null;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
      <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
    </main>
  );
}

export function CuratedArticlesShell({
  current,
  description,
  children,
}: {
  current: (typeof CURATED_ARTICLES_NAV)[number]["href"];
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">From the Web</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <nav aria-label="From the Web sections" className="flex flex-wrap gap-2">
        {CURATED_ARTICLES_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.href === current ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${
              item.href === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
