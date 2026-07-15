import {
  Award,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  PenLine,
  Settings,
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
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "My Profile", href: "/profile", icon: User },
      { label: "Knowledge Hours", href: "/contributions", icon: Award },
      { label: "Inbox", href: "/inbox", icon: Inbox },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Member Directory", href: "/members", icon: Users },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Forums", href: "/forums", icon: MessageSquare },
      { label: "Blogs", href: "/blog", icon: PenLine },
    ],
  },
  {
    title: "Knowledge",
    items: [{ label: "Library", href: "/library", icon: BookOpen }],
  },
];

export function memberFooterItems({
  isAdmin,
  canReviewLibrary,
}: {
  isAdmin: boolean;
  canReviewLibrary: boolean;
}): NavLink[] {
  const items: NavLink[] = [];
  if (canReviewLibrary) {
    items.push({ label: "Library Review", href: "/admin/library/review-queue", icon: ClipboardCheck });
  }
  if (isAdmin) {
    items.push({ label: "Admin", href: "/admin", icon: Shield });
  }
  items.push({ label: "Settings", href: "/settings", icon: Settings });
  return items;
}
