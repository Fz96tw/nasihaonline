"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MEMBER_NAV_SECTIONS, memberFooterItems } from "@/lib/member-nav";

const publicLinks = [
  { href: "/about", label: "About" },
  { href: "/our-team", label: "Our Team" },
  { href: "/events", label: "Events" },
  { href: "/blog", label: "Blog" },
  { href: "/donate", label: "Donate" },
];
const publicHrefs = new Set(publicLinks.map((link) => link.href));

const linkClasses = "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent";

export function MobileNav({
  signedIn,
  isAdmin = false,
  canReviewLibrary = false,
}: {
  signedIn: boolean;
  isAdmin?: boolean;
  canReviewLibrary?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-3/4 flex-col gap-1 overflow-y-auto sm:max-w-xs">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="mt-2 flex flex-col gap-1">
          {publicLinks.map((link) => (
            <SheetClose asChild key={link.href}>
              <Link href={link.href} className={linkClasses}>
                {link.label}
              </Link>
            </SheetClose>
          ))}

          {signedIn ? (
            <>
              {MEMBER_NAV_SECTIONS.map((section) => (
                <div key={section.title} className="flex flex-col gap-1">
                  <div className="my-2 border-t" />
                  <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </div>
                  {section.items
                    .filter((item) => item.soon || !publicHrefs.has(item.href))
                    .map((item) =>
                      item.soon ? (
                        <div
                          key={item.label}
                          aria-disabled="true"
                          className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50"
                        >
                          {item.label} · Soon
                        </div>
                      ) : (
                        <SheetClose asChild key={item.label}>
                          <Link href={item.href} className={linkClasses}>
                            {item.label}
                          </Link>
                        </SheetClose>
                      ),
                    )}
                </div>
              ))}
              <div className="my-2 border-t" />
              {memberFooterItems({ isAdmin, canReviewLibrary }).map((item) => (
                <SheetClose asChild key={item.label}>
                  <Link href={item.href} className={linkClasses}>
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </>
          ) : (
            <>
              <div className="my-2 border-t" />
              <SheetClose asChild>
                <Link href="/sign-in" className={linkClasses}>
                  Log in
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link href="/join" className={`${linkClasses} text-primary`}>
                  Join NASIHA
                </Link>
              </SheetClose>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
