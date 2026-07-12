import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Empty state until the Event domain lands (PRD §10 Phase 4).
export function UpcomingEventsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upcoming events</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No events yet. Once the community calendar launches, events you can
          RSVP to will show up here.
        </p>
      </CardContent>
    </Card>
  );
}
