import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const WEEKLY_REFLECTION_NAV = [
  { href: "/admin/weekly-reflection", label: "Schedule & next post" },
  { href: "/admin/weekly-reflection/quotes", label: "Quote pool" },
  { href: "/admin/weekly-reflection/message", label: "Post message" },
] as const;

/**
 * Admin gate shared by the three Weekly Reflection pages, same behavior as the
 * other admin pages: signed-out visitors go to sign-in, signed-in non-admins
 * see Forbidden without any admin content (or data) being loaded. Returns the
 * Forbidden element to render, or null when the caller may proceed.
 */
export async function weeklyReflectionAdminGate(): Promise<React.ReactElement | null> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role === "admin") return null;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
      <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
    </main>
  );
}

/** Heading and section nav shared by the three pages. */
export function WeeklyReflectionShell({
  current,
  description,
  children,
}: {
  current: (typeof WEEKLY_REFLECTION_NAV)[number]["href"];
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Weekly Reflection</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <nav aria-label="Weekly Reflection sections" className="flex flex-wrap gap-2">
        {WEEKLY_REFLECTION_NAV.map((item) => (
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
