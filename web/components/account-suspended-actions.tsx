"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function AccountSuspendedActions() {
  const clerk = useClerk();

  return (
    <Button variant="outline" onClick={() => clerk.signOut({ redirectUrl: "/" })}>
      Sign out
    </Button>
  );
}
