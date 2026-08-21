"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * GET-form search box for /whats-new, matching /library's and
 * /forums/[category]'s submit-on-enter convention (confirmed with user:
 * not live-as-you-type like the old header search or the Member Directory).
 * The one exception is clearing the field back to empty — that auto-
 * submits immediately rather than waiting for another button press, since
 * "go back to the unfiltered feed" isn't really a new search to type and
 * submit, it's undoing the current one.
 */
export function FeedSearchForm({ activeType, q }: { activeType?: string; q?: string }) {
  return (
    <form action="/whats-new" method="get" className="flex gap-2">
      {activeType ? <input type="hidden" name="type" value={activeType} /> : null}
      <Input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search the feed…"
        className="max-w-sm"
        onChange={(event) => {
          if (event.currentTarget.value === "") {
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <Button type="submit" variant="outline" size="icon" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </form>
  );
}
