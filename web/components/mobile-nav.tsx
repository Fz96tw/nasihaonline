"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Heart,
  Inbox,
  Info,
  KeyRound,
  LogIn,
  Mail,
  Menu,
  MessageSquare,
  PenLine,
  UserPlus,
  Users,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/about", label: "Our Mission", icon: Info },
  { href: "/our-team", label: "Our Team", icon: Users },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/blog", label: "Blog", icon: PenLine },
  { href: "/library", label: "Knowledge Library", icon: BookOpen, restricted: true },
  { href: "/forums", label: "Forums", icon: MessageSquare, restricted: true },
  { href: "/members", label: "Member Directory", icon: Users, restricted: true },
  { href: "/inbox", label: "Message Inbox", icon: Inbox, restricted: true },
  { href: "/donate", label: "Support Us", icon: Heart },
  { href: "/contact", label: "Contact", icon: Mail },
];
// For signed-in members, Events, Blog, Library, Forums, Member Directory,
// and Message Inbox are dropped from the top-level links to cut clutter —
// Calendar (which supersedes Events), Blogs, the Library, Forums, the
// Member Directory, and the Inbox already live in the member Main/Community
// sections below.
const memberHiddenHrefs = new Set(["/events", "/blog", "/library", "/forums", "/members", "/inbox"]);

const linkClasses = "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold hover:bg-accent";

export function MobileNav({
  signedIn,
  isAdmin = false,
  canModerate = false,
}: {
  signedIn: boolean;
  isAdmin?: boolean;
  canModerate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const topLevelLinks = signedIn
    ? publicLinks.filter((link) => !memberHiddenHrefs.has(link.href))
    : publicLinks;
  const topLevelHrefs = new Set(topLevelLinks.map((link) => link.href));

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
          {topLevelLinks.map((link) => {
            const dimmed = link.restricted && !signedIn;
            return (
              <SheetClose asChild key={link.href}>
                <Link
                  href={link.href}
                  className={cn(linkClasses, dimmed && "justify-between text-muted-foreground")}
                >
                  <span className="flex items-center gap-3">
                    <link.icon className="h-[18px] w-[18px] flex-shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </span>
                  {dimmed && (
                    <KeyRound className="h-3.5 w-3.5 flex-shrink-0" aria-label="Sign-in required" />
                  )}
                </Link>
              </SheetClose>
            );
          })}

          {signedIn ? (
            <>
              {MEMBER_NAV_SECTIONS.map((section) => (
                <div key={section.title} className="flex flex-col gap-1">
                  <div className="my-2 border-t" />
                  <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </div>
                  {section.items
                    .filter((item) => item.soon || !topLevelHrefs.has(item.href))
                    .map((item) => {
                      const Icon = item.icon;
                      return item.soon ? (
                        <div
                          key={item.label}
                          aria-disabled="true"
                          className={`${linkClasses} cursor-not-allowed text-muted-foreground/50`}
                        >
                          <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                          <span className="truncate">{item.label} · Soon</span>
                        </div>
                      ) : (
                        <SheetClose asChild key={item.label}>
                          <Link href={item.href} className={linkClasses}>
                            <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </SheetClose>
                      );
                    })}
                </div>
              ))}
              <div className="my-2 border-t" />
              {canModerate && !isAdmin && (
                <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Action Needed
                </div>
              )}
              {memberFooterItems({ isAdmin, canModerate }).map((item) => {
                const Icon = item.icon;
                return (
                  <SheetClose asChild key={item.label}>
                    <Link href={item.href} className={linkClasses}>
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </SheetClose>
                );
              })}
            </>
          ) : (
            <>
              <div className="my-2 border-t" />
              <SheetClose asChild>
                <Link href="/sign-in" className={linkClasses}>
                  <LogIn className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="truncate">Log in</span>
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link href="/join" className={`${linkClasses} text-primary`}>
                  <UserPlus className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="truncate">Join NASIHA</span>
                </Link>
              </SheetClose>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
