import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  ClipboardCheck,
  MessageSquare,
  PenLine,
  Search,
  Send,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

const ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Write a blog", href: "/blog/new", icon: PenLine },
  { label: "Start a discussion", href: "/forums", icon: MessageSquare },
  { label: "Request a peer review", href: "/review-feedback/new", icon: ClipboardCheck },
  { label: "Schedule an event", href: "/calendar/new", icon: CalendarPlus },
  { label: "Search member directory", href: "/members", icon: Search },
  { label: "Schedule 1-1 meeting", href: "/inbox", icon: Users },
  { label: "Send a direct message", href: "/inbox", icon: Send },
];

/** Dashboard shortcuts into the site's main compose/action flows. */
export function QuickActionsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {ACTIONS.map((action) => (
            <li key={action.label}>
              <Link
                href={action.href}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent hover:underline"
              >
                <action.icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{action.label}</span>
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
