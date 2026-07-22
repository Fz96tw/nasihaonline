import { BookOpen } from "lucide-react";
import { LibraryItemCard } from "@/components/library/library-item-card";
import type { LibraryCard } from "@/lib/library";

/** /members/[memberId]'s Library section (§4.5/§4.9) — this member's published submissions, newest first. */
export function MemberLibraryItems({ items, canEdit }: { items: LibraryCard[]; canEdit: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <BookOpen className="h-4 w-4" />
        Library
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">This member hasn&apos;t contributed to the Library yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <LibraryItemCard key={item.id} item={item} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
