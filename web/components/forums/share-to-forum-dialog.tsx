"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ForumCategory } from "@/lib/forums";

/**
 * "Share target" picker for a finished quick recording (Quick Video
 * Recording & Sharing initiative) — the member's locked-in choice over a
 * fixed default forum. `forums` is the already accessibility-filtered list
 * from getForumCategories (same data the /forums index page uses), not
 * CategoryCheckboxField's KnowledgeCategory/Community data — that backs
 * *topic tagging* within a thread, a different domain from *which forum* to
 * post the thread into.
 */
export function ShareToForumDialog({
  forums,
  open,
  onOpenChange,
  onSelect,
}: {
  forums: Pick<ForumCategory, "id" | "name" | "slug">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (forum: Pick<ForumCategory, "id" | "name" | "slug">) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share to a forum</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {forums.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No forums available.</p>
          ) : (
            forums.map((forum) => (
              <button
                key={forum.id}
                type="button"
                onClick={() => onSelect(forum)}
                className="rounded-md border p-3 text-left text-sm font-medium hover:bg-muted"
              >
                {forum.name}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
