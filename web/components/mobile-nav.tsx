"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Handshake,
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MEMBER_NAV_SECTIONS, memberFooterItems, type NavItem as MemberNavItem } from "@/lib/member-nav";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon; restricted?: boolean };

// Mirrors the desktop header's two NavDropdowns (site-header.tsx). Signed-in
// members get a lot more nav below this (Main/Community sections from
// MEMBER_NAV_SECTIONS, plus footer items), so Our Mission collapses into an
// accordion there to keep the sheet short — the sheet's own overflow-y-auto
// (see SheetContent below) is still a backstop, but shouldn't be relied on
// as the primary fix. Guests have far fewer items overall (no member
// sections), so both groups render as one flat list instead — collapsing
// would just add an extra tap before reaching Join/Sign in for no real
// space benefit.
const OUR_MISSION_LINKS: NavLink[] = [
  { href: "/about", label: "About", icon: Info },
  { href: "/getinvolved", label: "Get Involved", icon: Handshake },
  { href: "/our-team", label: "Our Team", icon: Users },
  { href: "/contact", label: "Contact Us", icon: Mail },
];

const COMMUNITY_LINKS: NavLink[] = [
  { href: "/events", label: "Events Calendar", icon: CalendarDays },
  { href: "/blog", label: "Blogs", icon: PenLine },
  { href: "/library", label: "Knowledge Library", icon: BookOpen, restricted: true },
  { href: "/forums", label: "Forums", icon: MessageSquare, restricted: true },
  { href: "/members", label: "Member Directory", icon: Users, restricted: true },
  { href: "/inbox", label: "Message Inbox", icon: Inbox, restricted: true },
];

const SUPPORT_LINK: NavLink = { href: "/donate", label: "Support Us", icon: Heart };

const linkClasses = "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold hover:bg-accent";
// font-sans is load-bearing, not decorative: Radix's AccordionHeader
// (components/ui/accordion.tsx) renders as an <h3>, and globals.css styles
// every heading with the site's heading font (Mulish) instead of body text's
// font (Montserrat) — without this override the trigger's label silently
// renders in a different typeface than every plain link row around it.
const triggerClasses = "rounded-md px-3 py-2 text-sm font-sans font-semibold hover:bg-accent hover:no-underline";

// Renders one MEMBER_NAV_SECTIONS item — a real link, or a disabled "Soon"
// placeholder.
function SectionLink({ item }: { item: MemberNavItem }) {
  const Icon = item.icon;
  if (item.soon) {
    return (
      <div aria-disabled="true" className={`${linkClasses} cursor-not-allowed text-muted-foreground/50`}>
        <Icon className="h-[18px] w-[18px] flex-shrink-0" />
        <span className="truncate">{item.label} · Soon</span>
      </div>
    );
  }
  return (
    <SheetClose asChild>
      <Link href={item.href} className={linkClasses}>
        <Icon className="h-[18px] w-[18px] flex-shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    </SheetClose>
  );
}

function GroupLink({ link, dimmed, indent = true }: { link: NavLink; dimmed: boolean; indent?: boolean }) {
  return (
    <SheetClose asChild>
      <Link
        href={link.href}
        className={cn(linkClasses, indent && "pl-9", dimmed && "justify-between text-muted-foreground")}
      >
        <span className="flex items-center gap-3">
          <link.icon className="h-[18px] w-[18px] flex-shrink-0" />
          <span className="truncate">{link.label}</span>
        </span>
        {dimmed && <KeyRound className="h-3.5 w-3.5 flex-shrink-0" aria-label="Sign-in required" />}
      </Link>
    </SheetClose>
  );
}

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
  // Signed-in members already get the Community links from
  // MEMBER_NAV_SECTIONS' own "Community" section below (Events Calendar,
  // Blogs, Knowledge Library, Forums, Member Directory, Message Inbox), so
  // COMMUNITY_LINKS only renders at all in the guest (flat-list) branch below.
  const topLevelHrefs = new Set([
    ...OUR_MISSION_LINKS.map((link) => link.href),
    ...(signedIn ? [] : COMMUNITY_LINKS.map((link) => link.href)),
    SUPPORT_LINK.href,
  ]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-3/4 flex-col gap-1 overflow-y-auto sm:max-w-xs">
        <SheetHeader>
          {/* Visually hidden, not removed — Radix's Dialog still needs an
              accessible name for screen readers even though sighted users
              don't need a "Menu" label taking up space above a menu they
              just opened via a button already labeled "Open menu". */}
          <SheetTitle className="sr-only">Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          {signedIn ? (
            <Accordion type="single" collapsible className="flex flex-col gap-1">
              <AccordionItem value="mission" className="border-none">
                <AccordionTrigger className={triggerClasses}>
                  <span className="flex items-center gap-3">
                    <Info className="h-[18px] w-[18px] flex-shrink-0" />
                    Our Mission
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-1 pb-1 pt-0">
                  {OUR_MISSION_LINKS.map((link) => (
                    <GroupLink key={link.href} link={link} dimmed={false} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <div className="flex flex-col gap-1">
              {[...OUR_MISSION_LINKS, ...COMMUNITY_LINKS].map((link) => (
                <GroupLink key={link.href} link={link} dimmed={Boolean(link.restricted)} indent={false} />
              ))}
            </div>
          )}

          <SheetClose asChild>
            <Link href={SUPPORT_LINK.href} className={linkClasses}>
              <SUPPORT_LINK.icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">{SUPPORT_LINK.label}</span>
            </Link>
          </SheetClose>

          {signedIn ? (
            <>
              {MEMBER_NAV_SECTIONS.map((section) => {
                const visibleItems = section.items.filter(
                  (item) => item.soon || !topLevelHrefs.has(item.href),
                );
                // Both Main and Community stay flat (never collapsible) —
                // unlike Our Mission above, this is a member's working nav,
                // not overview/marketing content, so it should always be one
                // tap away.
                return (
                  <div key={section.title} className="flex flex-col gap-1">
                    <div className="my-2 border-t" />
                    <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </div>
                    {visibleItems.map((item) => (
                      <SectionLink key={item.label} item={item} />
                    ))}
                  </div>
                );
              })}
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
                  <span className="truncate">Sign in</span>
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
