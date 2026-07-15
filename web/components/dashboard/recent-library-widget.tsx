import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentlyPublishedKnowledgeItems } from "@/lib/library-server";
import { CONTENT_TYPE_LABELS } from "@/lib/library";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Live recently-published items from KnowledgeItem, replacing the zero-state
// placeholder now that 5.5's browse/search landing exists to query it.
export async function RecentLibraryWidget() {
  const items = await getRecentlyPublishedKnowledgeItems();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recently added to the library</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No resources yet.{" "}
            <Link href="/library/new" className="text-primary hover:underline">
              Submit a resource
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {CONTENT_TYPE_LABELS[item.contentType]} · {formatDate(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/library" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Browse the Library
        </Link>
      </CardContent>
    </Card>
  );
}
