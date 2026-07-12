import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  sublabel?: string;
  className?: string;
}

export function StatCard({ label, value, sublabel, className }: StatCardProps) {
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
      </CardContent>
    </Card>
  );
}
