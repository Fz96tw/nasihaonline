"use client";

import { UserButton } from "@clerk/nextjs";
import { UserCircle } from "lucide-react";

/**
 * Isolated in its own Client Component: inlining UserButton.MenuItems/Link
 * (Clerk's compound-component static properties) directly inside the async
 * Server Component in site-header.tsx hit a Next.js RSC bundler bug
 * ("Could not find the module ... in the React Client Manifest") once a
 * real signed-in session rendered them. Giving the whole subtree its own
 * "use client" boundary resolves it.
 */
export function UserMenu() {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link
          label="Edit Profile"
          labelIcon={<UserCircle className="h-4 w-4" />}
          href="/profile"
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}
