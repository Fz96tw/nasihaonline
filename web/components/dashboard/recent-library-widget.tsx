import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Empty state until the Library's browse/search landing (5.5, PRD §10 Phase
// 5) can query recently-published items — submission (5.4) is live, so this
// links out to it in the meantime.
export function RecentLibraryWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recently added to the library</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No resources yet. Once the Knowledge Library launches, newly published resources will show up here.{" "}
          <Link href="/library/new" className="text-primary hover:underline">
            Submit a resource
          </Link>{" "}
          to get started.
        </p>
      </CardContent>
    </Card>
  );
}
