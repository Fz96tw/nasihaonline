"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signInHref } from "@/lib/sign-in-link";

/** "Sign in" button that returns to the current page — a client component because not-found.tsx doesn't receive route params. */
export function SignInToViewLink() {
  const pathname = usePathname();
  return (
    <Button asChild className="mt-2">
      <Link href={signInHref(pathname)}>Sign in</Link>
    </Button>
  );
}
