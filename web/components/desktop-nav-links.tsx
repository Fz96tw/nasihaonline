"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NavDropdown } from "@/components/nav-dropdown";
import { useSearchExpanded } from "@/components/header-search-context";
import { cn } from "@/lib/utils";

/**
 * The desktop "Our Mission"/"Community"/"Support Us" group from the header.
 * Hidden while the header search is expanded — reclaims that width for the
 * growing search input rather than fighting it for space (see
 * header-search-context.tsx).
 */
export function DesktopNavLinks({ signedIn }: { signedIn: boolean }) {
  const { expanded } = useSearchExpanded();
  if (expanded) return null;

  return (
    <div className="hidden items-center gap-3 self-stretch lg:flex">
      <NavDropdown label="Our Mission">
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/about">About</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/getinvolved">Get Involved</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/our-team">Our Team</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/contact">Contact Us</Link>
        </DropdownMenuItem>
      </NavDropdown>
      <NavDropdown label="Community">
        <DropdownMenuItem className="text-base" asChild>
          <Link href={signedIn ? "/calendar" : "/events"}>Events Calendar</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/library" className={cn("justify-between", !signedIn && "text-muted-foreground")}>
            Knowledge Library
            {!signedIn && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/forums" className={cn("justify-between", !signedIn && "text-muted-foreground")}>
            Forums
            {!signedIn && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/review-feedback" className={cn("justify-between", !signedIn && "text-muted-foreground")}>
            Peer Review &amp; Feedback
            {!signedIn && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/members" className={cn("justify-between", !signedIn && "text-muted-foreground")}>
            Member Directory
            {!signedIn && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-base" asChild>
          <Link href="/inbox" className={cn("justify-between", !signedIn && "text-muted-foreground")}>
            Message Inbox
            {!signedIn && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />}
          </Link>
        </DropdownMenuItem>
      </NavDropdown>
      <Button variant="ghost" size="sm" className="text-base font-semibold" asChild>
        <Link href="/donate">Support Us</Link>
      </Button>
    </div>
  );
}
