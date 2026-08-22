import { LibraryItemCard } from "@/components/library/library-item-card";
import type { LibraryCard } from "@/lib/library";

/** /members/[memberId]'s Library tab (§4.5/§4.9) — this member's published submissions, newest first. */
export function MemberLibraryItems({ items, canEdit }: { items: LibraryCard[]; canEdit: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">This member hasn&apos;t contributed to the Library yet.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <LibraryItemCard key={item.id} item={item} canEdit={canEdit} />
      ))}
    </div>
  );
}
