"use client";

import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { UserCircle, Settings, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * The nav's identity element is our own Avatar (Profile.avatarUrl / brand-color
 * initials — the data the rest of the app, e.g. the Directory, reads from),
 * not Clerk's UserButton avatar. This menu is how the two account surfaces
 * stay reachable without duplicating each other in the nav: "App Profile"
 * goes to our own /profile, "Manage Clerk Account" opens Clerk's hosted
 * account modal on demand (openUserProfile), and Sign out lives here too
 * since UserButton (which used to provide it) is no longer in the nav.
 */
export function UserMenu({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const clerk = useClerk();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Avatar name={name} src={avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => router.push("/profile")}>
          <UserCircle className="h-4 w-4" />
          App Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => clerk.openUserProfile()}>
          <Settings className="h-4 w-4" />
          Manage Clerk Account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => clerk.signOut({ redirectUrl: "/sign-in" })}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
