import {
  Award,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Flag,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  PenLine,
  Rss,
  Shield,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: false;
};

export type NavItem = NavLink | { label: string; icon: LucideIcon; href?: undefined; soon: true };

export type NavSection = {
  title: string;
  items: NavItem[];
};

// Blogs (§4.8), the full Knowledge Library (§4.9, including 5.5's
// search/browse landing), and Forums (§4.13, live as of 5.6) are all live.
export const MEMBER_NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "What's New", href: "/whats-new", icon: Rss },
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "My Profile", href: "/profile", icon: User },
      { label: "Knowledge Hours", href: "/contributions", icon: Award },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Member Directory", href: "/members", icon: Users },
      { label: "Message Inbox", href: "/inbox", icon: Inbox },
      { label: "Events Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Forums", href: "/forums", icon: MessageSquare },
      { label: "Blogs", href: "/blog", icon: PenLine },
      { label: "Library", href: "/library", icon: BookOpen },
    ],
  },
];

export function memberFooterItems({
  isAdmin,
  canModerate,
}: {
  isAdmin: boolean;
  canModerate: boolean;
}): NavLink[] {
  const items: NavLink[] = [];
  // Admins reach Library Review from the Admin dashboard's own nav card
  // instead — this link is only needed for moderators, who can't see
  // /admin itself (it's gated to role === "admin", see app/admin/page.tsx).
  if (canModerate && !isAdmin) {
    items.push({ label: "Library Review", href: "/admin/library/review-queue", icon: ClipboardCheck });
    items.push({ label: "Content Moderation", href: "/admin/content", icon: Flag });
  }
  if (isAdmin) {
    items.push({ label: "Admin", href: "/admin", icon: Shield });
  }
  return items;
}
