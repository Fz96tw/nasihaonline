import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  sublabel?: string;
  className?: string;
  /** When set, renders a small link below the sublabel (e.g. through to a full history page). */
  href?: string;
  linkLabel?: string;
}

export function StatCard({ label, value, sublabel, className, href, linkLabel }: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="space-y-1 p-6 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {sublabel ? (
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        ) : null}
        {href ? (
          <Link href={href} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
            {linkLabel ?? "View details"}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
