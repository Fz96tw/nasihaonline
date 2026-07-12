import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Empty state until the Knowledge Library domain lands (PRD §10 Phase 5).
export function RecentLibraryWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recently added to the library</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No resources yet. Once the Knowledge Library launches, newly
          published resources will show up here.
        </p>
      </CardContent>
    </Card>
  );
}
